/* Qasid service worker: offline shell, push notifications, on-device allotment check. */
const CACHE = "qasid-v2";
const SHELL = ["/", "/logo.svg", "/favicon.svg", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/badge-96.png"];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Pages: network first so updates show immediately, cached shell when offline
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put("/", copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("/")));
    return;
  }

  // Hashed build assets and icons never change: cache first
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});

/* ---------- Tiny IndexedDB key-value store shared with the app ---------- */
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("qasid", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", mode);
      const req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
const idbGet = key => idb("readonly", s => s.get(key)).catch(() => null);
const idbSet = (key, value) => idb("readwrite", s => s.put(value, key)).catch(() => {});

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// Check the user's saved PANs for a freshly published allotment, right on the device
async function checkPans(ipo, pans) {
  const res = await withTimeout(fetch("/api/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: ipo.clientId, source: ipo.source, pans: pans.slice(0, 50) })
  }), 25000);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "check failed");
  const allotted = data.results.filter(r => r.success && Number(r.data.Allotted) > 0);
  return {
    total: data.results.length,
    applied: data.results.filter(r => r.success).length,
    allotted: allotted.length,
    shares: allotted.reduce((s, r) => s + Number(r.data.Allotted), 0),
    results: data.results
  };
}

async function handlePush(data) {
  let title = data.title || "Qasid";
  let body = data.body || "";
  let url = data.url || "/#/home";

  if (data.type === "allotment" && data.ipo) {
    url = `/#/allotment/${encodeURIComponent(`${data.ipo.source}:${data.ipo.clientId}`)}`;
    const settings = (await idbGet("alertSettings")) || {};
    if (settings.autoCheck !== false && Array.isArray(settings.pans) && settings.pans.length) {
      try {
        const s = await checkPans(data.ipo, settings.pans);
        await idbSet(`result:${data.ipo.source}:${data.ipo.clientId}`, { ...s, at: Date.now(), ipo: data.ipo });
        if (s.allotted > 0) {
          title = `🎉 ${data.ipo.name}: ${s.allotted} of ${s.total} allotted`;
          body = `${s.shares} shares allotted across your PANs. Tap to see details.`;
        } else if (s.applied > 0) {
          title = `${data.ipo.name}: allotment out`;
          body = `None of your ${s.applied} application${s.applied > 1 ? "s" : ""} got shares this time.`;
        } else {
          title = `${data.ipo.name}: allotment out`;
          body = "None of your saved PANs applied in this IPO.";
        }
      } catch {
        // Fall back to the plain "allotment out" message
      }
    }
  }

  await self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || "qasid",
    renotify: true,
    vibrate: [120, 60, 120],
    data: { url }
  });
}

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Qasid", body: event.data && event.data.text() }; }
  event.waitUntil(handlePush(data));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find(w => new URL(w.url).origin === location.origin);
    if (open) {
      await open.focus();
      return open.navigate(target).catch(() => {});
    }
    return self.clients.openWindow(target);
  })());
});
