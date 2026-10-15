// Notifications to subscribers via Web Push (installed PWA on Android, iOS 16.4+ and desktop).
const webpush = require("web-push");
const { store } = require("./store");

let publicKey = null;

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

async function sendWebPush(subscriptions, payload) {
  const body = JSON.stringify(payload);
  let sent = 0, removed = 0;
  await Promise.all(subscriptions.map(async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, { TTL: 6 * 60 * 60, urgency: "high" });
      sent++;
    } catch (err) {
      // 404/410: the browser dropped this subscription (uninstalled, permission revoked)
      if (err.statusCode === 404 || err.statusCode === 410) {
        await store().removeWebSub(sub.endpoint).catch(() => {});
        removed++;
      } else {
        console.error("[PUSH] Web push failed:", err.statusCode || "", err.message);
      }
    }
  }));
  return { sent, removed };
}

// Broadcast a freshly published allotment to every subscriber
async function notifyAllotment(ipo) {
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
  const web = await sendWebPush(await store().listWebSubs(), payload);
  console.log(`[PUSH] ${name}: ${web.sent} sent / ${web.removed} expired`);
  return web;
}

module.exports = { initPush, getPublicKey, sendWebPush, notifyAllotment };
