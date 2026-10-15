// Builds the Express app: proxy trust, security middleware (CORS, API gate, rate limits), then routes.
const express = require("express");
const { TRUST_PROXY } = require("./config");
const { applySecurity } = require("./middleware/security");
const { mountRoutes } = require("./routes");

const app = express();
app.set("trust proxy", TRUST_PROXY);
applySecurity(app);
mountRoutes(app);

module.exports = app;
