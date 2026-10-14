const { axios, browserHeaders, decodeHtml, CookieJar, form } = require("../http");
const { parseAllotmentHtml, stripTags } = require("../html");

// MAS Services only ever exposes the one IPO whose allotment is currently live
const BASE = "https://www.masserv.com";

async function listIpos() {
  const res = await axios.get(`${BASE}/opt.asp`, { headers: browserHeaders(), timeout: 15000 });
  const html = String(res.data).replace(/<!--[\s\S]*?-->/g, "");
  const name = html.match(/IPO\s*-\s*([^<]+?)\s*ALLOTMENT STATUS/i)?.[1];
  if (!name) return [];
  const clean = decodeHtml(name);
  return [{ clientId: clean.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, ""), name: clean }];
}

async function checkPan(ipo, pan) {
  const jar = new CookieJar();
  jar.absorb(await axios.get(`${BASE}/asearch.asp`, { headers: browserHeaders(), timeout: 15000 }));
  const res = await axios.post(`${BASE}/search1.asp`, form({ texthn: pan, DtLogin: "Search" }), {
    headers: browserHeaders({ cookie: jar.toString(), "content-type": "application/x-www-form-urlencoded", referer: `${BASE}/asearch.asp`, origin: BASE }),
    timeout: 15000
  });
  const html = String(res.data);
  if (/NOT CORRECT|NO RECORD/i.test(html)) return { status: "not_applied" };
  const parsed = parseAllotmentHtml(html);
  return parsed || { status: "error", error: stripTags(html).slice(0, 140) || "Unexpected response from MAS." };
}

module.exports = { id: "mas", tag: "MAS", label: "MAS Services", website: `${BASE}/opt.asp`, concurrency: 2, listIpos, checkPan };
