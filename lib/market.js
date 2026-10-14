// IPO calendar / subscription / GMP aggregated from public exchange and IPO-tracker endpoints:
//  - Investorgain: full board (upcoming/open/listed), GMP, lot, size, allotment & listing dates, category subscription
//  - NSE: symbols, price bands, detail page data (RHP, registrar, lot), consolidated live subscription
//  - BSE: recent DRHP filings
const { axios, browserHeaders, CookieJar, decodeHtml } = require("./http");
const { stripTags } = require("./html");
const history = require("./history");

/* ---------------- small utils ---------------- */
const num = v => {
  if (v === null || v === undefined) return null;
  const n = parseFloat(decodeHtml(String(v)).replace(/,/g, "").match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i)?.[0]);
  return isFinite(n) ? n : null;
};

function normName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/\b(limited|ltd|ipo|sme|the)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// "14-Oct-2026" / "05-OCT-2026" / "2026-10-14" / "16-10-2026" -> "2026-10-14"
function isoDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
    return `${m[3]}-${String(MONTHS[m[2].toLowerCase()] + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "Rs.275 to Rs.289" / "Rs. 275 to Rs. 289 per Equity Share" / "275.00-289.00"
function parsePriceBand(text) {
  const nums = (String(text || "").match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(n => n > 0);
  if (nums.length === 0) return {};
  return { priceMin: Math.min(...nums.slice(0, 2)), priceMax: Math.max(...nums.slice(0, 2)) };
}

function cached(ttlMs, fn) {
  let value = null, at = 0, inFlight = null;
  const wrapped = async (force = false) => {
    if (!force && value && Date.now() - at < ttlMs) return value;
    if (inFlight) return inFlight;
    inFlight = fn().then(v => { value = v; at = Date.now(); return v; }).finally(() => { inFlight = null; });
    try { return await inFlight; } catch (err) { if (value) return value; throw err; }
  };
  return wrapped;
}

/* ---------------- Investorgain ---------------- */
function financialPath() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const month = now.getMonth() + 1, year = now.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  return `${month}/${year}/${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
}

async function investorgainReport(reportId, param = "all") {
  const url = `https://webnodejs.investorgain.com/cloud/v2/report/data-read/${reportId}/1/${financialPath()}/0/${param}`;
  const res = await axios.get(url, { headers: browserHeaders({ referer: "https://www.investorgain.com/" }), timeout: 15000 });
  return Array.isArray(res.data?.reportTableData) ? res.data.reportTableData : [];
}

function fromInvestorgain(row) {
  const nameHtml = String(row.Name || "");
  const badge = nameHtml.match(/(NSE SME|BSE SME)/)?.[1];
  const listed = nameHtml.match(/L@([\d.]+)\s*\(([-\d.]+)%\)/);
  const gmpMatch = String(row.GMP || "").match(/<b>(-?[\d.]+)<\/b>/);
  const sizeCr = num(stripTags(row["IPO Size"]));
  const isSme = (row["~ipo_category1"] || row["~IPO_Category"]) === "SME";
  return {
    name: decodeHtml(row["~ipo_name"] || stripTags(nameHtml)),
    type: isSme ? "SME" : "Mainboard",
    exchange: badge || (isSme ? "SME" : "NSE, BSE"),
    priceMax: num(row["Price (₹)"]) || null,
    lotSize: num(row.Lot) || null,
    issueSizeCr: sizeCr,
    openDate: isoDate(row["~Srt_Open"]),
    closeDate: isoDate(row["~Srt_Close"]),
    allotmentDate: isoDate(row["~Srt_BoA_Dt"]),
    listingDate: isoDate(row["~Str_Listing"]),
    gmp: gmpMatch ? Number(gmpMatch[1]) : null,
    gmpPercent: num(row["~gmp_percent_calc"]),
    gmpUpdated: stripTags(row["Updated-On"] || "") || null,
    peRatio: num(row["~P/E"]),
    listingPrice: listed ? Number(listed[1]) : null,
    listingGain: listed ? Number(listed[2]) : null,
    igStatus: row["~ipo_status1"] || null,
    gmpPath: /^\/gmp\/[a-z0-9-]+\/\d+\/$/.test(row["~urlrewrite_folder_name"] || "") ? row["~urlrewrite_folder_name"] : null,
    subscription: num(row.Sub) ? { total: num(row.Sub) } : null
  };
}

