// Merged allotment list across all registrars: caching, last-good fallback, "new" detection and push alerts.
const { registrars } = require("../lib/registrars");
const market = require("../lib/market");
const storeLib = require("../lib/store");
const push = require("../lib/push");
const allotments = require("../lib/allotments");

const IPO_CACHE_TIME = 5 * 60 * 1000;
let ipoCache = { data: null, fetchedAt: 0 };
let ipoFetchInProgress = null;

// Last good list per registrar (persisted), so a registrar that is down - even right after a
// restart/redeploy - still shows its allotments instead of dropping them from the list.
const lastGoodLists = new Map();
const registrarStatus = new Map();

// IPOs a registrar has dropped from its list ("retired"). They stay selectable for a while, answered from
// the result archive (lib/resultArchive.js), since the registrar no longer has the data.
const RETIRED_KEY = "retiredIpos";
const RETIRED_KEEP_MS = 120 * 864e5;
const MAX_RETIRED_AT_ONCE = 15;          // more vanishing at once means a broken page, not retirements
let retiredIpos = new Map();             // identity -> ipo (with retired: true, retiredAt)

function ipoIdentity(ipo) { return `${ipo.source}:${ipo.clientId}`; }

async function loadSavedLists() {
  await Promise.all(registrars.map(async r => {
    const saved = await storeLib.store().getConfig(`lastList:${r.id}`).catch(() => null);
    if (Array.isArray(saved) && saved.length) lastGoodLists.set(r.id, saved);
  }));
  const retired = await storeLib.store().getConfig(RETIRED_KEY).catch(() => null);
  if (Array.isArray(retired)) retiredIpos = new Map(retired.map(ipo => [ipoIdentity(ipo), ipo]));
}

function trackRetirements(registrar, previous, current) {
  const now = Date.now();
  const listed = new Set(current.map(ipoIdentity));
  const dropped = (previous || []).filter(ipo => !listed.has(ipoIdentity(ipo)));
  let changed = false;

  if (dropped.length > MAX_RETIRED_AT_ONCE) {
    console.warn(`[${registrar.tag}] ${dropped.length} IPOs vanished at once - not treated as retired`);
  } else {
    for (const ipo of dropped) {
      retiredIpos.set(ipoIdentity(ipo), { ...ipo, retired: true, retiredAt: now });
      console.log(`[ALLOTMENTS] Retired: ${ipo.name}`);
      changed = true;
    }
  }
  for (const id of listed) if (retiredIpos.delete(id)) changed = true;
  for (const [id, ipo] of retiredIpos) {
    if (now - ipo.retiredAt > RETIRED_KEEP_MS) { retiredIpos.delete(id); changed = true; }
  }
  if (changed) storeLib.store().setConfig(RETIRED_KEY, [...retiredIpos.values()]).catch(() => {});
}

async function fetchRegistrarIpos(registrar) {
  const startedAt = Date.now();
  try {
    const ipos = (await registrar.listIpos()).map(ipo => ({
      ...ipo,
      name: `[${registrar.tag}] ${ipo.name}`,
      clientId: String(ipo.clientId),
      source: registrar.id,
      registrar: registrar.label
    }));
    if (ipos.length === 0) throw new Error("empty IPO list - page format may have changed");
    // Registrar pages already list newest first; only registrars with sequential IDs are re-sorted by ID
    if (registrar.sortById) ipos.sort((a, b) => (parseInt(b.clientId, 10) || 0) - (parseInt(a.clientId, 10) || 0));
    const previous = lastGoodLists.get(registrar.id);
    lastGoodLists.set(registrar.id, ipos);
    trackRetirements(registrar, previous, ipos);
    if (!previous || previous.map(ipoIdentity).join() !== ipos.map(ipoIdentity).join()) {
      storeLib.store().setConfig(`lastList:${registrar.id}`, ipos).catch(() => {});
    }
    registrarStatus.set(registrar.id, { ok: true, count: ipos.length, ms: Date.now() - startedAt, at: Date.now() });
    return { registrarId: registrar.id, ok: true, ipos };
  } catch (err) {
    console.error(`[${registrar.tag}] Failed to fetch IPO list:`, err.message);
    registrarStatus.set(registrar.id, { ok: false, error: err.message, ms: Date.now() - startedAt, at: Date.now() });
    return { registrarId: registrar.id, ok: false, ipos: lastGoodLists.get(registrar.id) || [] };
  }
}

