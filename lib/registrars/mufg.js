const { axios, browserHeaders, cookieString, decodeHtml } = require("../http");

const BASE_URL = "https://in.mpms.mufg.com/Initial_Offer/IPO.aspx";
const AJAX_HEADERS = browserHeaders({
  "x-requested-with": "XMLHttpRequest",
  "content-type": "application/json; charset=UTF-8",
  origin: "https://in.mpms.mufg.com",
  referer: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html"
});

function xmlTag(xml, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? decodeHtml(match[1]) : "";
}

async function listIpos() {
  const response = await axios.post(`${BASE_URL}/GetDetails`, {}, { headers: AJAX_HEADERS, timeout: 15000 });
  const rawXml = response.data?.d || "";
  const ipos = [];
  const regex = /<Table>([\s\S]*?)<\/Table>/gi;
  let match;
  while ((match = regex.exec(rawXml)) !== null) {
    const clientId = xmlTag(match[1], "company_id");
    const name = xmlTag(match[1], "companyname");
    if (clientId && name) ipos.push({ name, clientId });
  }
  return ipos;
}

async function searchOnce(ipo, pan) {
  const tokenRes = await axios.post(`${BASE_URL}/generateToken`, {}, { headers: AJAX_HEADERS, timeout: 15000 });
  const token = tokenRes.data?.d;
  const payload = JSON.stringify({ clientid: ipo.clientId, PAN: pan, IFSC: "", CHKVAL: "1", token });
  const searchRes = await axios.post(`${BASE_URL}/SearchOnPan`, payload, {
    headers: { ...AJAX_HEADERS, cookie: cookieString(tokenRes) },
    timeout: 15000
  });
  return searchRes.data?.d || "";
}

async function checkPan(ipo, pan) {
  let rawXml = await searchOnce(ipo, pan);

  // <Table1><Msg> is MUFG's error channel (e.g. expired token) - retry once with a fresh token
  if (rawXml.includes("<Table1>")) rawXml = await searchOnce(ipo, pan);
  if (rawXml.includes("<Table1>")) return { status: "error", error: xmlTag(rawXml, "Msg") || "MUFG rejected the request." };

  const rows = [...rawXml.matchAll(/<Table>([\s\S]*?)<\/Table>/gi)].map(m => m[1]);
  if (rows.length === 0) return { status: "not_applied" };

  // A PAN can have several applications (e.g. different demat accounts) - one <Table> each
  const applications = rows.map(row => ({
    applicationNo: xmlTag(row, "PEMNDG"),
    applied: parseInt(xmlTag(row, "SHARES"), 10) || 0,
    allotted: parseInt(xmlTag(row, "ALLOT"), 10) || 0
  }));

  return {
    status: "found",
    name: xmlTag(rows[0], "NAME1") || "N/A",
    applied: applications.reduce((s, a) => s + a.applied, 0),
    allotted: applications.reduce((s, a) => s + a.allotted, 0),
    applications
  };
}

module.exports = { id: "mufg", tag: "MUFG", label: "MUFG (Link Intime)", website: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html", concurrency: 3, listIpos, checkPan };
