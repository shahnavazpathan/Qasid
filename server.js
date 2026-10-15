const express = require("express");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();
const cors = require("cors");
const { createAuth, rateLimit } = require("./lib/auth");
const { registrars, getRegistrar } = require("./lib/registrars");
const { mapWithConcurrency } = require("./lib/http");
const market = require("./lib/market");
const storeLib = require("./lib/store");
const push = require("./lib/push");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================================
   EXPRESS + AUTH
========================================================= */

const ALLOWED_WEB_DOMAINS = [
  "https://qasid.thevellora.co.in",
  "https://ipo.thevellora.co.in",
  "https://qasid-x637.onrender.com",
  // Extra deployed/preview origins, comma-separated (e.g. EXTRA_ORIGINS=https://staging.example.com)
  ...(process.env.EXTRA_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean)
];

// Behind Render's proxy: take the client IP from X-Forwarded-For (one hop). Set TRUST_PROXY=0 when exposed directly.
app.set("trust proxy", process.env.TRUST_PROXY === undefined ? 1 : Number(process.env.TRUST_PROXY) || false);

// Session cookies are signed with SESSION_SECRET, or a secret generated once and kept in the database (see start())
const auth = createAuth({ secret: process.env.SESSION_SECRET, allowedOrigins: ALLOWED_WEB_DOMAINS });
app.use(cors(auth.corsOptions()));
app.use(express.json({ limit: "20kb" }));
app.use(auth.sessionIssuer);
app.use(auth.apiGuard);
// Per IP (loose: shared mobile IPs) and per browser session (tight)
const bySession = req => req.clientKey;
const panCount = req => (Array.isArray(req.body?.pans) ? req.body.pans.length : 1);
const tooManyChecks = "Too many PAN checks. Please try again in a few minutes.";
app.use("/api/", rateLimit({ windowMs: 60 * 1000, max: 600 }));
app.use("/api/", rateLimit({ windowMs: 60 * 1000, max: 120, key: bySession }));
// Each PAN is a live registrar lookup: budget PANs, not just requests
app.use("/api/check", rateLimit({ windowMs: 10 * 60 * 1000, max: 2000, cost: panCount, message: tooManyChecks }));
app.use("/api/check", rateLimit({ windowMs: 10 * 60 * 1000, max: 300, key: bySession, cost: panCount, message: tooManyChecks }));
app.use("/api/push/test", rateLimit({ windowMs: 10 * 60 * 1000, max: 5, key: bySession }));

/* ---------- Web Push (installed PWA) ---------- */
function validSubscription(sub) {
  return sub && typeof sub.endpoint === "string" && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length < 1000 &&
    sub.keys && typeof sub.keys.p256dh === "string" && typeof sub.keys.auth === "string" &&
    sub.keys.p256dh.length < 200 && sub.keys.auth.length < 100;
}

app.get("/api/push/public-key", (req, res) => {
  const key = push.getPublicKey();
  if (!key) return res.status(503).json({ success: false, error: "Push not ready." });
  res.json({ success: true, publicKey: key });
});

