// Public, server-rendered pages for search engines (lib/ipoPages.js), plus sitemap.xml and robots.txt
const market = require("../lib/market");
const storeLib = require("../lib/store");
const pages = require("../lib/ipoPages");
const { registrars } = require("../lib/registrars");
const { currentIpoList } = require("../services/ipoList.service");
const fs = require("fs");
const path = require("path");
const { WEB_ROOT, ADSENSE_CLIENT } = require("../config");

const html = (res, status, body, maxAge = 300) =>
  res.status(status).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${maxAge}` }).send(body);

const keyOf = ipo => market.normName(ipo.name);
const SAVE_EVERY_MS = 30 * 60 * 1000;
const lastSaved = new Map();   // slug -> ms
let cached = { at: 0, list: null };

// What a snapshot keeps: the page's data, without the long day-by-day histories
function snapshot(ipo) {
  const { logo, sourceUrl, ...rest } = ipo;
  return { ...rest, gmpTrend: (ipo.gmpTrend || []).slice(-30), subscriptionByDay: (ipo.subscriptionByDay || []).slice(-10) };
}

// Live board IPOs plus every IPO saved earlier. A page keeps its address for good: Google ranks it over time, and
// the board drops listed IPOs after ~45 days. Cached for a minute.
async function entries() {
  if (cached.list && Date.now() - cached.at < 60 * 1000) return cached.list;
  const store = storeLib.store();
  const live = pages.withSlugs(await market.getBoard());
  const saved = await store.listPages().catch(() => []);
  const savedBySlug = new Map(saved.map(d => [d._id, d]));
  const savedByKey = new Map(saved.map(d => [d.key, d]));

  for (const e of live) {
    const key = keyOf(e.ipo);
    // Same IPO saved before: keep its address. A different IPO already owns this address: add the year.
    const prior = savedByKey.get(key);
    if (prior) e.slug = prior._id;
    else if (savedBySlug.has(e.slug)) e.slug = `${e.slug}-${(e.ipo.openDate || e.ipo.listingDate || "new").slice(0, 4)}`;
    if (Date.now() - (lastSaved.get(e.slug) || 0) > SAVE_EVERY_MS) {
      lastSaved.set(e.slug, Date.now());
      store.savePage({ _id: e.slug, key, name: e.ipo.name, ipo: snapshot(e.ipo), savedAt: new Date() })
        .catch(err => console.error("[PAGES] save failed:", err.message));
    }
  }

  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const liveKeys = new Set(live.map(e => keyOf(e.ipo)));
  const archived = saved.filter(d => !liveKeys.has(d.key)).map(d => ({
    slug: d._id,
    archived: true,
    ipo: { ...d.ipo, status: d.ipo.listingDate && d.ipo.listingDate <= today ? "listed" : d.ipo.status }
  })).sort((a, b) => String(b.ipo.listingDate || "").localeCompare(String(a.ipo.listingDate || "")));

  cached = { at: Date.now(), list: [...live, ...archived] };
  return cached.list;
}

// The registrar's allotment listing for an IPO, matched by name ("[KFin] Vedant Poly Fabs Ltd" ~ "Vedant Poly Fabs Limited")
const cleanKey = i => market.normName(String(i.name).replace(/^\[[^\]]+\]\s*/, ""));
function matchAllotment(list, ipo) {
  const target = keyOf(ipo);
  if (!target) return null;
  return list.find(i => !i.retired && cleanKey(i) === target)
    || list.find(i => { const n = cleanKey(i); return !i.retired && n && n.length >= 6 && (n.startsWith(target) || target.startsWith(n)); })
    || null;
}

// Allotment listings grouped by registrar, each linked to its IPO page when there is one
async function allotmentsByRegistrar(all) {
  const list = await currentIpoList().catch(() => []);
  const byKey = new Map(all.map(e => [keyOf(e.ipo), e]));
  const groups = new Map(registrars.map(r => [r.id, []]));
  for (const item of list) {
    if (item.retired || !groups.has(item.source)) continue;
    const key = cleanKey(item);
    const page = byKey.get(key) || all.find(e => { const k = keyOf(e.ipo); return k.length >= 6 && (k.startsWith(key) || key.startsWith(k)); });
    groups.get(item.source).push({ item, page });
  }
  return groups;
}

async function ipoIndex(req, res) {
  try {
    html(res, 200, pages.renderIndexPage(await entries()));
  } catch (err) {
    console.error("[PAGES] index:", err.message);
    html(res, 503, pages.renderNotFound(), 0);
  }
}

async function ipoPage(req, res) {
  try {
    const all = await entries();
    const entry = all.find(e => e.slug === String(req.params.slug).toLowerCase());
    if (!entry) return html(res, 404, pages.renderNotFound(), 60);
    // A few other IPOs for internal links: live ones first, then the newest listings
    const others = all.filter(e => e !== entry);
    const related = others.filter(e => !e.archived && e.ipo.status !== "listed").concat(others.filter(e => e.ipo.status === "listed")).slice(0, 6);
    const allotment = entry.archived ? null : matchAllotment(await currentIpoList().catch(() => []), entry.ipo);
    html(res, 200, pages.renderIpoPage(entry, { allotment, related }));
  } catch (err) {
    console.error("[PAGES] ipo:", err.message);
    html(res, 503, pages.renderNotFound(), 0);
  }
}

async function registrarIndex(req, res) {
  try {
    const all = await entries();
    html(res, 200, pages.renderRegistrarIndex(await allotmentsByRegistrar(all)));
  } catch (err) {
    console.error("[PAGES] registrars:", err.message);
    html(res, 503, pages.renderNotFound(), 0);
  }
}

async function registrarPage(req, res) {
  const reg = pages.REGISTRARS.find(r => r.slug === String(req.params.registrar).toLowerCase());
  if (!reg) return html(res, 404, pages.renderNotFound(), 60);
  try {
    const groups = await allotmentsByRegistrar(await entries());
    const registrar = registrars.find(r => r.id === reg.id);
    html(res, 200, pages.renderRegistrarPage(reg, groups.get(reg.id) || [], registrar?.website));
  } catch (err) {
    console.error("[PAGES] registrar:", err.message);
    html(res, 503, pages.renderNotFound(), 0);
  }
}

async function sitemap(req, res) {
  try {
    res.set({ "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }).send(pages.renderSitemap(await entries()));
  } catch (err) {
    res.status(503).type("text/plain").send("Sitemap unavailable");
  }
}

function robots(req, res) {
  res.type("text/plain").set("Cache-Control", "public, max-age=86400").send(
    `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /v1/\n\nSitemap: ${pages.SITE}/sitemap.xml\n`
  );
}

// ads.txt: names Google as the only seller of ad space on this site (AdSense checks it)
function adsTxt(req, res) {
  if (!ADSENSE_CLIENT) return res.status(404).type("text/plain").send("Not found");
  res.type("text/plain").set("Cache-Control", "public, max-age=86400")
    .send(`google.com, ${ADSENSE_CLIENT.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0
`);
}

// Home page with the AdSense account tag, so Google can verify the site. Only the tag: the app itself shows no ads.
let homeHtml = null;
function home(req, res, next) {
  if (!ADSENSE_CLIENT) return next();
  try {
    homeHtml ??= fs.readFileSync(path.join(WEB_ROOT, "index.html"), "utf8")
      .replace("</head>", `<meta name="google-adsense-account" content="${ADSENSE_CLIENT}">
</head>`);
  } catch { return next(); }
  res.type("html").set("Cache-Control", "no-cache").send(homeHtml);
}

module.exports = { ipoIndex, ipoPage, registrarIndex, registrarPage, sitemap, robots, adsTxt, home };
