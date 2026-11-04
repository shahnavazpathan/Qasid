// Public data API (RapidAPI). Outside /api, so the website's session gate doesn't apply; every route
// except /health needs RapidAPI's proxy secret instead.
const router = require("express").Router();
const api = require("../controllers/publicApi.controller");
const { rateLimit } = require("../lib/auth");

router.get("/health", api.health);
router.use(api.requireRapidApi);
// RapidAPI enforces each plan's quota; this only stops one subscriber from flooding the server
router.use(rateLimit({ windowMs: 60 * 1000, max: 120, key: req => `rapid:${req.headers["x-rapidapi-user"] || req.ip}` }));

router.get("/ipos", api.listIpos);
router.get("/ipos/:id", api.getIpo);
router.get("/calendar", api.calendar);
router.get("/filings", api.filings);

router.use((req, res) => res.status(404).json({ success: false, error: "Unknown endpoint. See /v1/ipos, /v1/calendar and /v1/filings." }));

module.exports = router;
