// Records GMP and subscription snapshots per IPO so the UI can show trends and day-wise subscription.
// Sources only publish the current value, so history only exists from the moment Qasid started watching
// an IPO. Saved in the persistent store (MongoDB in production) once attached, so redeploys keep it;
// until then (and in tests) it falls back to data/history.json.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "history.json");
const STORE_KEY = "ipoHistory";
const KEEP_DAYS = 90;
let data = {};
let dirty = false;
let persistent = null; // the shared store once attached

try { data = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// One point per day per series; the latest reading of the day wins
function upsertDaily(series, date, point) {
  const last = series[series.length - 1];
  if (last && last.date === date) Object.assign(last, point);
  else series.push({ date, ...point });
}

function mergeSeries(a = [], b = []) {
  const byDate = new Map(a.map(p => [p.date, p]));
  for (const p of b) byDate.set(p.date, { ...byDate.get(p.date), ...p });
  return [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date));
}

// Load what the store already has and merge in anything recorded before it was attached
async function attachStore(store) {
  persistent = store;
  try {
    const saved = (await store.getConfig(STORE_KEY)) || {};
    for (const [key, entry] of Object.entries(saved)) {
      const mine = data[key];
      data[key] = mine
        ? { gmp: mergeSeries(entry.gmp, mine.gmp), sub: mergeSeries(entry.sub, mine.sub), seen: mine.seen > entry.seen ? mine.seen : entry.seen }
        : entry;
    }
    dirty = true;
  } catch (err) {
    console.error("[HISTORY] load failed:", err.message);
  }
}

function record(key, ipo) {
  if (!key) return;
  const entry = data[key] || (data[key] = { gmp: [], sub: [], seen: today() });
  const date = today();
  if (entry.seen !== date) { entry.seen = date; dirty = true; }

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
  const entry = data[key];
  return entry ? { gmp: entry.gmp, sub: entry.sub } : { gmp: [], sub: [] };
}

function prune() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  for (const [key, entry] of Object.entries(data)) {
    if (entry.seen < cutoff) { delete data[key]; dirty = true; }
  }
}

async function flush() {
  if (!dirty) return;
  dirty = false;
  try {
    if (persistent) {
      await persistent.setConfig(STORE_KEY, data);
    } else {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(data));
    }
  } catch (err) {
    dirty = true;
    console.error("[HISTORY] save failed:", err.message);
  }
}

setInterval(() => { prune(); flush(); }, 2 * 60 * 1000).unref();
const flushAndExit = () => { Promise.resolve(flush()).finally(() => process.exit(0)); };
process.once("SIGINT", flushAndExit);
process.once("SIGTERM", flushAndExit);

module.exports = { record, get, attachStore };
