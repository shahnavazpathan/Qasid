// API access control.
//
// Who may call /api/*:
//   1. Our own web app: a browser that loaded the page (and so holds a signed, HttpOnly session cookie),
//      calling from an allowed Origin/Referer. Origin/Referer alone are trivially spoofed with curl, so they
//      are never enough on their own.
//   2. The mobile app / trusted scripts: HMAC-signed requests (x-timestamp + x-signature, SECRET_API_KEY).
//   3. Local development (Vite on :5173 proxying to :3000): loopback connections from a localhost origin.
// Everything is rate limited per client IP, with a tighter budget for PAN lookups (they hit registrars).
const crypto = require("crypto");

const SESSION_COOKIE = "qs";
const SESSION_MAX_AGE_S = 90 * 24 * 60 * 60;   // long enough for the service worker's background checks
const SESSION_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNATURE_WINDOW_MS = 2 * 60 * 1000;

function createAuth({ secret, allowedOrigins }) {
  // Without SECRET_API_KEY sessions still work (random per-process key) but signed requests are refused.
  const sessionKey = crypto.createHash("sha256").update(`qasid-session:${secret || crypto.randomBytes(32).toString("hex")}`).digest();
  const origins = new Set(allowedOrigins.map(d => d.replace(/\/+$/, "")));

  /* ---------- helpers ---------- */
  const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest("hex");

  function safeEqual(a, b) {
    const x = Buffer.from(String(a), "utf8"), y = Buffer.from(String(b), "utf8");
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  }

  // Exact origin of a header URL ("https://site/path?x" -> "https://site"); null if unparseable.
  // Exact matching matters: a prefix check would also accept "https://qasid.thevellora.co.in.evil.com".
  function originOf(value) {
    try { return new URL(value).origin; } catch { return null; }
  }

  function requestOrigin(req) {
    return originOf(req.headers.origin || req.headers.referer || "");
  }

  // A direct loopback connection (not a reverse proxy on the same box, which adds X-Forwarded-For)
  function isLocalConnection(req) {
    const ip = req.socket.remoteAddress || "";
    return !req.headers["x-forwarded-for"] && (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1");
  }

  const isLocalhostOrigin = origin => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");

  /* ---------- session cookie ---------- */
  function readCookie(req, name) {
    for (const part of String(req.headers.cookie || "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return null;
  }

  // Token: "<issuedAtMs>.<random id>.<hmac>"
  function verifySession(req) {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return null;
    const [issued, id, sig] = token.split(".");
    if (!issued || !id || !sig || !safeEqual(sig, hmac(sessionKey, `${issued}.${id}`))) return null;
    const age = Date.now() - Number(issued);
    if (!(age >= 0 && age < SESSION_MAX_AGE_S * 1000)) return null;
    return { id, age };
  }

  function issueSession(req, res) {
    const issued = String(Date.now());
    const id = crypto.randomBytes(12).toString("base64url");
    const secure = req.secure ? "; Secure" : "";
    res.append("Set-Cookie", `${SESSION_COOKIE}=${issued}.${id}.${hmac(sessionKey, `${issued}.${id}`)}; Path=/; Max-Age=${SESSION_MAX_AGE_S}; HttpOnly; SameSite=Strict${secure}`);
  }

  // Hand a session to every visitor that loads the web app shell
  function sessionIssuer(req, res, next) {
    const isShell = req.method === "GET" && (req.path === "/" || req.path === "/index.html");
    if (isShell) {
      const session = verifySession(req);
      if (!session || session.age > SESSION_REFRESH_MS) issueSession(req, res);
    }
    next();
  }

  /* ---------- signed requests (mobile app) ---------- */
  function verifySignature(req) {
    const signature = req.headers["x-signature"];
    const timestamp = req.headers["x-timestamp"];
    if (!signature || !timestamp || !secret) return false;
    const ts = parseInt(timestamp, 10);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_WINDOW_MS) return false;
    const bodyString = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : "";
    return safeEqual(signature, hmac(secret, timestamp + req.path + bodyString));
  }

  /* ---------- the gate ---------- */
  function apiGuard(req, res, next) {
    if (!req.path.startsWith("/api/")) return next();

    if (req.headers["x-signature"]) {
      if (verifySignature(req)) { req.clientKey = `app:${req.ip}`; return next(); }
      return res.status(403).json({ success: false, error: "Unauthorized: invalid or expired signature." });
    }

    const origin = requestOrigin(req);

    if (isLocalConnection(req) && isLocalhostOrigin(origin)) { req.clientKey = "local"; return next(); }

    // Browsers set Sec-Fetch-Site and page scripts cannot forge it; anything cross-site is refused outright
    const fetchSite = req.headers["sec-fetch-site"];
    const sameSite = !fetchSite || fetchSite === "same-origin";

    const session = sameSite && origins.has(origin) ? verifySession(req) : null;
    if (session) { req.clientKey = `s:${session.id}`; return next(); }

    return res.status(403).json({ success: false, error: "Unauthorized. Open Qasid in your browser to use it." });
  }

  // Same-origin only: no third-party site gets CORS access
  function corsOptions() {
    return { origin: (origin, cb) => cb(null, !origin || origins.has(origin)), credentials: true };
  }

  return { sessionIssuer, apiGuard, corsOptions };
}

/* ---------- rate limiting (in-memory, per IP) ---------- */
// rateLimit({ windowMs, max, key?: req => string, cost?: req => units, message })
// Default key is the client IP. Indian mobile networks put many users behind one IP (CGNAT), so per-IP
// limits are kept loose and paired with tighter per-session ones (key: req => req.clientKey).
const byIp = req => req.ip || req.socket.remoteAddress || "unknown";

function rateLimit({ windowMs, max, key = byIp, cost = () => 1, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const k = key(req) || byIp(req);
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) hits.set(k, entry = { used: 0, reset: now + windowMs });
    const units = Math.max(1, cost(req) || 1);
    if (entry.used + units > max) {
      res.set("Retry-After", String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ success: false, error: message || "Too many requests. Please wait a minute and try again." });
    }
    entry.used += units;
    next();
  };
}

module.exports = { createAuth, rateLimit };
