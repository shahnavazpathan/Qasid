import { api } from "../../shared/api/client.js";

export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const platform = () => (isIos() ? "ios" : isAndroid() ? "android" : "desktop");

/*
 * Where this device stands for allotment alerts:
 * - "needs-install": iPhone in Safari - Apple only allows push after "Add to Home Screen"
 * - "unsupported":   browser has no Web Push
 * - "denied":        user blocked notifications in browser settings
 * - "off":           can be turned on
 * - "on":            subscribed
 */
export async function pushStatus() {
  if (isIos() && !isStandalone()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function base64UrlToBytes(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// True when the subscription was made with a different server key than the server's current one
// (its key was reset): the server can no longer send to it, so it has to be replaced
function keyChanged(sub, publicKey) {
  const used = sub.options?.applicationServerKey;
  if (!used) return false;
  const a = new Uint8Array(used), b = base64UrlToBytes(publicKey);
  return a.length !== b.length || a.some((x, i) => x !== b[i]);
}

// The existing subscription, or a new one when there is none or it uses an old server key
async function currentSubscription(reg, publicKey) {
  const sub = await reg.pushManager.getSubscription();
  if (sub && !keyChanged(sub, publicKey)) return sub;
  if (sub) {
    await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
}

async function readyRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

// Must be called from a tap (iOS requires a user gesture for the permission prompt)
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await readyRegistration();
  const { publicKey } = await api.get("/api/push/public-key");
  const sub = await currentSubscription(reg, publicKey);
  await api.post("/api/push/subscribe", { subscription: sub.toJSON(), platform: platform() });
  return "on";
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}

// Re-register an existing subscription with the server (e.g. after the server's store was reset).
// If the server's key changed since alerts were turned on, quietly subscribe again with the new key:
// notification permission is already granted, so no prompt is shown.
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !(await reg.pushManager.getSubscription())) return;
    const { publicKey } = await api.get("/api/push/public-key");
    const sub = await currentSubscription(reg, publicKey);
    await api.post("/api/push/subscribe", { subscription: sub.toJSON(), platform: platform() });
  } catch (err) {
    console.error("[alerts] Could not refresh the alert subscription:", err.message);
  }
}

export async function sendTestPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) throw new Error("Alerts are not turned on yet.");
  return api.post("/api/push/test", { subscription: sub.toJSON() });
}
