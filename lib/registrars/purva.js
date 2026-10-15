const zlib = require("zlib");
const { axios, browserHeaders, decodeHtml, CookieJar, form } = require("../http");
const { stripComments, parseAllotmentHtml } = require("../html");

const PAGE = "https://www.purvashare.com/investor-service/ipo-query";

async function listIpos() {
  const res = await axios.get(PAGE, { headers: browserHeaders(), timeout: 15000 });
  return [...stripComments(res.data).matchAll(/<option value="(\d+)"\s*>\s*([^<]+?)\s*<\/option>/g)]
    .map(m => ({ clientId: m[1], name: decodeHtml(m[2]) }));
}

// Django's flash-message cookie: optional leading "." means zlib-compressed, base64url, before the first ":"
function decodeDjangoMessages(cookieValue) {
  try {
    let v = decodeURIComponent(cookieValue).replace(/^"|"$/g, "");
    const compressed = v.startsWith(".");
    if (compressed) v = v.slice(1);
    const buf = Buffer.from(v.split(":")[0], "base64url");
    return (compressed ? zlib.inflateSync(buf) : buf).toString();
  } catch {
    return "";
  }
}

async function checkPan(ipo, pan) {
  const jar = new CookieJar();
  const page = jar.absorb(await axios.get(PAGE, { headers: browserHeaders(), timeout: 15000 }));
  const token = String(page.data).match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1];
  if (!token) return { status: "error", error: "Purva session could not be started." };

  const res = await axios.post(PAGE, form({
    csrfmiddlewaretoken: token, company_id: ipo.clientId, applicationNumber: "", panNumber: pan
  }), {
    headers: browserHeaders({
      cookie: jar.toString(),
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.purvashare.com",
      referer: PAGE
    }),
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 15000
  });

  // Not found (or a validation error) comes back as a redirect carrying a flash message
  if (res.status >= 300 && res.status < 400) {
    const messagesCookie = (res.headers["set-cookie"] || []).find(c => c.startsWith("messages="));
    const message = messagesCookie ? decodeDjangoMessages(messagesCookie.split(";")[0].slice("messages=".length)) : "";
    if (!message || /no record/i.test(message)) return { status: "not_applied" };
    const text = message.match(/"__json_message",\d+,\d+,"([^"]+)"/)?.[1];
    return { status: "error", error: text || "Purva rejected the request." };
  }
  if (res.status >= 400) return { status: "error", error: "Purva is unavailable, please retry." };

  const parsed = parseAllotmentHtml(String(res.data).match(/results-table[\s\S]*/i)?.[0] || res.data);
  // A 200 page we cannot read is NOT proof the PAN didn't apply - surface it instead of a silent "not applied"
  if (parsed) return parsed;
  if (/no record/i.test(String(res.data))) return { status: "not_applied" };
  return { status: "error", error: "Couldn't read Purva's result page - please check on purvashare.com." };
}

module.exports = { id: "purva", tag: "Purva", label: "Purva Sharegistry", website: PAGE, concurrency: 3, listIpos, checkPan };
