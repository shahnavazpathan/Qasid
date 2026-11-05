// Mounts every route on the app. Push routes come before the static site, exactly as before the split.
const express = require("express");
const path = require("path");
const { WEB_ROOT } = require("../config");
const alerts = require("../lib/alerts");

function mountRoutes(app) {
  app.use("/api/push", require("./push.routes"));
  app.use("/api", require("./account.routes"));
  app.use("/v1", require("./v1.routes"));
  app.use(require("./pages.routes"));
  app.use(express.static(WEB_ROOT));
  app.use("/api", require("./allotment.routes"));
  app.use("/api/market", require("./market.routes"));

  app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK", uptime: process.uptime(), timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), failingSources: alerts.failing() });
  });

  app.get("/", (req, res) => res.sendFile(path.join(WEB_ROOT, "index.html")));

  // Last stop for errors a route didn't handle (Express 5 also forwards rejected async handlers here):
  // a clean JSON reply instead of Express's HTML error page, and the details only in the log
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    // Malformed or oversized JSON bodies are the client's mistake
    if (err.type === "entity.parse.failed") return res.status(400).json({ success: false, error: "Invalid JSON body." });
    if (err.type === "entity.too.large") return res.status(413).json({ success: false, error: "Request body too large." });
    console.error(`[ERROR] ${req.method} ${req.path}:`, err);
    res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
  });
}

module.exports = { mountRoutes };
