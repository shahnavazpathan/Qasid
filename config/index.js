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
  LEGAL_VERSION: "2026-11-05",

  // Shared secret RapidAPI sends with every forwarded request (RapidAPI dashboard → your API → Gateway).
  // The public /v1 API stays off until it is set.
  RAPIDAPI_PROXY_SECRET: process.env.RAPIDAPI_PROXY_SECRET || null,

  // ALLOTMENT_ALERTS=off: this copy tracks allotments but sends no "allotment out" notifications. For running
  // a second server against the same database (e.g. while moving hosts), so subscribers aren't alerted twice.
  ALLOTMENT_ALERTS: process.env.ALLOTMENT_ALERTS !== "off",

  // Telegram channel posts (services/telegram.service.js): bot token from @BotFather, and the channel,
  // e.g. @qasid_ipo. Off until both are set.
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || null,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || null,

  // Google AdSense publisher ID (ca-pub-1234567890123456; "pub-…" also accepted). Ads appear only on the public
  // pages (/ipo, /allotment-status), never in the app where PANs are typed. ADSENSE_SLOT, an optional display ad
  // unit ID, adds two fixed in-content ads per page on top of whatever Auto ads places. The ID is public (it is in
  // every page and ads.txt), so it is the default here; set ADSENSE_CLIENT to an empty value to turn ads off.
  ADSENSE_CLIENT: (m => (m ? `ca-pub-${m[1]}` : null))(String(process.env.ADSENSE_CLIENT ?? "pub-3037012624883817").trim().match(/^(?:ca-)?pub-(\d{10,20})$/)),
  ADSENSE_SLOT: /^\d{5,20}$/.test(String(process.env.ADSENSE_SLOT || "").trim()) ? String(process.env.ADSENSE_SLOT).trim() : null,

  // ntfy.sh topic for the owner's failure alerts (lib/alerts.js); pick a long random name, it acts as a password
  ALERT_NTFY_TOPIC: process.env.ALERT_NTFY_TOPIC || null,

  // The only address Google sign-in accepts; the others redirect here
  MAIN_HOST: "qasid.thevellora.co.in",
  OTHER_HOSTS: ["ipo.thevellora.co.in", "qasid-x637.onrender.com"]
};
