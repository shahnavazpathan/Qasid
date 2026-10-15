const router = require("express").Router();
const allotment = require("../controllers/allotment.controller");

router.get("/ipos", allotment.listIpos);
router.get("/registrars", allotment.listRegistrars);
router.post("/check", allotment.checkPans);

module.exports = router;
