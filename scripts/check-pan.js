#!/usr/bin/env node
// Diagnose an allotment lookup locally, without sharing a PAN with anyone.
//
//   node scripts/check-pan.js <registrar> "<IPO name or id>" <PAN>
//   node scripts/check-pan.js bigshare adroit ABCDE1234F
//   node scripts/check-pan.js kfin "orient cables" ABCDE1234F
//
// Prints what Qasid concludes, and for Bigshare what EACH of its three servers answers.
// Names are masked in the output.
const axios = require("axios");
const { registrars, getRegistrar } = require("../lib/registrars");

const [registrarId, ipoQuery, rawPan] = process.argv.slice(2);
const pan = String(rawPan || "").trim().toUpperCase();
const mask = s => String(s || "").replace(/(\w)(\w+)/g, (_, a, b) => a + "*".repeat(Math.min(b.length, 6)));

if (!registrarId || !ipoQuery || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
  console.log('Usage: node scripts/check-pan.js <registrar> "<IPO name or id>" <PAN>');
  console.log("Registrars:", registrars.map(r => r.id).join(", "));
  process.exit(1);
}

(async () => {
  const registrar = getRegistrar(registrarId);
  if (!registrar) throw new Error(`Unknown registrar "${registrarId}"`);

  const ipos = await registrar.listIpos();
  const q = ipoQuery.toLowerCase();
  const ipo = ipos.find(i => String(i.clientId) === ipoQuery) || ipos.find(i => i.name.toLowerCase().includes(q));
  if (!ipo) {
    console.log(`No ${registrar.label} IPO matches "${ipoQuery}". Available:`);
    ipos.slice(0, 30).forEach(i => console.log(`  ${i.clientId}  ${i.name}`));
    process.exit(1);
  }
  console.log(`${registrar.label} · ${ipo.name} (id ${ipo.clientId}) · PAN ${pan.slice(0, 5)}****${pan.slice(-1)}\n`);

  if (registrar.id === "bigshare") {
    for (const server of ["https://ipo.bigshareonline.com", "https://ipo1.bigshareonline.com", "https://ipo2.bigshareonline.com"]) {
      try {
        const res = await axios.post(`${server}/Data.aspx/FetchIpodetails`, {
          Applicationno: "", Company: ipo.clientId, SelectionType: "PN", PanNo: pan,
          txtcsdl: "", txtDPID: "", txtClId: "", ddlType: "0", lang: "en"
        }, {
          headers: { "content-type": "application/json; charset=UTF-8", "user-agent": "Mozilla/5.0", origin: server, referer: `${server}/ipo_status.html`, "x-requested-with": "XMLHttpRequest" },
          validateStatus: () => true, timeout: 15000
        });
        const d = res.data?.d || {};
        const rec = (d.Records && d.Records[0]) || d;
        console.log(`  ${server.split("//")[1].padEnd(26)} HTTP ${res.status}  Status=${d.Status || "-"}  Name=${mask(rec.Name) || "-"}  Applied=${rec.APPLIED || "-"}  Allotted=${rec.ALLOTED || "-"}  Matches=${d.MatchCount ?? "-"}`);
      } catch (err) {
        console.log(`  ${server.split("//")[1].padEnd(26)} FAILED  ${err.message}`);
      }
    }
    console.log("");
  }

  const result = await registrar.checkPan(ipo, pan);
  const shown = { ...result, name: result.name ? mask(result.name) : undefined };
  console.log("Qasid result:", JSON.stringify(shown, null, 2));
  process.exit(0);
})().catch(err => { console.error("Error:", err.message); process.exit(1); });
