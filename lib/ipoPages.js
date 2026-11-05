// Server-rendered public IPO pages for search engines: /ipo (all IPOs) and /ipo/<slug> (one IPO).
// Plain HTML and CSS, so Google can read every word (the only script is Google AdSense, when configured).
// Built from the cached IPO board.
const { ADSENSE_CLIENT, ADSENSE_SLOT } = require("../config");
const SITE = "https://qasid.thevellora.co.in";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inr = (n, d = 2) => (n === null || n === undefined || n === "" ? null : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: d })}`);
const fmtDate = iso => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);
const todayIst = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

// "Vedant Poly Fabs Limited" -> "vedant-poly-fabs"
function slugify(name) {
  return String(name).toLowerCase().replace(/&/g, " and ").replace(/\b(limited|ltd)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ipo";
}

// Every IPO on the board with a unique slug (a clash gets -2, -3, ...)
function withSlugs(board) {
  const used = new Map();
  return ["open", "upcoming", "closed", "listed"].flatMap(s => board[s] || []).map(ipo => {
    const base = slugify(ipo.name);
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    return { ipo, slug: n === 1 ? base : `${base}-${n}` };
  });
}

function priceBand(ipo) {
  if (ipo.priceMin && ipo.priceMax && ipo.priceMin !== ipo.priceMax) return `${inr(ipo.priceMin)} – ${inr(ipo.priceMax)}`;
  return inr(ipo.priceMax || ipo.issuePrice);
}
const minInvestment = ipo => (ipo.priceMax && ipo.lotSize ? ipo.priceMax * ipo.lotSize * (ipo.type === "SME" ? 2 : 1) : null);
function gmpInfo(ipo) {
  if (ipo.gmp === null || ipo.gmp === undefined || !ipo.priceMax) return null;
  const pct = (ipo.gmp / ipo.priceMax) * 100;
  return { gmp: ipo.gmp, pct, est: ipo.priceMax + ipo.gmp, text: `${ipo.gmp >= 0 ? "+" : "−"}${inr(Math.abs(ipo.gmp))} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)` };
}
const subTotal = ipo => (ipo.subscription?.total ? `${Number(ipo.subscription.total).toFixed(2)}x` : null);

// One plain-language line about where the IPO stands today
function statusLine(ipo, today) {
  if (ipo.status === "listed") {
    const gain = typeof ipo.listingGain === "number" ? ` (${ipo.listingGain >= 0 ? "+" : ""}${ipo.listingGain.toFixed(1)}% vs issue price)` : "";
    return `Listed on ${fmtDate(ipo.listingDate)}${ipo.listingPrice ? ` at ${inr(ipo.listingPrice)}` : ""}${gain}.`;
  }
  if (ipo.status === "open") return ipo.closeDate === today ? "Open for bidding — today is the last day to apply." : `Open for bidding until ${fmtDate(ipo.closeDate)}.`;
  if (ipo.status === "upcoming") return ipo.openDate ? `Opens for bidding on ${fmtDate(ipo.openDate)}.` : "Bidding dates are not announced yet.";
  if (ipo.allotmentDate && ipo.allotmentDate <= today) return `Bidding closed. Allotment ${ipo.allotmentDate === today ? "is due today" : "is out"}${ipo.listingDate ? `; listing on ${fmtDate(ipo.listingDate)}` : ""}.`;
  return `Bidding closed${ipo.allotmentDate ? `; allotment on ${fmtDate(ipo.allotmentDate)}` : ""}${ipo.listingDate ? `, listing on ${fmtDate(ipo.listingDate)}` : ""}.`;
}

const STAGE = { open: "Open", upcoming: "Upcoming", closed: "Closed", listed: "Listed" };

const CSS = `
:root{--bg:#f6f6f7;--card:#fff;--ink:#0b0b0c;--ink2:#45454d;--ink3:#6b6b74;--line:#e7e7ea;--brand:#dc2626;--gain:#15803d;--loss:#b91c1c;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#09090b;--card:#111113;--ink:#f4f4f5;--ink2:#a1a1aa;--ink3:#8b8b95;--line:#26262b;--brand:#ef4444;--gain:#22c55e;--loss:#f87171;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
a{color:var(--brand)}::selection{background:var(--brand);color:#fff}
header.top{border-bottom:1px solid var(--line);background:var(--card)}header.top div{max-width:860px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.logo{font-weight:800;font-size:19px;color:var(--ink);text-decoration:none}.top nav a{font-size:14px;font-weight:600;color:var(--ink2);text-decoration:none;margin-left:14px}
main{max-width:860px;margin:0 auto;padding:20px 16px 48px}
.crumbs{font-size:13px;color:var(--ink3);margin-bottom:8px}.crumbs a{color:var(--ink3)}
h1{font-size:clamp(24px,5vw,32px);line-height:1.2;margin:0 0 8px;letter-spacing:-.02em;text-wrap:balance}
h2{font-size:19px;margin:32px 0 10px;letter-spacing:-.01em}
.lead{color:var(--ink2);margin:0 0 16px}.chip{display:inline-block;font-size:12px;font-weight:700;padding:2px 10px;border-radius:99px;background:var(--line);color:var(--ink2);margin-right:6px;vertical-align:middle}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px 16px}
table{width:100%;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:10px 0;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child th,tr:last-child td{border-bottom:0}
th{font-weight:500;color:var(--ink3);width:46%;padding-right:12px}td{font-weight:600}
.grid th{width:auto}.num{text-align:right}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 4px}.btn{display:inline-block;padding:11px 18px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px}
.btn.primary{background:#dc2626;color:#fff}.btn.ghost{border:1px solid var(--line);color:var(--ink);background:var(--card)}
.gain{color:var(--gain)}.loss{color:var(--loss)}.muted{color:var(--ink3);font-size:14px}
details{border-bottom:1px solid var(--line);padding:12px 0}details:last-child{border-bottom:0}summary{font-weight:600;cursor:pointer}details p{margin:8px 0 0;color:var(--ink2)}
.list a.row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--ink)}.list a.row:last-child{border-bottom:0}
.row b{font-weight:600}.row span{color:var(--ink3);font-size:14px;text-align:right;white-space:nowrap}
@media (max-width:560px){.list a.row{flex-direction:column;gap:2px}.row span{text-align:left;white-space:normal}}
.ad{margin:28px 0;min-height:100px}.ad small{display:block;font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
footer{max-width:860px;margin:0 auto;padding:0 16px 40px;color:var(--ink3);font-size:13px}
`;

// Google AdSense: the loader in <head> (it also verifies the site and runs Auto ads), and an in-content ad unit.
// Both are empty until ADSENSE_CLIENT is set; fixed units also need ADSENSE_SLOT.
const adsenseHead = () => (ADSENSE_CLIENT
  ? `<meta name="google-adsense-account" content="${ADSENSE_CLIENT}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>`
  : "");
const ad = () => (ADSENSE_CLIENT && ADSENSE_SLOT
  ? `<div class="ad"><small>Advertisement</small><ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${ADSENSE_SLOT}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`
  : "");

function layout({ title, description, path, body, jsonLd = [], ads = true }) {
  const url = `${SITE}${path}`;
  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Qasid">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/icons/icon-512.png">
<meta name="twitter:card" content="summary">
${jsonLd.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
<style>${CSS}</style>
${ads ? adsenseHead() : ""}
</head>
<body>
<header class="top"><div><a class="logo" href="/">Qasid</a><nav><a href="/ipo">IPO GMP</a><a href="/allotment-status">Allotment status</a></nav></div></header>
<main>${body}</main>
<footer>GMP (grey market premium) is unofficial, changes often and is only indicative. Data comes from public exchange, registrar and SEBI pages and may be delayed. Qasid is not registered with SEBI and nothing here is investment advice. <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a></footer>
</body>
</html>`;
}

const breadcrumb = items => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE}${path}` }))
});