app.post("/api/push/subscribe", async (req, res) => {
  const sub = req.body?.subscription;
  if (!validSubscription(sub)) return res.status(400).json({ success: false, error: "Invalid subscription." });
  const platform = String(req.body?.platform || "").slice(0, 20);
  try {
    await storeLib.store().upsertWebSub({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, { platform });
    res.json({ success: true });
  } catch (err) {
    console.error("[PUSH] subscribe:", err.message);
    res.status(500).json({ success: false, error: "Could not save subscription." });
  }
});

app.post("/api/push/unsubscribe", async (req, res) => {
  const endpoint = String(req.body?.endpoint || "");
  if (!endpoint) return res.status(400).json({ success: false, error: "Missing endpoint." });
  await storeLib.store().removeWebSub(endpoint).catch(() => {});
  res.json({ success: true });
});

// Lets a user confirm alerts work on their device; only sends to the caller's own subscription
app.post("/api/push/test", async (req, res) => {
  const sub = req.body?.subscription;
  if (!validSubscription(sub)) return res.status(400).json({ success: false, error: "Invalid subscription." });
  const result = await push.sendWebPush([sub], {
    type: "test", title: "Qasid alerts are on ✅", body: "You'll get a notification here the moment a new IPO allotment is out.", url: "/#/home", tag: "qasid-test"
  });
  res.json({ success: result.sent === 1, error: result.sent ? undefined : "Couldn't reach this device." });
});

// Serve the React build (client/dist) when present; fall back to the legacy static UI
const fs = require("fs");
const WEB_ROOT = fs.existsSync(path.join(__dirname, "client", "dist", "index.html"))
  ? path.join(__dirname, "client", "dist")
  : path.join(__dirname, "public");
app.use(express.static(WEB_ROOT));

/* =========================================================
   IPO LIST (ALL REGISTRARS)
========================================================= */
const IPO_CACHE_TIME = 5 * 60 * 1000;
let ipoCache = { data: null, fetchedAt: 0 };
let ipoFetchInProgress = null;

// Last good list per registrar, so one registrar being down doesn't wipe its IPOs
// (and doesn't make them all look "new" - and trigger push spam - when it recovers)
const lastGoodLists = new Map();
const registrarStatus = new Map();
// First time an IPO was seen: Map<"source:clientId", timestamp>
const ipoDiscoveryTimes = new Map();

function ipoIdentity(ipo) { return `${ipo.source}:${ipo.clientId}`; }

async function fetchRegistrarIpos(registrar) {
  const startedAt = Date.now();
  try {
    const ipos = (await registrar.listIpos()).map(ipo => ({
      ...ipo,
      name: `[${registrar.tag}] ${ipo.name}`,
      clientId: String(ipo.clientId),
      source: registrar.id,
      registrar: registrar.label
    }));
    if (ipos.length === 0) throw new Error("empty IPO list - page format may have changed");
    // Registrar pages already list newest first; only registrars with sequential IDs are re-sorted by ID
    if (registrar.sortById) ipos.sort((a, b) => (parseInt(b.clientId, 10) || 0) - (parseInt(a.clientId, 10) || 0));
    lastGoodLists.set(registrar.id, ipos);
    registrarStatus.set(registrar.id, { ok: true, count: ipos.length, ms: Date.now() - startedAt, at: Date.now() });
    return ipos;
  } catch (err) {
    console.error(`[${registrar.tag}] Failed to fetch IPO list:`, err.message);
    registrarStatus.set(registrar.id, { ok: false, error: err.message, ms: Date.now() - startedAt, at: Date.now() });
    return lastGoodLists.get(registrar.id) || [];
  }
}

const SERVER_STARTED = Date.now();

// name -> allotment date (falls back to listing/close date) using the IPO board; unknown -> null
async function allotmentDateLookup() {
  let board;
  try { board = await market.getBoard(); } catch { return () => null; }
  const dates = new Map();
  for (const item of ["open", "closed", "listed", "upcoming"].flatMap(s => board[s] || [])) {
    const date = item.allotmentDate || item.listingDate || item.closeDate;
    if (date) dates.set(market.normName(item.name), date);
  }
  const keys = [...dates.keys()];
  return name => {
    const key = market.normName(String(name).replace(/^\[[^\]]+\]\s*/, ""));
    if (!key) return null;
    if (dates.has(key)) return dates.get(key);
    const hits = keys.filter(k => Math.min(k.length, key.length) >= 6 && (k.startsWith(key) || key.startsWith(k)));
    return hits.length === 1 ? dates.get(hits[0]) : null;
  };
}

async function fetchLiveIpoList(forceRefresh = false) {
  if (!forceRefresh && ipoCache.data && Date.now() - ipoCache.fetchedAt < IPO_CACHE_TIME) return ipoCache.data;
  if (ipoFetchInProgress) return ipoFetchInProgress;

  ipoFetchInProgress = (async () => {
    try {
      const perRegistrar = await Promise.all(registrars.map(fetchRegistrarIpos));
      const merged = perRegistrar.flat();
      const nowTime = Date.now();
      const registrarOrder = new Map(registrars.map((r, i) => [r.id, i]));
      // Position within its own registrar's list (each list is newest-first) - used to interleave registrars
      const rankInRegistrar = new Map(perRegistrar.flatMap(list => list.map((ipo, i) => [ipoIdentity(ipo), i])));
      const allotmentDates = await allotmentDateLookup();

      merged.forEach(ipo => {
        const key = ipoIdentity(ipo);
        if (!ipoDiscoveryTimes.has(key)) ipoDiscoveryTimes.set(key, nowTime);
        ipo.discoveredAt = ipoDiscoveryTimes.get(key);
        ipo.allotmentDate = allotmentDates(ipo.name);
      });

      // Latest allotment first, regardless of registrar:
      // 1. allotments that appeared while the server was running (newest first)
      // 2. by allotment date from the IPO board (newest first; unknown dates last)
      // 3. interleave registrars by each one's own newest-first order
      const freshAfter = SERVER_STARTED + 2 * 60 * 1000;
      merged.sort((a, b) => {
        const freshA = a.discoveredAt > freshAfter ? a.discoveredAt : 0;
        const freshB = b.discoveredAt > freshAfter ? b.discoveredAt : 0;
        if (freshA !== freshB) return freshB - freshA;
        const dateDiff = String(b.allotmentDate || "").localeCompare(String(a.allotmentDate || ""));
        if (dateDiff) return dateDiff;
        const rankDiff = rankInRegistrar.get(ipoIdentity(a)) - rankInRegistrar.get(ipoIdentity(b));
        if (rankDiff) return rankDiff;
        return registrarOrder.get(a.source) - registrarOrder.get(b.source);
      });

      if (merged.length === 0 && ipoCache.data) return ipoCache.data;
      ipoCache = { data: merged, fetchedAt: Date.now() };
      return merged;
    } finally {
      ipoFetchInProgress = null;
    }
  })();

  return ipoFetchInProgress;
}

