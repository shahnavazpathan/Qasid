// End-to-end test of the allotment-out notification chain, through the real server.
// 1. Runs a mock push endpoint (what a real FCM/推送 service looks like to web-push).
// 2. Subscribes a browser subscription to it via /api/push/subscribe.
// 3. Announces a fake "allotment out" via the test endpoint, which calls the production notifyAllotment.
// 4. Checks the mock received the push with the expected title/body/type/tag.
const https = require("https");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");

const PORT = 4001;
const SERVER = "http://localhost:3000";
const TEST_IPO = { name: "[Test] Mock IPO", clientId: "999999", source: "test", registrar: "Test" };

let received = [];

// A real p256dh key is a base64url-encoded 65-byte uncompressed P-256 EC point (0x04 + 32-byte x + 32-byte y).
// web-push validates that the point actually lies on the curve, so derive it from a real keypair.
function validP256dh() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return ecdh.getPublicKey().toString("base64url");
}

// web-push requires an https endpoint. The mock uses a self-signed cert so the push can actually be
// delivered - this mirrors what a real push service looks like.
const CERT_DIR = path.join(__dirname, "..", ".claude-tmp");
const mock = https.createServer(
  { key: fs.readFileSync(path.join(CERT_DIR, "key.pem")), cert: fs.readFileSync(path.join(CERT_DIR, "cert.pem")) },
  (req, res) => {
    let body = "";
    req.on("data", c => (body += c.toString()));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    });
  }
);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  await new Promise(r => mock.listen(PORT, r));
  console.log("[test] mock push endpoint on :" + PORT);

  // 1. Subscribe a browser subscription whose endpoint points at the mock
  const sub = {
    endpoint: `https://localhost:${PORT}/mock-sub`,
    keys: { p256dh: validP256dh(), auth: crypto.randomBytes(16).toString("base64url") }
  };
  const subRes = await axios.post(`${SERVER}/api/push/subscribe`, { subscription: sub, platform: "test" });
  console.log("[test] subscribe:", subRes.data);

  // 2. Announce a fake "allotment out" through the production path
  const annRes = await axios.post(`${SERVER}/api/test/announce`, { ipo: TEST_IPO, insecure: true }, {
    headers: { Origin: SERVER, Referer: SERVER + "/" }
  });
  console.log("[test] announce:", annRes.data);
  await sleep(500);

  if (received.length === 0) {
    console.log("[test] FAIL: mock received no push payload");
    process.exit(1);
  }
  const push = received[0];
  const payload = JSON.parse(push.body);
  console.log("[test] PASS: mock received push");
  console.log("  endpoint:", push.headers.host);
  console.log("  title   :", payload.title);
  console.log("  body    :", payload.body);
  console.log("  type    :", payload.type);
  console.log("  tag     :", payload.tag);
  console.log("  url     :", payload.url);

  const checks = [
    ["title", payload.title, "Allotment out 🎉"],
    ["type", payload.type, "allotment"],
    ["tag", payload.tag, `allotment-${TEST_IPO.source}-${TEST_IPO.clientId}`],
    ["url", payload.url, "/#/allotment"],
    ["body", payload.body, "Mock IPO allotment is now available. Tap to check your PANs."]
  ];
  for (const [name, got, want] of checks) {
    if (got !== want) { console.log(`[test] FAIL: ${name} expected "${want}" got "${got}"`); process.exit(1); }
  }
  if (payload.ipo.clientId !== TEST_IPO.clientId || payload.ipo.source !== TEST_IPO.source) {
    console.log("[test] FAIL: ipo payload wrong"); process.exit(1);
  }

  console.log("[test] ALL CHECKS PASSED");
  mock.close();
  process.exit(0);
}

main().catch(err => { console.error("[test] ERROR:", err.response?.data || err.message); mock.close(); process.exit(1); });