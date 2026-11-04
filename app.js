// Builds the Express app: proxy trust, redirect to the main address, security middleware (CORS, API gate,
// rate limits), then routes.
const express = require("express");
const { TRUST_PROXY, MAIN_HOST, OTHER_HOSTS } = require("./config");
const { applySecurity } = require("./middleware/security");
const { mountRoutes } = require("./routes");

const app = express();
app.set("trust proxy", TRUST_PROXY);

// Send visitors on the other addresses (ipo.thevellora.co.in, the onrender.com one) to the main one:
// Google sign-in only accepts the main address. Page loads only, and never Render's health check.
const otherHosts = new Set(OTHER_HOSTS);
app.use((req, res, next) => {
  const host = String(req.headers.host || "").toLowerCase().split(":")[0];
  if (otherHosts.has(host) && (req.method === "GET" || req.method === "HEAD") && req.path !== "/health") {
    return res.redirect(301, `https://${MAIN_HOST}${req.originalUrl}`);
  }
  next();
});

applySecurity(app);
mountRoutes(app);

module.exports = app;