const rows = pairs => pairs.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join("");

// One IPO. `allotment` is the registrar's allotment listing for it ({ source, clientId, registrar }) or null.
function renderIpoPage({ ipo, slug }, { allotment, related = [] } = {}) {
  const today = todayIst();
  const name = ipo.name;
  const g = gmpInfo(ipo);
  const sub = subTotal(ipo);
  const year = (ipo.openDate || ipo.listingDate || today).slice(0, 4);
  const appIpo = `/#/ipo/${encodeURIComponent(ipo.id)}`;
  const allotLink = allotment ? `/#/allotment/${encodeURIComponent(`${allotment.source}:${allotment.clientId}`)}` : "/#/allotment";
  const allotmentOut = allotment || (ipo.allotmentDate && ipo.allotmentDate <= today) || ipo.status === "listed";

  const details = rows([
    ["Price band", esc(priceBand(ipo))],
    ["Lot size", ipo.lotSize ? `${ipo.lotSize.toLocaleString("en-IN")} shares` : null],
    ["Minimum investment", minInvestment(ipo) ? `${esc(inr(minInvestment(ipo), 0))}${ipo.type === "SME" ? " (2 lots, SME minimum)" : ""}` : null],
    ["Issue size", ipo.issueSizeCr ? `₹${Number(ipo.issueSizeCr).toLocaleString("en-IN")} crore` : null],
    ["Fresh issue", ipo.freshIssueCr ? `₹${Number(ipo.freshIssueCr).toLocaleString("en-IN")} crore` : null],
    ["Issue type", ipo.type === "SME" ? "SME IPO" : "Mainboard IPO"],
    ["Listing at", esc(ipo.exchange)],
    ["Registrar", allotment ? esc(allotment.registrar) : null],
    ["Lead manager", esc(ipo.leadManagers)]
  ]);
  const dates = rows([
    ["Bidding opens", esc(fmtDate(ipo.openDate))],
    ["Bidding closes", esc(fmtDate(ipo.closeDate))],
    ["Allotment date", esc(fmtDate(ipo.allotmentDate))],
    ["Listing date", esc(fmtDate(ipo.listingDate))]
  ]);
  const gmpRows = g ? rows([
    ["GMP today", `<span class="${g.gmp >= 0 ? "gain" : "loss"}">${esc(g.text)}</span>`],
    ["Estimated listing price", esc(inr(g.est))],
    ["Estimated profit per lot", ipo.lotSize ? esc(`${g.gmp >= 0 ? "" : "−"}${inr(Math.abs(g.gmp * ipo.lotSize), 0)}`) : null],
    ["Last updated", esc(ipo.gmpUpdated)]
  ]) : "";
  const trend = (ipo.gmpTrend || []).slice(-10).reverse();
  const cats = (ipo.subscription?.categories || []).filter(c => c.times !== null && c.times !== undefined);
  const days = ipo.subscriptionByDay || [];

  const faq = [];
  if (g) faq.push([`What is the ${name} IPO GMP today?`, `The ${name} IPO GMP is ${g.text}${ipo.gmpUpdated ? ` (updated ${ipo.gmpUpdated})` : ""}, which suggests a listing price around ${inr(g.est)}. GMP is unofficial and can change quickly.`]);
  if (priceBand(ipo)) faq.push([`What is the ${name} IPO price band and lot size?`, `The price band is ${priceBand(ipo)}${ipo.lotSize ? ` and one lot is ${ipo.lotSize.toLocaleString("en-IN")} shares` : ""}${minInvestment(ipo) ? `, so the minimum investment is ${inr(minInvestment(ipo), 0)}` : ""}.`]);
  if (ipo.allotmentDate) faq.push([`When is the ${name} IPO allotment date?`, `The allotment is expected on ${fmtDate(ipo.allotmentDate)}.${allotment ? ` The registrar is ${allotment.registrar}.` : ""} You can check the allotment status for all your PANs at once on Qasid.`]);
  faq.push([`How do I check ${name} IPO allotment status?`, `Open Qasid's allotment checker, choose ${name}, and enter one or more PAN numbers. Qasid checks the registrar${allotment ? ` (${allotment.registrar})` : ""} for every PAN in one go and shows how many shares were allotted.`]);
  if (ipo.listingDate) faq.push([`When will ${name} list?`, `${name} ${ipo.status === "listed" ? "listed" : "is expected to list"} on ${fmtDate(ipo.listingDate)}${ipo.exchange ? ` on ${ipo.exchange}` : ""}.${typeof ipo.listingGain === "number" ? ` The listing gain was ${ipo.listingGain.toFixed(1)}%.` : ""}`]);
  if (sub) faq.push([`How many times was the ${name} IPO subscribed?`, `The ${name} IPO was subscribed ${sub} overall${cats.find(c => c.category === "Retail") ? `, with the retail portion at ${Number(cats.find(c => c.category === "Retail").times).toFixed(2)}x` : ""}${ipo.subscription?.updatedAt ? ` (as of ${ipo.subscription.updatedAt})` : ""}.`]);

  const body = `
<div class="crumbs"><a href="/">Qasid</a> › <a href="/ipo">IPOs</a> › ${esc(name)}</div>
<h1>${esc(name)} IPO: GMP, Subscription, Allotment Status and Listing Date</h1>
<p class="lead"><span class="chip">${STAGE[ipo.status] || ""}</span><span class="chip">${ipo.type === "SME" ? "SME" : "Mainboard"}</span>${esc(statusLine(ipo, today))}</p>
<div class="cta">
  <a class="btn primary" href="${allotLink}">${allotmentOut ? "Check allotment status" : "Allotment checker"}</a>
  <a class="btn ghost" href="${appIpo}">Live details in Qasid</a>
</div>

<h2>${esc(name)} IPO details</h2>
<div class="card"><table>${details}</table></div>
${ad()}

${dates ? `<h2>${esc(name)} IPO dates</h2><div class="card"><table>${dates}</table></div>` : ""}

${gmpRows ? `<h2>${esc(name)} IPO GMP today</h2><div class="card"><table>${gmpRows}</table></div>` : ""}
${trend.length > 1 ? `<h2>GMP trend</h2><div class="card"><table class="grid"><tr><th>Date</th><th class="num">GMP</th></tr>${trend.map(t => `<tr><td>${esc(fmtDate(t.date))}</td><td class="num">${esc(inr(t.gmp))}</td></tr>`).join("")}</table></div>` : ""}

${cats.length ? `<h2>${esc(name)} IPO subscription status</h2><div class="card"><table class="grid"><tr><th>Category</th><th class="num">Subscribed</th></tr>${cats.map(c => `<tr><td>${esc(c.category)}</td><td class="num">${Number(c.times).toFixed(2)}x</td></tr>`).join("")}</table></div>${ipo.subscription?.updatedAt ? `<p class="muted">As of ${esc(ipo.subscription.updatedAt)}.</p>` : ""}` : sub ? `<h2>Subscription</h2><p>Subscribed <b>${esc(sub)}</b> overall.</p>` : ""}
${days.length > 1 ? `<h2>Day-wise subscription</h2><div class="card"><table class="grid"><tr><th>Day</th><th class="num">Total</th><th class="num">Retail</th></tr>${days.map(d => `<tr><td>${esc(fmtDate(d.date))}</td><td class="num">${d.total != null ? `${Number(d.total).toFixed(2)}x` : "–"}</td><td class="num">${d.Retail != null ? `${Number(d.Retail).toFixed(2)}x` : "–"}</td></tr>`).join("")}</table></div>` : ""}

${ipo.status === "listed" && ipo.listingPrice ? `<h2>Listing performance</h2><div class="card"><table>${rows([["Issue price", esc(inr(ipo.issuePrice || ipo.priceMax))], ["Listing price", esc(inr(ipo.listingPrice))], ["Listing gain", typeof ipo.listingGain === "number" ? `<span class="${ipo.listingGain >= 0 ? "gain" : "loss"}">${ipo.listingGain >= 0 ? "+" : ""}${ipo.listingGain.toFixed(2)}%</span>` : null]])}</table></div>` : ""}

<h2>How to check ${esc(name)} allotment status</h2>
<p>On <a href="${allotLink}">Qasid's allotment checker</a>, pick ${esc(name)} and enter your PAN numbers — several at once if your family applied. Qasid asks the registrar${allotment ? ` (${esc(allotment.registrar)})` : ""} for each PAN and shows the shares allotted, so you don't have to search the registrar's website one PAN at a time.</p>

${ad()}
<h2>${esc(name)} IPO FAQs</h2>
<div class="card">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>

${related.length ? `<h2>Other IPOs</h2><div class="card list">${related.map(r => `<a class="row" href="/ipo/${r.slug}"><b>${esc(r.ipo.name)}</b><span>${esc(STAGE[r.ipo.status] || "")}${gmpInfo(r.ipo) ? ` · GMP ${esc(gmpInfo(r.ipo).text)}` : ""}</span></a>`).join("")}</div>` : ""}
`;

  const descBits = [g ? `GMP ${g.text}` : null, priceBand(ipo) ? `price band ${priceBand(ipo)}` : null, ipo.lotSize ? `lot ${ipo.lotSize} shares` : null, sub ? `subscribed ${sub}` : null].filter(Boolean);
  return layout({
    title: `${name} IPO GMP, Subscription, Allotment Status ${year} | Qasid`,
    description: `${name} IPO: ${descBits.join(", ")}. ${statusLine(ipo, today)} Check allotment status for all your PANs at once.`.slice(0, 300),
    path: `/ipo/${slug}`,
    body,
    jsonLd: [
      breadcrumb([["Qasid", "/"], ["IPOs", "/ipo"], [name, `/ipo/${slug}`]]),
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }
    ]
  });
}

