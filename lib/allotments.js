// Allotment registry: when each registrar allotment was first seen, persisted in the store.
//
// It decides what is genuinely NEW (worth a push notification and the top of the list) versus an old
// allotment that merely reappeared - after a restart, a registrar outage, a registrar returning a partial
// list, or a registrar being added to Qasid. Rules:
//   - A registrar's IPOs are "seeded" silently the first time that registrar is seen working.
//   - After that, an unseen IPO is new only if its allotment date (from the IPO board) isn't stale.
//   - Too many unseen IPOs from one registrar at once means its IDs/format changed: seed them silently.
const { store } = require("./store");

const KEY = "allotmentRegistry";
const KEEP_MS = 180 * 864e5;             // forget IPOs not listed by any registrar for ~6 months
const TOUCH_MS = 12 * 3600e3;            // refresh "last seen" at most twice a day (limits writes)
const STALE_DAYS = 3;                    // an allotment dated >3 days ago is never announced as new
const MAX_NEW_PER_REGISTRAR = 8;

let reg = null;                          // { seeded: [registrarId], seen: { "src:id": [firstSeen, lastSeen] } }

const identity = ipo => `${ipo.source}:${ipo.clientId}`;

async function load() {
  if (reg) return reg;
  reg = await store().getConfig(KEY);
  if (!reg) {
    reg = { seeded: [], seen: {} };
    // Migrate the older flat list: everything in it is old news
    const legacy = await store().getConfig("knownAllotments");
    if (Array.isArray(legacy)) {
      const now = Date.now();
      for (const id of legacy) reg.seen[id] = [0, now];
      reg.seeded = [...new Set(legacy.map(id => id.split(":")[0]))];
    }
    await store().setConfig(KEY, reg);
  }
  return reg;
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Record a fetch round. `rounds` = [{ registrarId, ok, ipos }]; only successful fetches count.
 * Returns the IPOs that are genuinely new allotments.
 */
async function update(rounds, allotmentDateOf) {
  await load();
  const now = Date.now();
  const staleBefore = addDaysIso(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), -STALE_DAYS);
  const fresh = [];
  let changed = false;

  for (const { registrarId, ok, ipos } of rounds) {
    // An empty list is a broken page, never a baseline: seeding from it would make every real IPO look new
    if (!ok || !ipos.length) continue;
    const unseen = [];
    for (const ipo of ipos) {
      const entry = reg.seen[identity(ipo)];
      if (!entry) unseen.push(ipo);
      else if (now - entry[1] > TOUCH_MS) { entry[1] = now; changed = true; }
    }
    if (!unseen.length && reg.seeded.includes(registrarId)) continue;

    const markOld = list => list.forEach(ipo => { reg.seen[identity(ipo)] = [0, now]; });

    if (!reg.seeded.includes(registrarId)) {
      markOld(unseen);
      reg.seeded.push(registrarId);
      console.log(`[ALLOTMENTS] Seeded ${unseen.length} existing ${registrarId} allotments`);
      changed = true;
      continue;
    }

    const stale = unseen.filter(ipo => { const d = allotmentDateOf(ipo); return d && d < staleBefore; });
    const candidates = unseen.filter(ipo => !stale.includes(ipo));
    markOld(stale);
    if (stale.length) console.log(`[ALLOTMENTS] ${stale.length} old ${registrarId} allotments reappeared - not announced`);

    if (candidates.length > MAX_NEW_PER_REGISTRAR) {
      markOld(candidates);
      console.warn(`[ALLOTMENTS] ${candidates.length} unseen ${registrarId} allotments at once - registrar format change, not announced`);
    } else {
      for (const ipo of candidates) {
        reg.seen[identity(ipo)] = [now, now];
        fresh.push(ipo);
      }
    }
    changed = true;
  }

  for (const [id, [, lastSeen]] of Object.entries(reg.seen)) {
    if (now - lastSeen > KEEP_MS) { delete reg.seen[id]; changed = true; }
  }
  if (changed) await store().setConfig(KEY, reg);
  return fresh;
}

// 0 for allotments that were already out when Qasid started tracking them
function firstSeen(ipo) {
  return reg?.seen[identity(ipo)]?.[0] || 0;
}

module.exports = { load, update, firstSeen, identity };
