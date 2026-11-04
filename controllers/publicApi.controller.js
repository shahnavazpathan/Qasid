// Public data API, sold through RapidAPI (docs/rapidapi/). Read-only IPO calendar, subscription and
// listing data, served from the same caches the website uses, so API traffic never adds load on the
// sources. Deliberately left out: PAN / allotment checks (personal data) and GMP (other sites' content).
const crypto = require("crypto");
const market = require("../lib/market");
const { RAPIDAPI_PROXY_SECRET } = require("../config");

const STATUSES = ["open", "upcoming", "closed", "listed"];
const DISCLAIMER = "Compiled from public exchange, registrar and SEBI pages. Provided as is, without warranty; not investment advice.";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// RapidAPI adds X-RapidAPI-Proxy-Secret to every request it forwards; anything without it skipped RapidAPI
function requireRapidApi(req, res, next) {
  if (!RAPIDAPI_PROXY_SECRET) return res.status(503).json({ success: false, error: "API not enabled." });
  const given = Buffer.from(String(req.headers["x-rapidapi-proxy-secret"] || ""));
  const expected = Buffer.from(RAPIDAPI_PROXY_SECRET);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ success: false, error: "Subscribe on RapidAPI to use this API." });
  }
  next();
}

// Only these fields leave the server
function publicIpo(i) {
  return {
    id: i.id,
    name: i.name,
    symbol: i.symbol || null,
    type: i.type,
    exchange: i.exchange || null,
    status: i.status,
    priceMin: i.priceMin ?? null,
    priceMax: i.priceMax ?? null,
    issuePrice: i.issuePrice ?? null,
    lotSize: i.lotSize ?? null,
    minInvestment: i.priceMax && i.lotSize ? i.priceMax * i.lotSize * (i.type === "SME" ? 2 : 1) : null,
    issueSizeCr: i.issueSizeCr ?? null,
    openDate: i.openDate || null,
    closeDate: i.closeDate || null,
    allotmentDate: i.allotmentDate || null,
    listingDate: i.listingDate || null,
    subscription: i.subscription
      ? { total: i.subscription.total ?? null, categories: i.subscription.categories || [], updatedAt: i.subscription.updatedAt || null }
      : null,
    subscriptionHistory: i.subscriptionByDay || [],
    applications: i.applications ?? null,
    listingPrice: i.listingPrice ?? null,
    listingGainPct: typeof i.listingGain === "number" ? Math.round(i.listingGain * 100) / 100 : null,
    rhpUrl: i.documents?.[0]?.url || null
  };
}

const allIpos = board => STATUSES.flatMap(s => board[s] || []);
const meta = (board, extra = {}) => ({ updatedAt: new Date(board.updatedAt).toISOString(), disclaimer: DISCLAIMER, ...extra });

async function withBoard(res, fn) {
  try {
    await fn(await market.getBoard());
  } catch (err) {
    console.error("[PUBLIC API]", err.message);
    res.status(502).json({ success: false, error: "IPO data is unavailable right now. Please retry shortly." });
  }
}

// GET /v1/ipos?status=open&type=sme&q=name
function listIpos(req, res) {
  const status = String(req.query.status || "").toLowerCase();
  const type = String(req.query.type || "").toLowerCase();
  const q = String(req.query.q || "").toLowerCase().slice(0, 60);
  if (status && !STATUSES.includes(status)) return res.status(400).json({ success: false, error: `status must be one of: ${STATUSES.join(", ")}.` });
  if (type && type !== "mainboard" && type !== "sme") return res.status(400).json({ success: false, error: "type must be mainboard or sme." });
  return withBoard(res, board => {
    const data = (status ? board[status] || [] : allIpos(board))
      .filter(i => !type || i.type.toLowerCase() === type)
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .map(publicIpo);
    res.json({ success: true, data, meta: meta(board, { count: data.length }) });
  });
}

// GET /v1/ipos/:id
function getIpo(req, res) {
  const id = String(req.params.id || "");
  if (!/^[A-Za-z0-9&-]{1,80}$/.test(id)) return res.status(400).json({ success: false, error: "Invalid IPO id." });
  return withBoard(res, board => {
    const ipo = allIpos(board).find(i => i.id === id);
    if (!ipo) return res.status(404).json({ success: false, error: "IPO not found. Use /v1/ipos to get valid ids." });
    res.json({ success: true, data: publicIpo(ipo), meta: meta(board) });
  });
}

// GET /v1/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD: open, close, allotment and listing events by date
function calendar(req, res) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const from = String(req.query.from || today);
  const to = String(req.query.to || new Date(Date.parse(`${from}T00:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10));
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return res.status(400).json({ success: false, error: "from and to must be YYYY-MM-DD dates, from before to." });
  return withBoard(res, board => {
    const events = [];
    for (const i of allIpos(board)) {
      for (const [event, day] of [["opens", i.openDate], ["closes", i.closeDate], ["allotment", i.allotmentDate], ["listing", i.listingDate]]) {
        if (day && day >= from && day <= to) events.push({ date: day, event, id: i.id, name: i.name, type: i.type });
      }
    }
    const order = ["opens", "closes", "allotment", "listing"];
    events.sort((a, b) => a.date.localeCompare(b.date) || order.indexOf(a.event) - order.indexOf(b.event));
    res.json({ success: true, data: events, meta: meta(board, { from, to, count: events.length }) });
  });
}

// GET /v1/filings?kind=drhp|rhp&limit=50: offer documents filed with SEBI
async function filings(req, res) {
  const kind = String(req.query.kind || "drhp").toLowerCase();
  if (kind !== "drhp" && kind !== "rhp") return res.status(400).json({ success: false, error: "kind must be drhp or rhp." });
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  try {
    const list = await (kind === "rhp" ? market.getRhpFilings() : market.getDrhpFilings());
    const data = list.slice(0, limit);
    res.json({ success: true, data, meta: { kind, count: data.length, disclaimer: DISCLAIMER } });
  } catch (err) {
    console.error("[PUBLIC API] filings:", err.message);
    res.status(502).json({ success: false, error: "SEBI filings are unavailable right now. Please retry shortly." });
  }
}

function health(req, res) {
  res.json({ success: true, status: "ok", enabled: !!RAPIDAPI_PROXY_SECRET });
}

module.exports = { requireRapidApi, listIpos, getIpo, calendar, filings, health };