// All IPOs, grouped by stage
function renderIndexPage(entries) {
  const today = todayIst();
  const group = (status, title, sub, keep = () => true, max = Infinity) => {
    const list = entries.filter(e => e.ipo.status === status && keep(e)).slice(0, max);
    if (!list.length) return "";
    return `<h2>${title}</h2><div class="card list">${list.map(({ ipo, slug }) => {
      const g = gmpInfo(ipo);
      const right = [g ? `GMP ${g.text}` : null, sub(ipo)].filter(Boolean).join(" · ");
      return `<a class="row" href="/ipo/${slug}"><b>${esc(ipo.name)}${ipo.type === "SME" ? ' <span class="chip">SME</span>' : ""}</b><span>${esc(right)}</span></a>`;
    }).join("")}</div>`;
  };
  const body = `
<h1>IPO GMP Today: Live Grey Market Premium, Subscription and Allotment Status</h1>
<p class="lead">Every current Indian IPO, Mainboard and SME, with today's GMP, price band, subscription and key dates. Updated through the day.</p>
<div class="cta"><a class="btn primary" href="/#/allotment">Check allotment status</a><a class="btn ghost" href="/#/planner">IPO planner</a></div>
${group("open", "Open IPOs", ipo => (ipo.closeDate === today ? "last day today" : `closes ${fmtDate(ipo.closeDate)}`))}
${group("upcoming", "Upcoming IPOs", ipo => (ipo.openDate ? `opens ${fmtDate(ipo.openDate)}` : "dates soon"))}
${ad()}
${group("closed", "Closed IPOs (awaiting listing)", ipo => (ipo.listingDate ? `lists ${fmtDate(ipo.listingDate)}` : ""))}
${group("listed", "Recently listed IPOs", ipo => (typeof ipo.listingGain === "number" ? `listing gain ${ipo.listingGain >= 0 ? "+" : ""}${ipo.listingGain.toFixed(1)}%` : ""), e => !e.archived)}
${ad()}
${group("listed", "Older IPOs", ipo => (ipo.listingDate ? `listed ${fmtDate(ipo.listingDate)}` : ""), e => e.archived, 60)}
`;
  return layout({
    title: "IPO GMP Today: Live Grey Market Premium, Subscription & Allotment Status | Qasid",
    description: "Live IPO GMP today for every Indian Mainboard and SME IPO, with price band, subscription status, allotment and listing dates. Check allotment status for all your PANs at once.",
    path: "/ipo",
    body,
    jsonLd: [breadcrumb([["Qasid", "/"], ["IPOs", "/ipo"]])]
  });
}

