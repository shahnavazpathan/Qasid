// Public pages for search engines: all IPOs, one page per IPO, allotment status by registrar, the sitemap, robots.txt and ads.txt
const router = require("express").Router();
const pages = require("../controllers/pages.controller");

router.get("/", pages.home);
router.get("/ipo", pages.ipoIndex);
router.get("/ipo/:slug", pages.ipoPage);
router.get("/allotment-status", pages.registrarIndex);
router.get("/allotment-status/:registrar", pages.registrarPage);
router.get("/sitemap.xml", pages.sitemap);
router.get("/robots.txt", pages.robots);
router.get("/ads.txt", pages.adsTxt);

module.exports = router;
