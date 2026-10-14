export function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
