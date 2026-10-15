require("dotenv").config();
const crypto = require("crypto");
const { PORT, SESSION_SECRET } = require("./config");
const app = require("./app");
const { auth } = require("./middleware/security");
const { registrars } = require("./lib/registrars");
const storeLib = require("./lib/store");
const push = require("./lib/push");
const allotments = require("./lib/allotments");
const history = require("./lib/history");
const resultArchive = require("./lib/resultArchive");
const { loadSavedLists } = require("./services/ipoList.service");
const { startIpoMonitor } = require("./services/monitor.service");

// Storage and the session secret come first, so no visitor is handed a cookie signed with a throwaway key
async function start() {
  await storeLib.init();
  if (!SESSION_SECRET) {
    let secret = await storeLib.store().getConfig("sessionSecret");
    if (!secret) {
      secret = crypto.randomBytes(32).toString("hex");
      await storeLib.store().setConfig("sessionSecret", secret);
    }
    auth.setSecret(secret);
  }
  await push.initPush();
  await Promise.all([allotments.load(), loadSavedLists(), resultArchive.init(), history.attachStore(storeLib.store())]);

  app.listen(PORT, () => {
    console.log("==================================================");
    console.log(`  QASID - IPO CHECKER (${registrars.map(r => r.tag).join("/")})`);
    console.log("==================================================");
    console.log(`  Open: http://localhost:${PORT}`);
    startIpoMonitor();
  });
}

start().catch(err => {
  console.error("[STARTUP] Failed:", err);
  process.exit(1);
});
