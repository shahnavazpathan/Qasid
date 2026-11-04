// PAN lookups: live registrar checks (result cache, shared in-flight requests, per-registrar slots), backed by
// the result archive for retired IPOs and registrar outages.
const resultArchive = require("../lib/resultArchive");
const { ipoIdentity } = require("./ipoList.service");

const NOT_APPLIED_MSG = "You have not applied for this IPO.";
const RETIRED_MSG = "The registrar has closed the allotment checker for this IPO, and Qasid has no saved result for this PAN.";
const BUSY_MSG = "The registrar is very busy right now. Please try again in a minute.";

// Result cache: allotment outcomes are final once published, "not applied" can still change briefly
// (registrars sometimes upload in batches), errors are never cached.
const CACHE_LIMIT = 50000;
const FOUND_TTL = 24 * 3600e3;
const NOT_APPLIED_TTL = 30 * 60e3;
const resultCache = new Map();          // key -> { value, expires }
const inFlight = new Map();             // key -> Promise, so identical concurrent lookups share one request

function cacheGet(key) {
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) { resultCache.delete(key); return null; }
  return hit.value;
}

function cacheSet(key, value, ttl) {
  if (resultCache.size >= CACHE_LIMIT) resultCache.delete(resultCache.keys().next().value);
  resultCache.set(key, { value, expires: Date.now() + ttl });
}

// At most N live lookups per registrar across ALL requests: when an allotment comes out and many phones
// check at once, requests queue here instead of getting Qasid rate-limited or blocked by the registrar.
// - People checking in the app go first; background checks (a phone checking its saved PANs when the
//   allotment alert arrives) only run when nobody is waiting.
// - A lookup nobody is waiting for any more (the phone gave up) is dropped instead of sent.
// - Nothing waits forever: after QUEUE_WAIT_MS the lookup gives up as "busy".
const QUEUE_WAIT_MS = { interactive: 45 * 1000, background: 20 * 1000 };
class Busy extends Error {}
class Abandoned extends Error {}
const registrarSlots = new Map();

function pump(slot) {
  while (slot.active < slot.limit) {
    const job = slot.interactive.shift() || slot.background.shift();
    if (!job) return;
    job.start();
  }
}

function withRegistrarSlot(registrar, fn, lookup) {
  let slot = registrarSlots.get(registrar.id);
  if (!slot) {
    slot = { active: 0, limit: Math.max(4, (registrar.concurrency || 3) * 2), interactive: [], background: [] };
    registrarSlots.set(registrar.id, slot);
  }
  return new Promise((resolve, reject) => {
    const lane = () => (lookup.background ? slot.background : slot.interactive);
    let timer;
    const giveUpAfter = ms => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (job.done) return;
        job.done = true;
        const q = lane();
        const i = q.indexOf(job);
        if (i >= 0) q.splice(i, 1);
        reject(new Busy());
      }, ms);
    };
    const job = {
      start() {
        clearTimeout(timer);
        if (job.done) return;
        job.done = true;
        if (!lookup.wanted()) return reject(new Abandoned());
        slot.active++;
        Promise.resolve().then(fn).then(resolve, reject).finally(() => { slot.active--; pump(slot); });
      },
      // An interactive request joined a queued background lookup: move it to the front lane
      promote() {
        const i = slot.background.indexOf(job);
        if (i >= 0) { slot.background.splice(i, 1); slot.interactive.push(job); giveUpAfter(QUEUE_WAIT_MS.interactive); }
      }
    };
    giveUpAfter(lookup.background ? QUEUE_WAIT_MS.background : QUEUE_WAIT_MS.interactive);
    lookup.job = job;
    lane().push(job);
    pump(slot);
  });
}

// A result saved earlier, flagged so the app can show when it was saved
async function archivedResult(ipo, pan) {
  const hit = await resultArchive.get(ipoIdentity(ipo), pan).catch(() => null);
  return hit && { ...hit.value, archived: true, savedAt: hit.savedAt };
}

async function lookupPan(ipo, registrar, pan, lookup) {
  // Retired IPO: the registrar no longer has the data, so a saved result is the answer
  if (ipo.retired) {
    const saved = await archivedResult(ipo, pan);
    if (saved) return { value: saved, ttl: FOUND_TTL };
  }

  let outcome;
  try {
    outcome = await withRegistrarSlot(registrar, () => registrar.checkPan(ipo, pan), lookup);
  } catch (err) {
    if (err instanceof Abandoned) return { value: { pan, success: false, error: BUSY_MSG, busy: true, source: registrar.id }, ttl: 0 };
    if (err instanceof Busy) outcome = { status: "error", error: BUSY_MSG, busy: true };
    else {
      console.error(`[${registrar.tag}] check failed for ${ipo.clientId}:`, err.message);
      outcome = { status: "error" };
    }
  }

  if (outcome.status === "found") {
    const value = foundValue(registrar, pan, outcome);
    const { server, ...keep } = value;
    resultArchive.save(ipoIdentity(ipo), pan, keep).catch(err => console.error("[ARCHIVE] save failed:", err.message));
    return { value, ttl: FOUND_TTL };
  }

  if (ipo.retired && outcome.status === "not_applied") {
    return { value: { pan, success: false, error: RETIRED_MSG, retired: true, source: registrar.id }, ttl: NOT_APPLIED_TTL };
  }

  if (outcome.status === "not_applied") {
    // "uncertain": a server that might hold the record couldn't be asked - don't cache, ask again next time
    return { value: { pan, success: false, error: NOT_APPLIED_MSG, source: registrar.id }, ttl: outcome.uncertain ? 0 : NOT_APPLIED_TTL };
  }
  // Registrar down or erroring: a saved result beats an error
  const saved = await archivedResult(ipo, pan);
  if (saved) return { value: saved, ttl: 0 };
  return { value: { pan, success: false, error: outcome.error || "Unable to contact allotment service.", ...(outcome.busy ? { busy: true } : {}), source: registrar.id }, ttl: 0 };
}

function foundValue(registrar, pan, outcome) {
  const value = {
    pan,
    success: true,
    source: registrar.id,
    data: {
      Name: outcome.name,
      Allotted: outcome.allotted,
      Applied: outcome.applied || 0,
      Applications: outcome.applications || []
    }
  };
  if (outcome.server) value.server = outcome.server;
  return value;
}

// opts.background: lower priority (see withRegistrarSlot). opts.alive(): false once the caller hung up.
async function checkOnePan(ipo, registrar, rawPan, { background = false, alive = () => true } = {}) {
  const pan = String(rawPan).trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return { pan, success: false, error: "Invalid PAN" };

  const key = `${ipoIdentity(ipo)}:${pan}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  if (!alive()) return { pan, success: false, error: BUSY_MSG, busy: true, source: registrar.id };

  // Identical lookups share one request; it is wanted while any of its callers still is, and runs at
  // the highest priority among them
  let lookup = inFlight.get(key);
  if (lookup) {
    lookup.waiters.push(alive);
    if (!background && lookup.background) {
      lookup.background = false;
      lookup.job?.promote();
    }
    return lookup.promise;
  }
  // The caller is registered before the lookup starts: with a free slot it starts right away and checks
  // that someone still wants it
  lookup = { waiters: [alive], background, job: null };
  lookup.wanted = () => lookup.waiters.some(w => w());
  inFlight.set(key, lookup);
  lookup.promise = lookupPan(ipo, registrar, pan, lookup)
    .then(({ value, ttl }) => { if (ttl) cacheSet(key, value, ttl); return value; })
    .finally(() => inFlight.delete(key));
  return lookup.promise;
}

module.exports = { checkOnePan };