function renderNotFound() {
  return layout({
    title: "IPO not found | Qasid",
    ads: false,
    description: "This IPO is no longer listed on Qasid.",
    path: "/ipo",
    body: `<h1>IPO not found</h1><p class="lead">This IPO is no longer on Qasid's list. See <a href="/ipo">all current IPOs and their GMP</a>.</p>`
  });
}

function renderSitemap(entries) {
  const urls = [["/", "daily"], ["/ipo", "hourly"], ["/allotment-status", "hourly"], ...REGISTRARS.map(reg => [`/allotment-status/${reg.slug}`, "daily"]),
    ...entries.map(e => [`/ipo/${e.slug}`, e.ipo.status === "listed" ? "weekly" : "hourly"])];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, f]) => `  <url><loc>${SITE}${p}</loc><changefreq>${f}</changefreq></url>`).join("\n")}\n</urlset>\n`;
}

/* ---------------- Registrar allotment-status pages ---------------- */
// Registrars by their public page address. "aka" is how people also search for them.
const REGISTRARS = [
  { id: "kfin", slug: "kfintech", name: "KFintech", aka: "KFin Technologies (formerly Karvy)" },
  { id: "mufg", slug: "link-intime", name: "Link Intime", aka: "MUFG Intime India (formerly Link Intime)" },
  { id: "bigshare", slug: "bigshare", name: "Bigshare Services", aka: "Bigshare" },
  { id: "skyline", slug: "skyline-financial", name: "Skyline Financial Services", aka: "Skyline" },
  { id: "purva", slug: "purva-sharegistry", name: "Purva Sharegistry", aka: "Purva" },
  { id: "maashitla", slug: "maashitla", name: "Maashitla Securities", aka: "Maashitla" },
  { id: "integrated", slug: "integrated-registry", name: "Integrated Registry Management", aka: "Integrated Registry" },
  { id: "satellite", slug: "satellite-corporate", name: "Satellite Corporate Services", aka: "Satellite Corporate" },
  { id: "accurate", slug: "accurate-securities", name: "Accurate Securities and Registry", aka: "Accurate Securities" },
  { id: "mas", slug: "mas-services", name: "MAS Services", aka: "MAS Services" }
];

const checkLink = item => `/#/allotment/${encodeURIComponent(`${item.source}:${item.clientId}`)}`;
const cleanItemName = name => String(name).replace(/^\[[^\]]+\]\s*/, "");
const faqLd = faq => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

