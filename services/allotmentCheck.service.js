// Live PAN lookups against a registrar: result cache, shared in-flight requests and per-registrar slots.
const { ipoIdentity } = require("./ipoList.service");

const NOT_APPLIED_MSG = "You have not applied for this IPO.";

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
const registrarSlots = new Map();
function withRegistrarSlot(registrar, fn) {
  const limit = Math.max(4, (registrar.concurrency || 3) * 2);
  let slot = registrarSlots.get(registrar.id);
  if (!slot) registrarSlots.set(registrar.id, slot = { active: 0, queue: [] });
  return new Promise((resolve, reject) => {
    const run = () => {
      slot.active++;
      Promise.resolve().then(fn).then(resolve, reject).finally(() => {
        slot.active--;
        const next = slot.queue.shift();
        if (next) next();
      });
    };
    if (slot.active < limit) run(); else slot.queue.push(run);
  });
}

async function lookupPan(ipo, registrar, pan) {
  let outcome;
  try {
    outcome = await withRegistrarSlot(registrar, () => registrar.checkPan(ipo, pan));
  } catch (err) {
    console.error(`[${registrar.tag}] check failed for ${ipo.clientId}:`, err.message);
    return { value: { pan, success: false, error: "Unable to contact allotment service.", source: registrar.id }, ttl: 0 };
  }

  if (outcome.status === "not_applied") {
    // "uncertain": a server that might hold the record couldn't be asked - don't cache, ask again next time
    return { value: { pan, success: false, error: NOT_APPLIED_MSG, source: registrar.id }, ttl: outcome.uncertain ? 0 : NOT_APPLIED_TTL };
  }
  if (outcome.status !== "found") {
    return { value: { pan, success: false, error: outcome.error || "Unable to contact allotment service.", source: registrar.id }, ttl: 0 };
  }
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
  return { value, ttl: FOUND_TTL };
}

async function checkOnePan(ipo, registrar, rawPan) {
  const pan = String(rawPan).trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return { pan, success: false, error: "Invalid PAN" };

  const key = `${ipoIdentity(ipo)}:${pan}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  if (!inFlight.has(key)) {
    inFlight.set(key, lookupPan(ipo, registrar, pan)
      .then(({ value, ttl }) => { if (ttl) cacheSet(key, value, ttl); return value; })
      .finally(() => inFlight.delete(key)));
  }
  return inFlight.get(key);
}

module.exports = { checkOnePan };
