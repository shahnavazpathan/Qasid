// Notifications to subscribers via Web Push (installed PWA on Android, iOS 16.4+ and desktop).
const webpush = require("web-push");
const { store } = require("./store");

let publicKey = null;
// Override the TLS agent web-push uses to reach the push service. Only used by the local test
// endpoint (production push services use real certs and need no override).
let pushAgent = null;

// VAPID keys: from env, else generated once and kept in the store so existing subscriptions stay valid
async function initPush() {
  let keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : await store().getConfig("vapidKeys");
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    await store().setConfig("vapidKeys", keys);
    console.log("[PUSH] Generated new VAPID keys (stored). Set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY to pin them.");
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@thevellora.co.in", keys.publicKey, keys.privateKey);
  publicKey = keys.publicKey;
  return publicKey;
}

const getPublicKey = () => publicKey;
const setPushAgent = agent => { pushAgent = agent; };

async function sendWebPush(subscriptions, payload, { agent } = {}) {
  const body = JSON.stringify(payload);
  let sent = 0, removed = 0;
  const sendOne = async sub => {
    try {
      // web-push has no default timeout: a push service that never answers would hold the socket open
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, { TTL: 6 * 60 * 60, urgency: "high", timeout: 15000, agent: agent || pushAgent });
      sent++;
    } catch (err) {
      // 404/410: the browser dropped this subscription (uninstalled, permission revoked).
      // 400/403: the push service rejects it for good (malformed, or made with an old VAPID key;
      // the app subscribes again with the current key the next time it opens).
      if ([400, 403, 404, 410].includes(err.statusCode)) {
        await store().removeWebSub(sub.endpoint).catch(() => {});
        removed++;
      } else {
        console.error("[PUSH] Web push failed:", err.statusCode || "", err.message);
      }
    }
  };
  // In batches, so a large subscriber list doesn't open thousands of connections at once
  for (let i = 0; i < subscriptions.length; i += 50) await Promise.all(subscriptions.slice(i, i + 50).map(sendOne));
  return { sent, removed };
}

// Broadcast a freshly published allotment to every subscriber
async function notifyAllotment(ipo, { agent } = {}) {
  const name = String(ipo.name).replace(/^\[[^\]]+\]\s*/, "");
  const title = "Allotment out 🎉";
  const body = `${name} allotment is now available. Tap to check your PANs.`;
  const payload = {
    type: "allotment",
    title,
    body,
    ipo: { name, clientId: ipo.clientId, source: ipo.source, registrar: ipo.registrar },
    url: "/#/allotment",
    tag: `allotment-${ipo.source}-${ipo.clientId}`
  };
  const web = await sendWebPush(await store().listWebSubs(), payload, { agent });
  console.log(`[PUSH] ${name}: ${web.sent} sent / ${web.removed} expired`);
  return web;
}

module.exports = { initPush, getPublicKey, sendWebPush, notifyAllotment, setPushAgent };