function allotmentRows(list) {
  return list.map(({ item, page }) => `<a class="row" href="${checkLink(item)}"><b>${esc(page ? page.ipo.name : cleanItemName(item.name))}</b><span>Check allotment →</span></a>`).join("");
}

// One registrar: what it is, the IPOs whose allotment it has out now, and how to check
function renderRegistrarPage(reg, list, website) {
  const name = reg.name;
  const faq = [
    [`How do I check ${name} IPO allotment status?`, `Open Qasid's allotment checker, pick the IPO, and enter your PAN numbers. Qasid asks ${name} for every PAN at once and shows how many shares were allotted. You can also check one PAN at a time on ${name}'s own website.`],
    ["Can I check allotment for many PANs at once?", "Yes. Qasid checks up to 50 PANs in one go, which is useful when several family members applied."],
    [`When is ${name} allotment status available?`, `Usually on the evening of the allotment date, a day or two after bidding closes. Qasid lists an IPO as soon as ${name} publishes its allotment and can send you an alert.`],
    ['What does "not applied" mean?', `It means ${name} has no application for that PAN in this IPO. Check that you picked the right IPO and that the bid was placed with this PAN.`]
  ];
  const others = REGISTRARS.filter(r => r.id !== reg.id);
  const body = `
<div class="crumbs"><a href="/">Qasid</a> › <a href="/allotment-status">Allotment status</a> › ${esc(name)}</div>
<h1>${esc(name)} IPO Allotment Status: Check by PAN Online</h1>
<p class="lead">${esc(reg.aka)} is the registrar for many Indian IPOs. Check the allotment status for all your PANs at once on Qasid, without searching ${esc(name)}'s website one PAN at a time.</p>
<div class="cta"><a class="btn primary" href="/#/allotment">Check allotment status</a>${website ? `<a class="btn ghost" href="${esc(website)}" rel="nofollow noopener">${esc(name)} website</a>` : ""}</div>

<h2>${esc(name)} IPOs with allotment out</h2>
${list.length ? `<div class="card list">${allotmentRows(list)}</div>` : `<p class="muted">No allotment is open at ${esc(name)} right now. New allotments appear here the moment they are published.</p>`}

${ad()}
<h2>How to check ${esc(name)} allotment status</h2>
<p>1. Open <a href="/#/allotment">Qasid's allotment checker</a>. 2. Choose the IPO from the list (only IPOs whose allotment is out are shown). 3. Enter one or more PAN numbers and tap Check. Qasid shows the shares allotted for each PAN, and you can save PANs to check every future IPO in one tap.</p>

<h2>${esc(name)} allotment FAQs</h2>
<div class="card">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>

${ad()}
<h2>Other registrars</h2>
<div class="card list">${others.map(r => `<a class="row" href="/allotment-status/${r.slug}"><b>${esc(r.name)} allotment status</b><span>→</span></a>`).join("")}</div>
`;
  return layout({
    title: `${name} IPO Allotment Status: Check by PAN Online | Qasid`,
    description: `Check ${name} IPO allotment status for all your PANs at once. See every IPO whose allotment is out at ${reg.aka}, with a one-tap PAN check.`,
    path: `/allotment-status/${reg.slug}`,
    body,
    jsonLd: [breadcrumb([["Qasid", "/"], ["Allotment status", "/allotment-status"], [name, `/allotment-status/${reg.slug}`]]), faqLd(faq)]
  });
}

