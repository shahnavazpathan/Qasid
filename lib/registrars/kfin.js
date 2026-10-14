const { axios, browserHeaders } = require("../http");

const BASE_URL = "https://ipostatus.kfintech.com";
const API_URL = "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan";
// KFin's CDN serves index.html instead of the JS bundle unless the request looks like a browser
const HEADERS = browserHeaders({ referer: `${BASE_URL}/` });

async function listIpos() {
  const htmlResponse = await axios.get(BASE_URL, { headers: HEADERS, timeout: 10000 });
  const scriptMatch = htmlResponse.data.match(/src=["'](\.?\/static\/js\/main\.[a-f0-9]+\.js)["']/i);
  if (!scriptMatch) throw new Error("JS bundle not found on KFin page");

  const bundlePath = scriptMatch[1].replace(/^\./, "");
  const jsResponse = await axios.get(`${BASE_URL}${bundlePath.startsWith("/") ? "" : "/"}${bundlePath}`, { headers: HEADERS, timeout: 15000 });
  const jsonMatch = String(jsResponse.data).match(/JSON\.parse\(\s*['"](\[\s*\{.*?clientId.*?\}\s*\])['"]\s*\)/s);
  if (!jsonMatch) throw new Error("IPO list not found in KFin bundle");

  return JSON.parse(jsonMatch[1])
    .filter(ipo => ipo && ipo.clientId && ipo.name)
    .map(ipo => ({ name: String(ipo.name).trim(), clientId: String(ipo.clientId) }));
}

async function checkPan(ipo, pan) {
  const response = await axios.get(API_URL, {
    headers: { ...HEADERS, origin: BASE_URL, client_id: ipo.clientId, reqparam: pan },
    validateStatus: () => true,
    timeout: 15000
  });
  let data = response.data;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch {} }

  if (response.status === 404 || (data && (data.error === "Record Not Found" || data.error === "Bad Reqeust"))) {
    return { status: "not_applied" };
  }
  if (response.status === 429 || response.status >= 500) return { status: "error", error: "KFintech is busy, please retry." };
  if (data && data.error) return { status: "error", error: "IPO Details Unavailable / Invalid." };

  const rows = (data && Array.isArray(data.data)) ? data.data : [];
  if (rows.length === 0) return { status: "not_applied" };

  return {
    status: "found",
    name: rows[0].Name || rows[0].name || "N/A",
    applied: rows.reduce((sum, r) => sum + (parseInt(r.App_Shares, 10) || 0), 0),
    allotted: rows.reduce((sum, r) => sum + (parseInt(r.All_Shares || r.allot, 10) || 0), 0),
    applications: rows.map(r => ({
      applicationNo: r.Appln_No || "",
      dpClientId: r.DP_CLID || "",
      category: r.Consumer || "",
      applied: parseInt(r.App_Shares, 10) || 0,
      allotted: parseInt(r.All_Shares, 10) || 0
    }))
  };
}

module.exports = { id: "kfin", tag: "KFin", label: "KFintech", website: BASE_URL, concurrency: 5, listIpos, checkPan };