function subscriptionFromInvestorgain(row) {
  const categories = [
    ["QIB", "QIB"], ["NII", "NII"], ["bNII (> ₹10L)", "BHNI"], ["sNII (₹2–10L)", "SHNI"], ["Retail", "RII"], ["Employee", "EMP"], ["Shareholder", "SHR"]
  ].filter(([, key]) => row[key] !== undefined && row[key] !== "" && num(row[key]) !== null)
    .map(([category, key]) => ({ category, times: num(row[key]) }));
  const totalHtml = String(row.Total || "");
  return {
    total: num(totalHtml.match(/<b>([\d.]+)<\/b>/)?.[1] ?? stripTags(totalHtml)),
    categories: [...categories, { category: "Total", times: num(totalHtml.match(/<b>([\d.]+)<\/b>/)?.[1]) }],
    updatedAt: totalHtml.match(/<small[\s\S]*?<b>([^<]+)<\/b>/)?.[1] || null
  };
}

// Day-wise GMP from the IPO's Investorgain page ("GMP Trend" table): [{ date, gmp }] oldest first
const gmpHistoryCache = new Map();

async function getGmpHistory(gmpPath) {
  if (!/^\/gmp\/[a-z0-9-]+\/\d+\/$/.test(gmpPath || "")) throw new Error("invalid GMP path");
  const hit = gmpHistoryCache.get(gmpPath);
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.value;

  const res = await axios.get(`https://www.investorgain.com${gmpPath}`, { headers: browserHeaders({ accept: "text/html" }), timeout: 20000 });
  // The table is embedded in an escaped RSC payload as well as HTML; normalise quotes/entities first
  const html = String(res.data).replace(/\\"/g, '"').replace(/\\u0026/g, "&");
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const byDate = new Map();
  const rowRe = /data-title="GMP Date &(?:amp;)? Time">(\d{1,2})-([A-Za-z]{3})[^<]*<[\s\S]*?data-title="GMP"[^>]*>\s*₹\s*(-?[\d.]+)/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month === undefined) continue;
    // Rows carry no year: anything "in the future" belongs to last year
    let year = now.getFullYear();
    if (month > now.getMonth() + 1) year -= 1;
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (!byDate.has(date)) byDate.set(date, Number(m[3])); // rows are newest first; keep the day's latest
  }
  const value = [...byDate.entries()].map(([date, gmp]) => ({ date, gmp })).sort((a, b) => a.date.localeCompare(b.date));
  gmpHistoryCache.set(gmpPath, { value, at: Date.now() });
  if (gmpHistoryCache.size > 200) gmpHistoryCache.delete(gmpHistoryCache.keys().next().value);
  return value;
}