// All registrars, and every allotment that is out right now
function renderRegistrarIndex(groups) {
  const latest = REGISTRARS.flatMap(r => (groups.get(r.id) || []).slice(0, 3));
  const body = `
<h1>IPO Allotment Status: Check by PAN for Every Registrar</h1>
<p class="lead">Check the allotment status of any Indian IPO — KFintech, Link Intime (MUFG), Bigshare, Skyline and every other registrar — for all your PANs at once.</p>
<div class="cta"><a class="btn primary" href="/#/allotment">Check allotment status</a><a class="btn ghost" href="/ipo">IPO GMP today</a></div>
${latest.length ? `<h2>Latest allotments out</h2><div class="card list">${allotmentRows(latest)}</div>` : ""}
<h2>Allotment status by registrar</h2>
<div class="card list">${REGISTRARS.map(r => {
    const n = (groups.get(r.id) || []).length;
    return `<a class="row" href="/allotment-status/${r.slug}"><b>${esc(r.name)}</b><span>${n ? `${n} IPO${n > 1 ? "s" : ""} with allotment out` : "→"}</span></a>`;
  }).join("")}</div>
${ad()}
<h2>How IPO allotment works</h2>
<p>After bidding closes, the registrar runs the allotment (a lottery when the IPO is oversubscribed) and publishes the result, usually on the evening of the allotment date. Shares reach your demat account and blocked money is released a day later; the shares list on the exchange after that.</p>
`;
  return layout({
    title: "IPO Allotment Status: Check by PAN for Every Registrar | Qasid",
    description: "Check IPO allotment status by PAN for KFintech, Link Intime, Bigshare, Skyline and every other registrar. All your PANs at once, in one tap.",
    path: "/allotment-status",
    body,
    jsonLd: [breadcrumb([["Qasid", "/"], ["Allotment status", "/allotment-status"]])]
  });
}

module.exports = { slugify, withSlugs, renderIpoPage, renderIndexPage, renderNotFound, renderSitemap, renderRegistrarPage, renderRegistrarIndex, REGISTRARS, SITE };

