// Notifications to subscribers: Web Push (PWA, Android + installed iOS) and Expo (mobile app).
const webpush = require("web-push");
const axios = require("axios");
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

async function sendExpo(tokens, title, body, data) {
  if (!tokens.length) return 0;
  const messages = tokens.map(to => ({ to, sound: "default", title, body, data }));
  // Expo accepts up to 100 messages per request
  for (let i = 0; i < messages.length; i += 100) {
    try {
      const res = await axios.post("https://exp.host/--/api/v2/push/send", messages.slice(i, i + 100), { timeout: 15000 });
      const results = res.data?.data || [];
      results.forEach((r, j) => {
        if (r.status === "error" && r.details?.error === "DeviceNotRegistered") store().removeExpoToken(messages[i + j].to).catch(() => {});
      });
    } catch (err) {
      console.error("[PUSH] Expo push failed:", err.message);
    }
  }
  return messages.length;
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
  const [subs, tokens] = await Promise.all([store().listWebSubs(), store().listExpoTokens()]);
  const web = await sendWebPush(subs, payload);
  const expo = await sendExpo(tokens, title, `${ipo.name} allotment is now available.`, { ipo: payload.ipo });
  console.log(`[PUSH] ${name}: web ${web.sent} sent / ${web.removed} expired, expo ${expo}`);
  return { web, expo };
}

module.exports = { initPush, getPublicKey, sendWebPush, notifyAllotment };