// name -> allotment date (falls back to listing/close date) using the IPO board; unknown -> null
async function allotmentDateLookup() {
  let board;
  try { board = await market.getBoard(); } catch { return () => null; }
  const dates = new Map();
  for (const item of ["open", "closed", "listed", "upcoming"].flatMap(s => board[s] || [])) {
    const date = item.allotmentDate || item.listingDate || item.closeDate;
    if (date) dates.set(market.normName(item.name), date);
  }
  const keys = [...dates.keys()];
  return name => {
    const key = market.normName(String(name).replace(/^\[[^\]]+\]\s*/, ""));
    if (!key) return null;
    if (dates.has(key)) return dates.get(key);
    const hits = keys.filter(k => Math.min(k.length, key.length) >= 6 && (k.startsWith(key) || key.startsWith(k)));
    return hits.length === 1 ? dates.get(hits[0]) : null;
  };
}

// An allotment counts as "new" in the app for this long after Qasid first saw it published
const NEW_FOR_MS = 48 * 3600e3;

async function fetchLiveIpoList(forceRefresh = false) {
  if (!forceRefresh && ipoCache.data && Date.now() - ipoCache.fetchedAt < IPO_CACHE_TIME) return ipoCache.data;
  if (ipoFetchInProgress) return ipoFetchInProgress;

  ipoFetchInProgress = (async () => {
    try {
      const rounds = await Promise.all(registrars.map(fetchRegistrarIpos));
      const merged = rounds.flatMap(r => r.ipos).map(ipo => ({ ...ipo }));
      const registrarOrder = new Map(registrars.map((r, i) => [r.id, i]));
      // Position within its own registrar's list (each list is newest-first) - used to interleave registrars
      const rankInRegistrar = new Map(rounds.flatMap(r => r.ipos.map((ipo, i) => [ipoIdentity(ipo), i])));
      const allotmentDates = await allotmentDateLookup();

      // Persisted first-seen registry decides what is genuinely new (see lib/allotments.js)
      const fresh = await allotments.update(rounds, ipo => allotmentDates(ipo.name)).catch(err => {
        console.error("[ALLOTMENTS] update failed:", err.message);
        return [];
      });

      const now = Date.now();
      merged.forEach(ipo => {
        ipo.allotmentDate = allotmentDates(ipo.name);
        ipo.discoveredAt = allotments.firstSeen(ipo);
        ipo.isNew = ipo.discoveredAt > 0 && now - ipo.discoveredAt < NEW_FOR_MS;
      });

      // Latest allotment first, regardless of registrar:
      // 1. allotments published in the last 48h (as observed by Qasid), newest first
      // 2. then by allotment date from the IPO board, newest first (unknown dates last)
      // 3. then interleave registrars by each one's own newest-first order
      merged.sort((a, b) => {
        const newA = a.isNew ? a.discoveredAt : 0;
        const newB = b.isNew ? b.discoveredAt : 0;
        if (newA !== newB) return newB - newA;
        const dateDiff = String(b.allotmentDate || "").localeCompare(String(a.allotmentDate || ""));
        if (dateDiff) return dateDiff;
        const rankDiff = rankInRegistrar.get(ipoIdentity(a)) - rankInRegistrar.get(ipoIdentity(b));
        if (rankDiff) return rankDiff;
        return registrarOrder.get(a.source) - registrarOrder.get(b.source);
      });

      // Retired IPOs go last, most recently retired first
      const listed = new Set(merged.map(ipoIdentity));
      const retired = [...retiredIpos.values()]
        .filter(ipo => !listed.has(ipoIdentity(ipo)))
        .sort((a, b) => b.retiredAt - a.retiredAt)
        .map(ipo => ({ ...ipo, allotmentDate: allotmentDates(ipo.name), discoveredAt: allotments.firstSeen(ipo), isNew: false }));
      merged.push(...retired);

      if (merged.length === 0 && ipoCache.data) return ipoCache.data;
      ipoCache = { data: merged, fetchedAt: Date.now() };

      // Announce genuinely new allotments, whichever request happened to discover them
      for (const ipo of fresh) {
        console.log(`[ALLOTMENTS] New allotment: ${ipo.name}`);
        push.notifyAllotment(ipo).catch(err => console.error("[PUSH] notify failed:", err.message));
      }
      return merged;
    } finally {
      ipoFetchInProgress = null;
    }
  })();

  return ipoFetchInProgress;
}

const getRegistrarStatus = id => registrarStatus.get(id) || null;

module.exports = { fetchLiveIpoList, loadSavedLists, getRegistrarStatus, ipoIdentity };
