const { axios, browserHeaders, decodeHtml } = require("../http");
const { stripComments } = require("../html");

const BASE = "https://www.satellitecorporate.com";

async function listIpos() {
  const res = await axios.get(`${BASE}/ipo-query.php`, { headers: browserHeaders(), timeout: 15000 });
  const select = stripComments(res.data).match(/<select[^>]*id=["']company["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!select) throw new Error("company dropdown not found");
  return [...select[1].matchAll(/<option value="(\d+)"[^>]*>([^<]+)<\/option>/gi)]
    .map(m => ({ clientId: m[1], name: decodeHtml(m[2]) }));
}

async function checkPan(ipo, pan) {
  const res = await axios.get(`${BASE}/mainAjax.php`, {
    params: { action: "search_applicant", data_search: "pan_no", company: ipo.clientId, search_no: pan },
    headers: browserHeaders({ "x-requested-with": "XMLHttpRequest", referer: `${BASE}/ipo-query.php` }),
    timeout: 15000
  });
  let data = res.data;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch { return { status: "error", error: "Unexpected response from Satellite." }; } }

  const details = data?.applicantDetails;
  const rows = Array.isArray(details) ? details : (details && typeof details === "object" ? [details] : []);
  if (rows.length === 0) return { status: "not_applied" };

  // "shared_allotted" is Satellite's own spelling
  const applications = rows.map(r => ({
    applicationNo: r.application_no || "",
    applied: parseInt(r.shares_applied, 10) || 0,
    allotted: parseInt(r.shared_allotted ?? r.shares_allotted, 10) || 0
  }));
  return {
    status: "found",
    name: rows[0].applicant_name || "N/A",
    applied: applications.reduce((s, a) => s + a.applied, 0),
    allotted: applications.reduce((s, a) => s + a.allotted, 0),
    applications
  };
}

module.exports = { id: "satellite", tag: "Satellite", label: "Satellite Corporate", website: `${BASE}/ipo-query.php`, concurrency: 3, listIpos, checkPan };
