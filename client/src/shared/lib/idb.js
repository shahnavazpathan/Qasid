// Minimal IndexedDB key-value store, shared with the service worker (same "qasid"/"kv" names).
// The service worker can't read localStorage, so anything it needs (saved PANs, alert settings) is mirrored here.
function withStore(mode, fn) {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
    const open = indexedDB.open("qasid", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", mode);
      const req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

export const idbGet = key => withStore("readonly", s => s.get(key)).catch(() => null);
export const idbSet = (key, value) => withStore("readwrite", s => s.put(value, key)).catch(() => {});