// Combine scraped day-wise GMP with our own snapshots (ours wins for days both have - it's fresher)
function mergeGmp(scraped = [], own = []) {
  const byDate = new Map((scraped || []).map(p => [p.date, p.gmp]));
  for (const p of own || []) byDate.set(p.date, p.gmp);
  return [...byDate.entries()].map(([date, gmp]) => ({ date, gmp })).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------------- Chittorgarh (backup board, logos, applications) ---------------- */
async function chittorgarhReport(reportId, param) {
  const url = `https://webnodejs.chittorgarh.com/cloud/report/data-read/${reportId}/1/${financialPath()}/0/${param}/0`;
  const res = await axios.get(url, { headers: browserHeaders({ referer: "https://www.chittorgarh.com/" }), timeout: 15000 });
  return Array.isArray(res.data?.reportTableData) ? res.data.reportTableData : [];
}

function fromChittorgarh(row) {
  const company = String(row.Company || "");
  return {
    // Anchor text only - the cell also carries a status badge ("O", "U"...)
    name: decodeHtml(company.match(/<a[^>]*>([^<]+)<\/a>/)?.[1] || stripTags(company)).replace(/\s+IPO$/i, ""),
    type: row["Issue Category"] === "SME" ? "SME" : "Mainboard",
    exchange: row["Listing at"] || null,
    ...parsePriceBand(row["Issue Price (Rs.)"]),
    issueSizeCr: num(row["Issue Amount (Rs.cr.)"]) || null,
    freshIssueCr: num(row["Fresh Capital (Rs.cr.)"]),
    ofsCr: num(row["Offer for sale (Rs.cr.)"]),
    openDate: isoDate(row["~Issue_Open_Date"]),
    closeDate: isoDate(row["~IssueCloseDate"]),
    listingDate: isoDate(row["~ListingDate"]),
    leadManagers: stripTags(row["Left Lead Manager"] || "") || null,
    logo: /^https?:\/\//.test(row["~compare_image"] || "") ? row["~compare_image"] : null,
    sourceUrl: company.match(/href="([^"]+)"/)?.[1] || null
  };
}

// Only issues with real dates near today; Chittorgarh also lists years of history and unscheduled pipeline names
function chittorgarhInWindow(row, today) {
  if (!row["Opening Date"]) return false;
  const close = isoDate(row["~IssueCloseDate"]);
  const listing = isoDate(row["~ListingDate"]);
  return (listing || close || "9999") >= addDays(today, -45);
}

/* ---------------- NSE ---------------- */
const nseJar = new CookieJar();
const NSE_HEADERS = () => browserHeaders({
  accept: "application/json, text/plain, */*",
  referer: "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
  cookie: nseJar.toString()
});

async function nseGet(path, retried = false) {
  const res = await axios.get(`https://www.nseindia.com${path}`, { headers: NSE_HEADERS(), timeout: 15000, validateStatus: () => true });
  nseJar.absorb(res);
  if ((res.status === 401 || res.status === 403) && !retried) {
    // Akamai sometimes wants cookies from a real page first
    nseJar.absorb(await axios.get("https://www.nseindia.com/market-data/all-upcoming-issues-ipo", {
      headers: browserHeaders({ accept: "text/html" }), timeout: 15000, validateStatus: () => true
    }));
    return nseGet(path, true);
  }
  if (res.status >= 400) throw new Error(`NSE ${path} -> HTTP ${res.status}`);
  return res.data;
}

