const router = require("express").Router();
const account = require("../controllers/account.controller");

router.post("/auth/google", account.googleSignIn);
router.post("/auth/logout", account.logout);
router.get("/user/pans", account.getPans);
router.post("/user/pans", account.savePans);
router.post("/user/consent", account.acceptConsent);
router.delete("/user", account.deleteAccount);

module.exports = router;
