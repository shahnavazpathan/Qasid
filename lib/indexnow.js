// IndexNow: tells Bing (and through it DuckDuckGo, Yahoo and ChatGPT search), Yandex and others about new or
// changed pages right away instead of waiting for a crawl. Google doesn't use IndexNow; it reads the sitemap.
// The key is public by design: it is served at /<key>.txt to prove the site owns it.
const KEY = "5f0c2b8e9d4a4c1fb7e36a2d8c9e1b47";
const HOST = "qasid.thevellora.co.in";
const DAY_MS = 24 * 3600e3;

const pending = new Set();
let timer = null;
let lastHubPing = 0;

function submit(urls) {
  if (process.env.NODE_ENV === "test" || !urls.length) return;
  fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(0, 10000) }),
    signal: AbortSignal.timeout(15000)
  })
    .then(res => { if (!res.ok && res.status !== 202) console.error(`[INDEXNOW] HTTP ${res.status}`); })
    .catch(err => console.error("[INDEXNOW]", err.message));
}

// Queue page paths ("/ipo/foo"); sent together a minute later. The hub pages go along once a day.
function notify(paths) {
  for (const p of paths) pending.add(`https://${HOST}${p}`);
  if (Date.now() - lastHubPing > DAY_MS) {
    lastHubPing = Date.now();
    for (const p of ["/", "/ipo", "/allotment-status", "/check-allotment-multiple-pan"]) pending.add(`https://${HOST}${p}`);
  }
  if (!timer && pending.size) {
    timer = setTimeout(() => { timer = null; const urls = [...pending]; pending.clear(); submit(urls); }, 60 * 1000);
    timer.unref?.();
  }
}

module.exports = { KEY, notify };
