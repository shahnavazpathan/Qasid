// Public, server-rendered pages for search engines (lib/ipoPages.js), plus sitemap.xml and robots.txt
const market = require("../lib/market");
const pages = require("../lib/ipoPages");
const { currentIpoList } = require("../services/ipoList.service");

const html = (res, status, body, maxAge = 300) =>
  res.status(status).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${maxAge}` }).send(body);

async function entries() {
  return pages.withSlugs(await market.getBoard());
}

// The registrar's allotment listing for a board IPO, matched by name ("[KFin] Vedant Poly Fabs Ltd" ~ "Vedant Poly Fabs Limited")
async function allotmentFor(ipo) {
  const list = await currentIpoList().catch(() => []);
  const target = market.normName(ipo.name);
  if (!target) return null;
  const clean = i => market.normName(String(i.name).replace(/^\[[^\]]+\]\s*/, ""));
  return list.find(i => !i.retired && clean(i) === target)
    || list.find(i => { const n = clean(i); return !i.retired && n && n.length >= 6 && (n.startsWith(target) || target.startsWith(n)); })
    || null;
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
    // A few other live IPOs for internal links: open and upcoming first, then the newest listings
    const related = all.filter(e => e !== entry && (e.ipo.status === "open" || e.ipo.status === "upcoming" || e.ipo.status === "closed"))
      .concat(all.filter(e => e !== entry && e.ipo.status === "listed")).slice(0, 6);
    html(res, 200, pages.renderIpoPage(entry, { allotment: await allotmentFor(entry.ipo), related }));
  } catch (err) {
    console.error("[PAGES] ipo:", err.message);
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

module.exports = { ipoIndex, ipoPage, sitemap, robots };
