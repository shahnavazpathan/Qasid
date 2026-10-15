// Mounts every route on the app. Push routes come before the static site, exactly as before the split.
const express = require("express");
const path = require("path");
const { WEB_ROOT } = require("../config");

function mountRoutes(app) {
  app.use("/api/push", require("./push.routes"));
  app.use(express.static(WEB_ROOT));
  app.use("/api", require("./allotment.routes"));
  app.use("/api/market", require("./market.routes"));

  app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK", uptime: process.uptime(), timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) });
  });

  app.get("/", (req, res) => res.sendFile(path.join(WEB_ROOT, "index.html")));
}

module.exports = { mountRoutes };
