// Public pages for search engines: all IPOs, one page per IPO, allotment status by registrar, the sitemap and robots.txt
const router = require("express").Router();
const pages = require("../controllers/pages.controller");

router.get("/ipo", pages.ipoIndex);
router.get("/ipo/:slug", pages.ipoPage);
router.get("/allotment-status", pages.registrarIndex);
router.get("/allotment-status/:registrar", pages.registrarPage);
router.get("/sitemap.xml", pages.sitemap);
router.get("/robots.txt", pages.robots);

module.exports = router;