/* =========================================================
   ALLOTMENT CHECK
========================================================= */
const NOT_APPLIED_MSG = "You have not applied for this IPO.";
const ALLOTMENT_CACHE_LIMIT = 20000;
const allotmentResultCache = new Map();

function cacheAllotment(key, value) {
  if (allotmentResultCache.size >= ALLOTMENT_CACHE_LIMIT) {
    allotmentResultCache.delete(allotmentResultCache.keys().next().value);
  }
  allotmentResultCache.set(key, value);
}

async function checkOnePan(ipo, registrar, rawPan) {
  const pan = String(rawPan).trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return { pan, success: false, error: "Invalid PAN" };

  const cacheKey = `${ipoIdentity(ipo)}:${pan}`;
  const cached = allotmentResultCache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  let outcome;
  try {
    outcome = await registrar.checkPan(ipo, pan);
  } catch (err) {
    console.error(`[${registrar.tag}] check failed for ${ipo.clientId}:`, err.message);
    return { pan, success: false, error: "Unable to contact allotment service.", source: registrar.id };
  }

  if (outcome.status === "not_applied") return { pan, success: false, error: NOT_APPLIED_MSG, source: registrar.id };
  if (outcome.status !== "found") return { pan, success: false, error: outcome.error || "Unable to contact allotment service.", source: registrar.id };

  const result = {
    pan,
    success: true,
    source: registrar.id,
    data: {
      Name: outcome.name,
      Allotted: outcome.allotted,
      Applied: outcome.applied || 0,
      Applications: outcome.applications || []
    }
  };
  if (outcome.server) result.server = outcome.server;
  cacheAllotment(cacheKey, result);
  return result;
}

/* =========================================================
   BACKGROUND IPO MONITOR (push notifications)
========================================================= */
// Every allotment ever seen (persisted), so a restart/redeploy neither misses nor re-announces allotments.
// It only ever grows: a registrar that is briefly down doesn't make its IPOs look "new" when it returns.
let knownAllotments = null;
const KNOWN_LIMIT = 5000;
// More "new" allotments than this in one pass means a registrar changed its IDs/format, not real news
const MAX_NEW_PER_RUN = 8;

async function runIpoMonitor() {
  try {
    const current = await fetchLiveIpoList(true);
    if (!knownAllotments) {
      const saved = await storeLib.store().getConfig("knownAllotments");
      if (!saved) {
        knownAllotments = new Set(current.map(ipoIdentity));
        await storeLib.store().setConfig("knownAllotments", [...knownAllotments]);
        console.log(`[IPO MONITOR] Seeded ${knownAllotments.size} known allotments`);
        return;
      }
      knownAllotments = new Set(saved);
    }

    const added = current.filter(ipo => !knownAllotments.has(ipoIdentity(ipo)));
    if (added.length === 0) return;

    added.forEach(ipo => knownAllotments.add(ipoIdentity(ipo)));
    const list = [...knownAllotments];
    knownAllotments = new Set(list.slice(Math.max(0, list.length - KNOWN_LIMIT)));
    await storeLib.store().setConfig("knownAllotments", [...knownAllotments]);

    if (added.length > MAX_NEW_PER_RUN) {
      console.warn(`[IPO MONITOR] ${added.length} new at once - treating as a registrar format change, not notifying`);
      return;
    }
    for (const ipo of added) {
      console.log(`[IPO MONITOR] New allotment: ${ipo.name}`);
      await push.notifyAllotment(ipo).catch(err => console.error("[PUSH] notify failed:", err.message));
    }
  } catch (error) {
    console.error("[IPO MONITOR] Error:", error.message);
  }
}

async function startIpoMonitor() {
  await runIpoMonitor();

  function scheduleNextRun() {
    // Allotments usually come out in the evening IST: poll every minute 7 PM-4 AM, else every 5 minutes
    const istHour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false })) % 24;
    const intervalMs = (istHour >= 19 || istHour < 4) ? 60 * 1000 : 5 * 60 * 1000;

    setTimeout(async () => {
      await runIpoMonitor();
      scheduleNextRun();
    }, intervalMs);
  }

  scheduleNextRun();
}

