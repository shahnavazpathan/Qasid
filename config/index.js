// Runtime configuration, read once from the environment.
const path = require("path");

// The built React app (committed, so the server never builds it)
const WEB_ROOT = path.join(__dirname, "..", "client", "dist");

module.exports = {
  PORT: process.env.PORT || 3000,
  WEB_ROOT,

  // Browser origins allowed to use the API (exact match). Extra deployed/preview origins can be added
  // comma-separated via EXTRA_ORIGINS (e.g. EXTRA_ORIGINS=https://staging.example.com)
  ALLOWED_WEB_DOMAINS: [
    "https://qasid.thevellora.co.in",
    "https://ipo.thevellora.co.in",
    "https://qasid-x637.onrender.com",
    ...(process.env.EXTRA_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean)
  ],

  // Behind Render's proxy: take the client IP from X-Forwarded-For (one hop). Set TRUST_PROXY=0 when exposed directly.
  TRUST_PROXY: process.env.TRUST_PROXY === undefined ? 1 : Number(process.env.TRUST_PROXY) || false,

  // Session cookies are signed with SESSION_SECRET, or a secret generated once and kept in the database
  SESSION_SECRET: process.env.SESSION_SECRET || null,

  // OAuth client that Google sign-in tokens must be issued for
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || null,

  // Date of the current Terms of Service and Privacy Policy (client/public/terms.html, privacy.html).
  // Change it whenever either page changes in substance: signed-in users are then asked to agree again.
  LEGAL_VERSION: "2026-11-04",

  // Shared secret RapidAPI sends with every forwarded request (RapidAPI dashboard → your API → Gateway).
  // The public /v1 API stays off until it is set.
  RAPIDAPI_PROXY_SECRET: process.env.RAPIDAPI_PROXY_SECRET || null,

  // ntfy.sh topic for the owner's failure alerts (lib/alerts.js); pick a long random name, it acts as a password
  ALERT_NTFY_TOPIC: process.env.ALERT_NTFY_TOPIC || null,

  // The only address Google sign-in accepts; the others redirect here
  MAIN_HOST: "qasid.thevellora.co.in",
  OTHER_HOSTS: ["ipo.thevellora.co.in", "qasid-x637.onrender.com"]
};
