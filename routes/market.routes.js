const router = require("express").Router();
const market = require("../controllers/market.controller");

router.get("/", market.board);
router.get("/ipo/:id", market.ipoDetail);
router.get("/gmp-history", market.gmpHistory);
router.get("/drhp", market.drhpFilings);

module.exports = router;
