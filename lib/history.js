// Records GMP and subscription snapshots per IPO so the UI can show trends and day-wise subscription.
// Sources only publish the current value, so history only exists from the moment this server started
// watching an IPO. Persisted to data/history.json (best effort - ephemeral disks just start fresh).
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "history.json");
const KEEP_DAYS = 90;
let store = {};
let dirty = false;

try { store = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// One point per day per series; the latest reading of the day wins
function upsertDaily(series, date, point) {
  const last = series[series.length - 1];
  if (last && last.date === date) Object.assign(last, point);
  else series.push({ date, ...point });
}

function record(key, ipo) {
  if (!key) return;
  const entry = store[key] || (store[key] = { gmp: [], sub: [], seen: today() });
  const date = today();
  entry.seen = date;

  if (ipo.gmp !== null && ipo.gmp !== undefined && !Number.isNaN(Number(ipo.gmp))) {
    const before = JSON.stringify(entry.gmp);
    upsertDaily(entry.gmp, date, { gmp: Number(ipo.gmp) });
    if (JSON.stringify(entry.gmp) !== before) dirty = true;
  }

  // Only track subscription while bidding is live
  const total = ipo.subscription?.total;
  if (ipo.status === "open" && total !== null && total !== undefined) {
    const point = { total };
    for (const c of ipo.subscription.categories || []) {
      if (c.category !== "Total" && c.times !== null && c.times !== undefined) point[c.category] = c.times;
    }
    const before = JSON.stringify(entry.sub);
    upsertDaily(entry.sub, date, point);
    if (JSON.stringify(entry.sub) !== before) dirty = true;
  }
}

function get(key) {
  const entry = store[key];
  return entry ? { gmp: entry.gmp, sub: entry.sub } : { gmp: [], sub: [] };
}

function prune() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  for (const [key, entry] of Object.entries(store)) {
    if (entry.seen < cutoff) { delete store[key]; dirty = true; }
  }
}

function flush() {
  if (!dirty) return;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store));
    dirty = false;
  } catch (err) {
    console.error("[HISTORY] save failed:", err.message);
  }
}

setInterval(() => { prune(); flush(); }, 60 * 1000).unref();
process.once("SIGINT", () => { flush(); process.exit(0); });
process.once("SIGTERM", () => { flush(); process.exit(0); });

module.exports = { record, get };
