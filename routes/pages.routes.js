// Public pages for search engines: all IPOs, one page per IPO, the sitemap and robots.txt
const router = require("express").Router();
const pages = require("../controllers/pages.controller");

router.get("/ipo", pages.ipoIndex);
router.get("/ipo/:slug", pages.ipoPage);
router.get("/sitemap.xml", pages.sitemap);
router.get("/robots.txt", pages.robots);

module.exports = router;
