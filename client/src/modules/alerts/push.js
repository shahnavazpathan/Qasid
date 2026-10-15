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
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
  }
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

// Re-register an existing subscription with the server (e.g. after the server's store was reset)
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) await api.post("/api/push/subscribe", { subscription: sub.toJSON(), platform: platform() }).catch(() => {});
}

export async function sendTestPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) throw new Error("Alerts are not turned on yet.");
  return api.post("/api/push/test", { subscription: sub.toJSON() });
}
