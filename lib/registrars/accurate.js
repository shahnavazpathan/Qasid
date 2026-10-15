const { axios, browserHeaders, decodeHtml } = require("../http");
const { stripComments } = require("../html");

const SITE = "https://www.accuratesecurities.com";
const API = "https://beta.accurateai.in/check-allotment";

async function listIpos() {
  const res = await axios.get(`${SITE}/ipo-details.html`, { headers: browserHeaders(), timeout: 15000 });
  const select = stripComments(res.data).match(/<select[^>]*id=["']company["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!select) throw new Error("company dropdown not found");
  return [...select[1].matchAll(/<option[^>]*value=["']?(\d+)["']?[^>]*>([^<]+)<\/option>/gi)]
    .map(m => ({ clientId: m[1], name: decodeHtml(m[2]) }));
}

// Accurate's API doesn't take a company - it searches every active issue by PAN
async function checkPan(ipo, pan) {
  const res = await axios.post(API, { type: "1", number: pan }, {
    headers: browserHeaders({ "content-type": "application/json", origin: SITE, referer: `${SITE}/` }),
    validateStatus: () => true,
    timeout: 15000
  });
  if (res.status >= 500) return { status: "error", error: "Accurate Securities is unavailable, please retry." };
  const data = res.data || {};
  if (String(data.status) !== "true" || !Array.isArray(data.message) || data.message.length === 0) return { status: "not_applied" };

  const applications = data.message.map(r => ({
    applicationNo: r.applicationId || "",
    dpClientId: [r.dpId, r.clientId].filter(Boolean).join("-"),
    applied: parseInt(r.appliedShares, 10) || 0,
    allotted: parseInt(r.allottedShares, 10) || 0
  }));
  return {
    status: "found",
    name: data.message[0].clientName || "N/A",
    applied: applications.reduce((s, a) => s + a.applied, 0),
    allotted: applications.reduce((s, a) => s + a.allotted, 0),
    applications
  };
}

module.exports = { id: "accurate", tag: "Accurate", label: "Accurate Securities", website: `${SITE}/ipo-details.html`, concurrency: 3, listIpos, checkPan };