/* =========================================================
   API ROUTES
========================================================= */
app.get("/api/ipos", async (req, res) => {
  try {
    const ipos = await fetchLiveIpoList(false);
    res.json({ success: true, total: ipos.length, ipos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/registrars", async (req, res) => {
  res.json({
    success: true,
    registrars: registrars.map(r => ({
      id: r.id,
      label: r.label,
      website: r.website,
      status: registrarStatus.get(r.id) || null,
      servers: r.getServerStatus ? r.getServerStatus() : undefined
    }))
  });
});

app.post("/api/check", async (req, res) => {
  try {
    const { clientId, source, pans } = req.body;
    if (!clientId) return res.status(400).json({ success: false, error: "Please select an IPO." });
    if (!Array.isArray(pans) || pans.length === 0) return res.status(400).json({ success: false, error: "Please enter at least one PAN." });
    if (pans.length > 50) return res.status(400).json({ success: false, error: "Maximum 50 PANs at once." });

    const ipos = await fetchLiveIpoList(false);
    // `source` disambiguates registrars that reuse the same numeric IDs; older clients only send clientId
    const selectedIpo = ipos.find(ipo => ipo.clientId === String(clientId) && (!source || ipo.source === source));
    if (!selectedIpo) return res.status(400).json({ success: false, error: "Invalid IPO selected." });

    const registrar = getRegistrar(selectedIpo.source);
    const uniquePans = [...new Set(pans.map(p => String(p).trim().toUpperCase()))];
    const results = await mapWithConcurrency(uniquePans, registrar.concurrency || 3, pan => checkOnePan(selectedIpo, registrar, pan));

    return res.json({ success: true, total: results.length, ipo: { name: selectedIpo.name, source: selectedIpo.source, registrar: registrar.label }, results });
  } catch (error) {
    console.error("[CHECK] Error:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ---------- IPO market data (calendar, subscription, GMP, filings) ---------- */
app.get("/api/market", async (req, res) => {
  try {
    const board = await market.getBoard(req.query.refresh === "1");
    res.json({ success: true, ...board });
  } catch (error) {
    console.error("[MARKET] Error:", error.message);
    res.status(502).json({ success: false, error: "IPO data sources are unavailable right now." });
  }
});

app.get("/api/market/ipo/:symbol", async (req, res) => {
  const symbol = String(req.params.symbol || "").toUpperCase();
  if (!/^[A-Z0-9&-]{1,20}$/.test(symbol)) return res.status(400).json({ success: false, error: "Invalid symbol." });
  try {
    const detail = await market.getIpoDetail(symbol, req.query.type === "SME" ? "SME" : "Mainboard");
    res.json({ success: true, detail });
  } catch (error) {
    console.error(`[MARKET] Detail ${symbol}:`, error.message);
    res.status(502).json({ success: false, error: "Details unavailable right now." });
  }
});

app.get("/api/market/gmp-history", async (req, res) => {
  const gmpPath = String(req.query.path || "");
  if (!/^\/gmp\/[a-z0-9-]+\/\d+\/$/.test(gmpPath)) return res.status(400).json({ success: false, error: "Invalid path." });
  try {
    res.json({ success: true, history: await market.getGmpHistory(gmpPath) });
  } catch (error) {
    console.error("[MARKET] GMP history:", error.message);
    res.status(502).json({ success: false, error: "GMP history unavailable right now." });
  }
});

app.get("/api/market/drhp", async (req, res) => {
  try {
    res.json({ success: true, filings: await market.getDrhpFilings() });
  } catch (error) {
    console.error("[MARKET] DRHP:", error.message);
    res.status(502).json({ success: false, error: "SEBI filings unavailable right now." });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", uptime: process.uptime(), timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) });
});

app.get("/", (req, res) => res.sendFile(path.join(WEB_ROOT, "index.html")));

// Storage and the session secret come first, so no visitor is handed a cookie signed with a throwaway key
async function start() {
  await storeLib.init();
  if (!process.env.SESSION_SECRET) {
    let secret = await storeLib.store().getConfig("sessionSecret");
    if (!secret) {
      secret = crypto.randomBytes(32).toString("hex");
      await storeLib.store().setConfig("sessionSecret", secret);
    }
    auth.setSecret(secret);
  }
  await push.initPush();

  app.listen(PORT, () => {
    console.log("==================================================");
    console.log(`  QASID - IPO CHECKER (${registrars.map(r => r.tag).join("/")})`);
    console.log("==================================================");
    console.log(`  Open: http://localhost:${PORT}`);
    startIpoMonitor();
  });
}

start().catch(err => {
  console.error("[STARTUP] Failed:", err);
  process.exit(1);
});
