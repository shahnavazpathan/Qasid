const { axios, browserHeaders, decodeHtml, CookieJar, form } = require("../http");
const { parseAllotmentHtml, stripTags } = require("../html");

const BASE = "https://www.skylinerta.com";

async function listIpos() {
  const res = await axios.get(`${BASE}/ipo.php`, { headers: browserHeaders(), timeout: 15000 });
  const select = String(res.data).match(/<select[^>]*name=["']company["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!select) throw new Error("company dropdown not found");
  return [...select[1].matchAll(/<option value="(\d+)"\s*>([^<]+)<\/option>/gi)]
    .map(m => ({ clientId: m[1], name: decodeHtml(m[2]).replace(/\s*\(Inactive\)\s*$/i, "") }))
    .filter(i => i.clientId !== "0");
}

async function checkPan(ipo, pan) {
  const jar = new CookieJar();
  const headers = () => browserHeaders({
    cookie: jar.toString(),
    "content-type": "application/x-www-form-urlencoded",
    origin: BASE,
    referer: `${BASE}/display_application.php`
  });

  jar.absorb(await axios.get(`${BASE}/ipo.php`, { headers: browserHeaders(), timeout: 15000 }));
  // Step 1: choosing the company yields a CSRF token bound to the PHP session
  const step1 = jar.absorb(await axios.post(`${BASE}/display_application.php`, form({ company: ipo.clientId }), { headers: headers(), timeout: 15000 }));
  const token = String(step1.data).match(/name="csrf_token"[^>]*value="([^"]+)"/)?.[1];
  if (!token) return { status: "error", error: "Skyline session could not be started." };

  const res = await axios.post(`${BASE}/display_application.php`, form({
    client_id: "", application_no: "", pan, csrf_token: token, company: ipo.clientId, action: "search"
  }), { headers: headers(), timeout: 15000 });
  const html = String(res.data);

  if (/No record found/i.test(html)) return { status: "not_applied" };
  if (/session has expired/i.test(html)) return { status: "error", error: "Skyline session expired, please retry." };

  const result = html.match(/class="[^"]*resultsec[\s\S]*/i)?.[0] || html;
  const parsed = parseAllotmentHtml(result);
  if (parsed) return parsed;
  const message = html.match(/class="error_message"[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  return { status: "error", error: message ? stripTags(message) : "Unexpected response from Skyline." };
}

module.exports = { id: "skyline", tag: "Skyline", label: "Skyline Financial", website: `${BASE}/ipo.php`, concurrency: 3, listIpos, checkPan };
