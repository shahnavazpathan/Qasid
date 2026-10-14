const { axios, browserHeaders, decodeHtml, form } = require("../http");
const { parseAllotmentHtml, stripTags } = require("../html");

const BASE = "https://ipostatus.integratedregistry.in";
const HEADERS = browserHeaders({
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
  origin: BASE,
  referer: `${BASE}/`
});

async function listIpos() {
  const res = await axios.post(`${BASE}/RegistrarsToAjax.aspx`, form({ Req: "1", Comp: "IPO" }), { headers: HEADERS, timeout: 15000 });
  return [...String(res.data).matchAll(/<option value='?([^'\s>]+)'?>([^<]+)/g)]
    .filter(m => m[1] !== "0")
    .map(m => ({ clientId: m[1], name: decodeHtml(m[2]) }));
}

async function checkPan(ipo, pan) {
  // The page's captcha is drawn and checked purely in the browser; the server never sees it
  const body = form({
    Req: ipo.clientId === "SEL" ? "3" : "2", Comp: ipo.clientId, AppNum: "", Choice: "3",
    PANNO: pan, DPClit: "", TYPE: "IPO", Captcha: "undefined"
  });
  const res = await axios.post(`${BASE}/NCDAllotmentDetailsdataLaodNew.aspx`, body, { headers: HEADERS, timeout: 15000 });
  const text = String(res.data);
  if (/Records Not Found/i.test(text)) return { status: "not_applied" };

  const html = text.includes("@@@@") ? text.split("@@@@")[1] : text;
  const parsed = parseAllotmentHtml(html);
  if (parsed) return parsed;
  return { status: "error", error: stripTags(html).slice(0, 140) || "Unexpected response from Integrated Registry." };
}

module.exports = { id: "integrated", tag: "Integrated", label: "Integrated Registry", website: `${BASE}/`, concurrency: 3, listIpos, checkPan };
