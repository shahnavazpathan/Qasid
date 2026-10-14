const express = require("express");
const axios = require("axios");
const path = require("path");
require("dotenv").config();
const crypto = require("crypto");
const cors = require("cors");
const { registrars, getRegistrar } = require("./lib/registrars");
const { mapWithConcurrency } = require("./lib/http");
const market = require("./lib/market");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================================
   EXPRESS + AUTH
========================================================= */
app.use(cors());
app.use(express.json());

const SECRET_API_KEY = process.env.SECRET_API_KEY;
const pushTokens = new Set();

const ALLOWED_WEB_DOMAINS = [
  "https://qasid.thevellora.co.in",
  "https://ipo.thevellora.co.in",
  "https://qasid-x637.onrender.com",
  "http://localhost:3000",
  "http://localhost:8081",
  // Extra dev/preview origins, comma-separated (e.g. EXTRA_ORIGINS=http://localhost:3100)
  ...(process.env.EXTRA_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean)
];

app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/health" || !req.path.startsWith("/api/")) return next();

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const isWhitelistedWeb = ALLOWED_WEB_DOMAINS.some(domain =>
    (origin && origin.startsWith(domain)) ||
    (referer && referer.startsWith(domain)) ||
    (req.headers.host && domain.includes(req.headers.host))
  );

  if (isWhitelistedWeb) return next();

  const signature = req.headers["x-signature"];
  const timestamp = req.headers["x-timestamp"];

  if (!signature || !timestamp) return res.status(403).json({ error: "Unauthorized: Missing signature" });
  if (!SECRET_API_KEY) return res.status(500).json({ error: "Server misconfigured: SECRET_API_KEY not set" });

  const now = Date.now();
  if (now - parseInt(timestamp, 10) > 120000) return res.status(403).json({ error: "Request expired" });

  const bodyString = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : "";
  const payload = timestamp + req.path + bodyString;

  const expectedSignature = crypto.createHmac("sha256", SECRET_API_KEY).update(payload).digest("hex");
  if (signature !== expectedSignature) return res.status(403).json({ error: "Unauthorized: Invalid signature" });

  next();
});

app.post("/api/register-token", (req, res) => {
  const { token } = req.body;
  if (token) pushTokens.add(token);
  res.json({ success: true });
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
    ipos.sort((a, b) => (parseInt(b.clientId, 10) || 0) - (parseInt(a.clientId, 10) || 0));
    lastGoodLists.set(registrar.id, ipos);
    registrarStatus.set(registrar.id, { ok: true, count: ipos.length, ms: Date.now() - startedAt, at: Date.now() });
    return ipos;
  } catch (err) {
    console.error(`[${registrar.tag}] Failed to fetch IPO list:`, err.message);
    registrarStatus.set(registrar.id, { ok: false, error: err.message, ms: Date.now() - startedAt, at: Date.now() });
    return lastGoodLists.get(registrar.id) || [];
  }
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

      merged.forEach(ipo => {
        const key = ipoIdentity(ipo);
        if (!ipoDiscoveryTimes.has(key)) ipoDiscoveryTimes.set(key, nowTime);
        ipo.discoveredAt = ipoDiscoveryTimes.get(key);
      });

      // Newly discovered IPOs float to the top across all registrars
      merged.sort((a, b) => {
        if (b.discoveredAt !== a.discoveredAt) return b.discoveredAt - a.discoveredAt;
        const regDiff = registrarOrder.get(a.source) - registrarOrder.get(b.source);
        if (regDiff) return regDiff;
        return (parseInt(b.clientId, 10) || 0) - (parseInt(a.clientId, 10) || 0);
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
let previousIpoSnapshot = null;

async function runIpoMonitor() {
  try {
    const newIpos = await fetchLiveIpoList(true);
    if (!previousIpoSnapshot) {
      previousIpoSnapshot = new Set(newIpos.map(ipoIdentity));
      return;
    }

    const addedIpos = newIpos.filter(ipo => !previousIpoSnapshot.has(ipoIdentity(ipo)));
    for (const ipo of addedIpos) {
      console.log(`[IPO MONITOR] New allotment: ${ipo.name}`);
      const messages = [...pushTokens].map(token => ({
        to: token, sound: "default", title: "New IPO Allotment Out! 🎉", body: `${ipo.name} allotment is now available.`
      }));
      if (messages.length > 0) {
        axios.post("https://exp.host/--/api/v2/push/send", messages)
          .then(() => console.log(`[PUSH] Sent notifications for ${ipo.name} to ${messages.length} devices.`))
          .catch(err => console.error("[PUSH] Failed to send:", err.message));
      }
    }
    previousIpoSnapshot = new Set(newIpos.map(ipoIdentity));
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

app.listen(PORT, async () => {
  console.log("==================================================");
  console.log(`  QASID - IPO CHECKER (${registrars.map(r => r.tag).join("/")})`);
  console.log("==================================================");
  console.log(`  Open: http://localhost:${PORT}`);
  await startIpoMonitor();
});
