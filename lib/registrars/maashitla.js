const { axios, browserHeaders } = require("../http");

const LIST_URL = "https://api.maashitla.com/api/company-directory";
const CHECK_URL = "https://pnjbvxj6md.execute-api.ap-south-1.amazonaws.com/prod/check";

async function listIpos() {
  const res = await axios.get(LIST_URL, { headers: browserHeaders({ "content-type": "application/json" }), timeout: 15000 });
  return (res.data?.companies || [])
    .filter(c => c.company_slug && c.company_name)
    .map(c => ({ name: c.company_name.trim(), clientId: c.company_slug }));
}

async function checkPan(ipo, pan) {
  const res = await axios.get(`${CHECK_URL}/${encodeURIComponent(ipo.clientId)}`, {
    params: { pan },
    headers: browserHeaders({ origin: "https://www.maashitla.com", referer: "https://www.maashitla.com/" }),
    validateStatus: () => true,
    timeout: 15000
  });
  if (res.status === 404) return { status: "not_applied" };
  if (res.status >= 400) return { status: "error", error: "Maashitla is unavailable, please retry." };
  const d = res.data || {};
  if (d.name == null) return { status: "not_applied" };
  return { status: "found", name: d.name, applied: parseInt(d.shares_applied, 10) || 0, allotted: parseInt(d.shares_allotted, 10) || 0 };
}

module.exports = { id: "maashitla", tag: "Maashitla", label: "Maashitla Securities", website: "https://www.maashitla.com/allotment-status/public-issues", concurrency: 4, listIpos, checkPan };