function nseDate(d) {
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function fromNse(row) {
  const isSme = row.series === "SME" || row.securityType === "SME";
  return {
    name: decodeHtml(row.companyName || row.company || ""),
    symbol: row.symbol || null,
    series: isSme ? "SME" : "EQ",
    type: isSme ? "SME" : "Mainboard",
    ...parsePriceBand(row.issuePrice || row.priceRange),
    // Only past issues carry a single final price here; open ones carry the band text
    issuePrice: /^\s*[\d.]+\s*$/.test(String(row.issuePrice || "")) ? num(row.issuePrice) : null,
    openDate: isoDate(row.issueStartDate || row.ipoStartDate),
    closeDate: isoDate(row.issueEndDate || row.ipoEndDate),
    listingDate: isoDate(row.listingDate),
    nseTotalSubscription: num(row.noOfTime),
    nseStatus: row.status || null
  };
}

/* ---------------- SEBI filings (DRHP / RHP) ---------------- */
// smid=10: draft offer documents (DRHP), smid=11: red herring prospectuses (RHP)
async function sebiFilings(smid) {
  const res = await axios.get(`https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=${smid}`, {
    headers: browserHeaders({ accept: "text/html" }), timeout: 20000
  });
  const rows = [...String(res.data).matchAll(/<tr[^>]*>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']*)/g)];
  return rows.map(m => {
    const title = decodeHtml(m[3].split("<")[0]).replace(/\s+/g, " ").trim();
    const kind = /addendum/i.test(title) ? "Addendum" : /\bUDRHP\b/i.test(title) ? "UDRHP" : /\bDRHP\b/i.test(title) ? "DRHP" : /\bRHP\b/i.test(title) ? "RHP" : "Filing";
    const filed = new Date(`${m[1].trim()} UTC`); // "Oct 13, 2026"
    return {
      name: title.replace(/\s*[-–—]\s*(addendum.*|updated.*|u?drhp.*|rhp.*)$/i, "").trim(),
      kind,
      filedDate: isNaN(filed) ? null : filed.toISOString().slice(0, 10),
      url: m[2].startsWith("http") ? m[2] : `https://www.sebi.gov.in${m[2]}`
    };
  });
}

const getDrhpFilings = cached(3 * 60 * 60 * 1000, () => sebiFilings(10));
const getRhpFilings = cached(3 * 60 * 60 * 1000, () => sebiFilings(11));


/* ---------------- Board assembly ---------------- */
function classify(ipo, today) {
  if (ipo.listingDate && ipo.listingDate <= today) return "listed";
  if (ipo.igStatus === "LP" || ipo.igStatus === "LN") return "listed";
  if (ipo.openDate && ipo.openDate > today) return "upcoming";
  if (ipo.openDate && ipo.closeDate && ipo.openDate <= today && ipo.closeDate >= today) return "open";
  if (ipo.closeDate && ipo.closeDate < today) return "closed";
  if (ipo.nseStatus === "Active" || ipo.igStatus === "O") return "open";
  return "upcoming";
}

// 90s keeps subscription/GMP near-live without hammering the sources
const getBoard = cached(90 * 1000, async () => {
  const sources = [];
  const byName = new Map();
  // Sources spell names differently ("Zetwerk" / "Zetwerk Manufacturing Business Ltd." / "...Businesses Limited"):
  // fall back to a prefix match, but only when it is unambiguous
  const resolveKey = name => {
    const key = normName(name);
    if (!key || byName.has(key)) return key;
    const hits = [...byName.keys()].filter(k => Math.min(k.length, key.length) >= 6 && (k.startsWith(key) || key.startsWith(k)));
    return hits.length === 1 ? hits[0] : key;
  };
  const upsert = (item, prefer = false) => {
    const key = resolveKey(item.name);
    if (!key) return;
    const existing = byName.get(key);
    if (!existing) { byName.set(key, { ...item }); return; }
    for (const [k, v] of Object.entries(item)) {
      if (v === null || v === undefined || v === "") continue;
      if (prefer || existing[k] === null || existing[k] === undefined || existing[k] === "") existing[k] = v;
    }
  };

  const today = todayIst();
  const [ig, igSub, nseCurrent, nseUpcoming, nsePastEq, nsePastSme, rhps, cg, cgSub] = await Promise.allSettled([
    investorgainReport(331, "all"),
    investorgainReport(333, "all"),
    nseGet("/api/ipo-current-issue"),
    nseGet("/api/all-upcoming-issues?category=ipo"),
    nseGet(`/api/public-past-issues?from_date=${nseDate(addDays(today, -40))}&to_date=${nseDate(today)}&security_type=Equity`),
    nseGet(`/api/public-past-issues?from_date=${nseDate(addDays(today, -40))}&to_date=${nseDate(today)}&security_type=SME`),
    getRhpFilings(),
    chittorgarhReport(82, "all"),
    chittorgarhReport(21, "mainboard")
  ]);
  const rhpByName = new Map(rhps.status === "fulfilled" ? rhps.value.map(f => [normName(f.name), f]) : []);

  if (ig.status === "fulfilled") { sources.push("Investorgain"); ig.value.forEach(r => upsert(fromInvestorgain(r))); }
  else console.error("[MARKET] Investorgain board failed:", ig.reason.message);

  // Chittorgarh only fills gaps (and adds logos/links), so it also keeps the board alive if Investorgain breaks
  if (cg.status === "fulfilled") {
    sources.push("Chittorgarh");
    cg.value.filter(r => chittorgarhInWindow(r, today)).forEach(r => upsert(fromChittorgarh(r)));
  } else console.error("[MARKET] Chittorgarh board failed:", cg.reason.message);

  const nseRows = [nseCurrent, nseUpcoming, nsePastEq, nsePastSme]
    .filter(r => r.status === "fulfilled" && Array.isArray(r.value)).flatMap(r => r.value);
  if (nseRows.length) sources.push("NSE");
  [nseCurrent, nseUpcoming, nsePastEq, nsePastSme].forEach(r => { if (r.status === "rejected") console.error("[MARKET] NSE failed:", r.reason.message); });
  // NSE is authoritative for symbol, price band and dates
  nseRows.filter(r => !r.category || r.category === "Total").forEach(r => upsert(fromNse(r), true));

  if (igSub.status === "fulfilled") {
    igSub.value.forEach(row => {
      const item = byName.get(resolveKey(row["~ipo_name"] || stripTags(String(row.Name || "").split("<br>")[0])));
      if (item) item.subscription = subscriptionFromInvestorgain(row);
    });
  }

  // Chittorgarh mainboard subscription: application counts, and a fallback when Investorgain has none
  if (cgSub.status === "fulfilled") {
    cgSub.value.forEach(row => {
      const item = byName.get(resolveKey(String(row.Company || "").match(/<a[^>]*>([^<]+)<\/a>/)?.[1] || stripTags(String(row.Company || ""))));
      if (!item) return;
      const applications = num(row.Applications);
      if (applications) item.applications = applications;
      if (!item.subscription?.categories && num(row["Total (x)"]) !== null) {
        const cats = [["QIB", "QIB (x)"], ["NII", "NII (x)"], ["bNII (> ₹10L)", "bNII (x)"], ["sNII (₹2–10L)", "sNII (x)"], ["Retail", "Retail (x)"], ["Employee", "Employee (x)"], ["Shareholder", "Shareholder (x)"]]
          .filter(([, k]) => row[k] !== "" && row[k] !== null && row[k] !== undefined)
          .map(([category, k]) => ({ category, times: num(row[k]) }));
        item.subscription = { total: num(row["Total (x)"]), categories: [...cats, { category: "Total", times: num(row["Total (x)"]) }], updatedAt: row["Subscription as on"] || null };
      }
    });
  }

  const board = { open: [], upcoming: [], closed: [], listed: [] };
  for (const item of byName.values()) {
    if (!item.subscription?.total && item.nseTotalSubscription) item.subscription = { total: item.nseTotalSubscription };
    if (!item.priceMax && item.issuePrice) item.priceMax = item.issuePrice;
    if (!item.priceMin) item.priceMin = item.priceMax || null;
    if (item.issuePrice && item.listingPrice && item.listingGain === null) {
      item.listingGain = ((item.listingPrice - item.issuePrice) / item.issuePrice) * 100;
    }
    const rhp = rhpByName.get(normName(item.name));
    if (rhp) item.documents = [{ label: "RHP (SEBI)", url: rhp.url }];
    item.status = classify(item, today);
    item.id = item.symbol || normName(item.name);
    history.record(normName(item.name), item);
    const past = history.get(normName(item.name));
    item.gmpTrend = mergeGmp(gmpHistoryCache.get(item.gmpPath)?.value, past.gmp);
    item.subscriptionByDay = past.sub;
    // Warm the day-wise GMP history in the background for live issues, so cards get sparklines next refresh
    if (item.gmpPath && item.status !== "listed" && !gmpHistoryCache.has(item.gmpPath)) getGmpHistory(item.gmpPath).catch(() => {});
    delete item.igStatus;
    delete item.nseStatus;
    delete item.nseTotalSubscription;
    board[item.status].push(item);
  }

  const byDate = (field, dir = 1) => (a, b) => dir * String(a[field] || "9999").localeCompare(String(b[field] || "9999"));
  board.open.sort(byDate("closeDate"));
  board.upcoming.sort(byDate("openDate"));
  board.closed.sort(byDate("closeDate", -1));
  board.listed = board.listed.filter(i => !i.listingDate || i.listingDate >= addDays(today, -45)).sort(byDate("listingDate", -1));

  if (sources.length === 0) throw new Error("all IPO data sources failed");
  return { ...board, sources, updatedAt: Date.now() };
});

/* ---------------- Detail (NSE) ---------------- */
const detailCache = new Map();

async function getIpoDetail(symbol, type) {
  const series = type === "SME" ? "SME" : "EQ";
  const key = `${symbol}:${series}`;
  const hit = detailCache.get(key);
  if (hit && Date.now() - hit.at < 90 * 1000) return hit.value;

  const data = await nseGet(`/api/ipo-detail?symbol=${encodeURIComponent(symbol)}&series=${series}`);
  const info = data?.issueInfo?.dataList || [];
  const clean = v => stripTags(String(v || "").replace(/^"+|"+$/g, ""));
  const field = re => clean(info.find(x => re.test(x.title || ""))?.value);

  const detail = {};
  const band = field(/^Price Range/i);
  if (band) Object.assign(detail, parsePriceBand(band));
  const lot = num(field(/^(Bid Lot|Lot Size)/i));
  if (lot) detail.lotSize = lot;
  const period = field(/^Issue Period/i).match(/(.+?)\s+to\s+(.+)/i);
  if (period) { detail.openDate = isoDate(period[1]); detail.closeDate = isoDate(period[2]); }
  const faceValue = field(/^Face Value/i);
  if (faceValue) detail.faceValue = num(faceValue);
  detail.issueSize = field(/^Issue Size/i) || undefined;
  detail.registrarName = field(/Name of the Registrar/i) || undefined;
  detail.leadManagers = field(/Book Running Lead Manager/i) || undefined;
  detail.exchange = field(/^Exchanges?/i) || undefined;
  if (data?.metaInfo?.listingDate) detail.listingDate = isoDate(data.metaInfo.listingDate);

  // Every entry that carries a link becomes a document (RHP, basis of issue price, anchor report, forms…)
  detail.documents = info
    .map(x => ({ label: clean(x.title), url: String(x.value || "").match(/https?:\/\/[^\s"'<>]+/)?.[0] }))
    // Keep the issue's own filings (RHP, anchor report, basis of price...), not generic SEBI/UPI help links
    .filter(d => d.url && d.label && /nsearchives\.nseindia\.com\/content\/ipo\//i.test(d.url) && !/BIDDING_CENTERS|FORMS_/i.test(d.url))
    .map(d => ({ ...d, label: /red herring/i.test(d.label) ? "RHP" : d.label }));

  const cats = (data?.activeCat?.dataList || []).filter(r => r.srNo !== "Sr.No." && r.category !== "Category");
  const labelFor = r => {
    if (r.category === "Total") return "Total";
    if (r.srNo === "1") return "QIB";
    if (r.srNo === "2") return "NII";
    if (r.srNo === "2.1") return "bNII (> ₹10L)";
    if (r.srNo === "2.2") return "sNII (₹2–10L)";
    if (r.srNo === "3") return "Retail";
    if (/employee/i.test(r.category)) return "Employee";
    if (/shareholder/i.test(r.category)) return "Shareholder";
    return null;
  };
  const categories = cats.map(r => ({
    category: labelFor(r), offered: num(r.noOfShareOffered), bid: num(r.noOfSharesBid), times: num(r.noOfTotalMeant)
  })).filter(c => c.category);
  // NSE reports zero offered shares for SME issues, so its multiples are meaningless there
  if (categories.some(c => c.offered > 0)) {
    detail.subscription = {
      total: categories.find(c => c.category === "Total")?.times ?? null,
      categories,
      updatedAt: String(data.activeCat.updateTime || "").replace(/^Updated as on\s*/i, "") || null
    };
  }

  Object.keys(detail).forEach(k => detail[k] === undefined && delete detail[k]);
  detailCache.set(key, { value: detail, at: Date.now() });
  if (detailCache.size > 300) detailCache.delete(detailCache.keys().next().value);
  return detail;
}

module.exports = { getBoard, getIpoDetail, getGmpHistory, getDrhpFilings, getRhpFilings, normName };
