// Web Push (installed PWA)
const storeLib = require("../lib/store");
const push = require("../lib/push");

function validSubscription(sub) {
  return sub && typeof sub.endpoint === "string" && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length < 1000 &&
    sub.keys && typeof sub.keys.p256dh === "string" && typeof sub.keys.auth === "string" &&
    sub.keys.p256dh.length < 200 && sub.keys.auth.length < 100;
}

function publicKey(req, res) {
  const key = push.getPublicKey();
  if (!key) return res.status(503).json({ success: false, error: "Push not ready." });
  res.json({ success: true, publicKey: key });
}

async function subscribe(req, res) {
  const sub = req.body?.subscription;
  if (!validSubscription(sub)) return res.status(400).json({ success: false, error: "Invalid subscription." });
  const platform = String(req.body?.platform || "").slice(0, 20);
  try {
    await storeLib.store().upsertWebSub({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, { platform });
    res.json({ success: true });
  } catch (err) {
    console.error("[PUSH] subscribe:", err.message);
    res.status(500).json({ success: false, error: "Could not save subscription." });
  }
}

async function unsubscribe(req, res) {
  const endpoint = String(req.body?.endpoint || "");
  if (!endpoint) return res.status(400).json({ success: false, error: "Missing endpoint." });
  await storeLib.store().removeWebSub(endpoint).catch(() => {});
  res.json({ success: true });
}

// Lets a user confirm alerts work on their device; only sends to the caller's own subscription
async function test(req, res) {
  const sub = req.body?.subscription;
  if (!validSubscription(sub)) return res.status(400).json({ success: false, error: "Invalid subscription." });
  const result = await push.sendWebPush([sub], {
    type: "test", title: "Qasid alerts are on ✅", body: "You'll get a notification here the moment a new IPO allotment is out.", url: "/#/home", tag: "qasid-test"
  });
  res.json({ success: result.sent === 1, error: result.sent ? undefined : "Couldn't reach this device." });
}

module.exports = { publicKey, subscribe, unsubscribe, test };
