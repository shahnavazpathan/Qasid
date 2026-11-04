// Allotment list, registrar health and PAN checks
const { registrars, getRegistrar } = require("../lib/registrars");
const { mapWithConcurrency } = require("../lib/http");
const { fetchLiveIpoList, currentIpoList, ipoListAge, getRegistrarStatus } = require("../services/ipoList.service");
const { checkOnePan } = require("../services/allotmentCheck.service");

async function listIpos(req, res) {
  try {
    const ipos = await currentIpoList();
    res.json({ success: true, total: ipos.length, ipos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

function listRegistrars(req, res) {
  res.json({
    success: true,
    registrars: registrars.map(r => ({
      id: r.id,
      label: r.label,
      website: r.website,
      status: getRegistrarStatus(r.id),
      servers: r.getServerStatus ? r.getServerStatus() : undefined
    }))
  });
}

async function checkPans(req, res) {
  try {
    const { clientId, source, pans } = req.body || {};
    if (!clientId) return res.status(400).json({ success: false, error: "Please select an IPO." });
    if (!Array.isArray(pans) || pans.length === 0) return res.status(400).json({ success: false, error: "Please enter at least one PAN." });
    if (pans.length > 50) return res.status(400).json({ success: false, error: "Maximum 50 PANs at once." });

    // `source` disambiguates registrars that reuse the same numeric IDs; older clients only send clientId
    const find = list => list.find(ipo => ipo.clientId === String(clientId) && (!source || ipo.source === source));
    let selectedIpo = find(await currentIpoList());
    // A just-published allotment may not be in the saved list yet: refresh it (at most once a minute)
    if (!selectedIpo) selectedIpo = find(await fetchLiveIpoList(ipoListAge() > 60 * 1000));
    if (!selectedIpo) return res.status(400).json({ success: false, error: "Invalid IPO selected." });

    const registrar = getRegistrar(selectedIpo.source);
    const uniquePans = [...new Set(pans.map(p => String(p).trim().toUpperCase()))];
    // The service worker's automatic check on an allotment alert is background work: it waits behind
    // people checking in the app. Once the caller hangs up, its queued lookups are dropped.
    let gone = false;
    res.on("close", () => { gone = true; });
    const opts = { background: req.body.background === true, alive: () => !gone };
    const results = await mapWithConcurrency(uniquePans, registrar.concurrency || 3, pan => checkOnePan(selectedIpo, registrar, pan, opts));

    return res.json({ success: true, total: results.length, ipo: { name: selectedIpo.name, source: selectedIpo.source, registrar: registrar.label, retired: !!selectedIpo.retired }, results });
  } catch (error) {
    console.error("[CHECK] Error:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

module.exports = { listIpos, listRegistrars, checkPans };
