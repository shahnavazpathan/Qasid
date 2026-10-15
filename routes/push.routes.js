const router = require("express").Router();
const push = require("../controllers/push.controller");

router.get("/public-key", push.publicKey);
router.post("/subscribe", push.subscribe);
router.post("/unsubscribe", push.unsubscribe);
router.post("/test", push.test);

module.exports = router;
