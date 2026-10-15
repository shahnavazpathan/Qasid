// CORS, the website-only API gate and rate limits. See lib/auth.js for how the gate works.
const express = require("express");
const cors = require("cors");
const { createAuth, rateLimit } = require("../lib/auth");
const { ALLOWED_WEB_DOMAINS, SESSION_SECRET } = require("../config");

// One shared instance: server.js swaps in the persisted session secret at startup (auth.setSecret)
const auth = createAuth({ secret: SESSION_SECRET, allowedOrigins: ALLOWED_WEB_DOMAINS });

// Per IP (loose: shared mobile IPs) and per browser session (tight)
const bySession = req => req.clientKey;
const panCount = req => (Array.isArray(req.body?.pans) ? req.body.pans.length : 1);
const tooManyChecks = "Too many PAN checks. Please try again in a few minutes.";

function applySecurity(app) {
  app.use(cors(auth.corsOptions()));
  app.use(express.json({ limit: "20kb" }));
  app.use(auth.sessionIssuer);
  app.use(auth.apiGuard);

  app.use("/api/", rateLimit({ windowMs: 60 * 1000, max: 600 }));
  app.use("/api/", rateLimit({ windowMs: 60 * 1000, max: 120, key: bySession }));
  // Each PAN is a live registrar lookup: budget PANs, not just requests
  app.use("/api/check", rateLimit({ windowMs: 10 * 60 * 1000, max: 2000, cost: panCount, message: tooManyChecks }));
  app.use("/api/check", rateLimit({ windowMs: 10 * 60 * 1000, max: 300, key: bySession, cost: panCount, message: tooManyChecks }));
  app.use("/api/push/test", rateLimit({ windowMs: 10 * 60 * 1000, max: 5, key: bySession }));
}

module.exports = { auth, applySecurity };
