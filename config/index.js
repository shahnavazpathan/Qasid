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
  SESSION_SECRET: process.env.SESSION_SECRET || null
};
