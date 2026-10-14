const { axios, browserHeaders, decodeHtml, sleep } = require("../http");

// Bigshare runs three mirrors. A new allotment can show up on one before the others,
// and each one rate-limits independently, so every lookup fails over between them.
const SERVERS = [
  "https://ipo.bigshareonline.com",
  "https://ipo1.bigshareonline.com",
  "https://ipo2.bigshareonline.com"
];

// Per-server health: cooldownUntil is set when a server throttles us or errors out
const serverHealth = new Map(SERVERS.map(s => [s, { cooldownUntil: 0, failures: 0, lastOk: 0 }]));
const MAX_WAIT_FOR_COOLDOWN = 20000;

function markFailure(server, retryAfterSeconds) {
  const health = serverHealth.get(server);
  health.failures++;
  const backoff = retryAfterSeconds ? retryAfterSeconds * 1000 : Math.min(60000, 5000 * health.failures);
  health.cooldownUntil = Date.now() + backoff;
}

function markSuccess(server) {
  const health = serverHealth.get(server);
  health.failures = 0;
  health.cooldownUntil = 0;
  health.lastOk = Date.now();
}

// Servers that list the IPO come first, healthy before cooling-down, then the rest as a last resort
function orderServers(ipo) {
  const listedOn = new Set(ipo.servers || SERVERS);
  const now = Date.now();
  return [...SERVERS].sort((a, b) => {
    const listedDiff = (listedOn.has(b) ? 1 : 0) - (listedOn.has(a) ? 1 : 0);
    if (listedDiff) return listedDiff;
    const coolA = serverHealth.get(a).cooldownUntil > now ? 1 : 0;
    const coolB = serverHealth.get(b).cooldownUntil > now ? 1 : 0;
    if (coolA !== coolB) return coolA - coolB;
    return serverHealth.get(b).lastOk - serverHealth.get(a).lastOk;
  });
}

async function listServerIpos(server) {
  const response = await axios.get(`${server}/ipo_status.html`, { headers: browserHeaders(), timeout: 10000 });
  const selectMatch = response.data.match(/<select[^>]*id=["']ddlCompany["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!selectMatch) throw new Error("company dropdown not found");
  return [...selectMatch[1].matchAll(/<option[^>]*value=["'](\d+)["'][^>]*>([^<]+)<\/option>/gi)]
    .map(m => ({ clientId: m[1].trim(), name: decodeHtml(m[2]) }));
}

async function listIpos() {
  const combined = new Map();
  const settled = await Promise.allSettled(SERVERS.map(listServerIpos));

  settled.forEach((result, i) => {
    const server = SERVERS[i];
    if (result.status === "rejected") {
      console.error(`[BIGSHARE] ${server} list failed:`, result.reason.message);
      return;
    }
    for (const ipo of result.value) {
      const existing = combined.get(ipo.clientId);
      if (existing) existing.servers.push(server);
      else combined.set(ipo.clientId, { ...ipo, servers: [server] });
    }
  });

  if (settled.every(r => r.status === "rejected")) throw new Error("all Bigshare servers unreachable");
  return [...combined.values()];
}

async function queryServer(server, ipo, pan) {
  const payload = {
    Applicationno: "", Company: ipo.clientId, SelectionType: "PN", PanNo: pan,
    txtcsdl: "", txtDPID: "", txtClId: "", ddlType: "0", lang: "en"
  };
  const response = await axios.post(`${server}/Data.aspx/FetchIpodetails`, payload, {
    headers: browserHeaders({
      "content-type": "application/json; charset=UTF-8",
      origin: server,
      referer: `${server}/ipo_status.html`,
      "x-requested-with": "XMLHttpRequest"
    }),
    validateStatus: () => true,
    timeout: 15000
  });

  if (response.status === 429 || response.status === 503) {
    return { retry: true, retryAfter: parseInt(response.headers["retry-after"], 10) || 30 };
  }
  if (response.status >= 400) return { retry: true };

  const result = response.data?.d;
  if (!result || typeof result !== "object") return { retry: true };
  if (result.Status === "RATELIMIT") return { retry: true, retryAfter: 30 };
  if (result.Status === "WARMING") return { retry: true, retryAfter: 10 };
  if (result.Status === "NOTFOUND") return { done: { status: "not_applied" } };
  if (result.Status && result.Status !== "OK") {
    return { done: { status: "error", error: result.Message || "Bigshare rejected the request." } };
  }

  const records = Array.isArray(result.Records) && result.Records.length > 0 ? result.Records : [result];
  const parseQty = v => {
    const s = String(v || "").toUpperCase();
    return s.includes("NON") ? 0 : (parseInt(s.replace(/\D/g, ""), 10) || 0);
  };
  const applications = records.map(r => ({
    applicationNo: r.APPLICATION_NO || "",
    dpClientId: r.DPID || "",
    applied: parseQty(r.APPLIED),
    allotted: parseQty(r.ALLOTED)
  }));

  return {
    done: {
      status: "found",
      name: (records[0].Name || result.Name || "").trim() || "Name Not Provided",
      applied: applications.reduce((s, a) => s + a.applied, 0),
      allotted: applications.reduce((s, a) => s + a.allotted, 0),
      applications
    }
  };
}

async function checkPan(ipo, pan) {
  // Two passes: if every server is cooling down, wait briefly for the first one to recover
  for (let pass = 0; pass < 2; pass++) {
    for (const server of orderServers(ipo)) {
      if (pass === 0 && serverHealth.get(server).cooldownUntil > Date.now()) continue;
      try {
        const outcome = await queryServer(server, ipo, pan);
        if (outcome.done) {
          markSuccess(server);
          return { ...outcome.done, server };
        }
        markFailure(server, outcome.retryAfter);
      } catch (err) {
        markFailure(server);
      }
    }

    const soonest = Math.min(...SERVERS.map(s => serverHealth.get(s).cooldownUntil)) - Date.now();
    if (pass === 0 && soonest > 0 && soonest <= MAX_WAIT_FOR_COOLDOWN) await sleep(soonest);
    else if (pass === 0 && soonest > MAX_WAIT_FOR_COOLDOWN) break;
  }
  return { status: "error", error: "All Bigshare servers are busy right now. Please retry in a minute." };
}

function getServerStatus() {
  const now = Date.now();
  return SERVERS.map(s => {
    const h = serverHealth.get(s);
    return { server: s, healthy: h.cooldownUntil <= now, cooldownSeconds: Math.max(0, Math.ceil((h.cooldownUntil - now) / 1000)), lastOk: h.lastOk || null };
  });
}

module.exports = { id: "bigshare", tag: "Bigshare", label: "Bigshare Services", website: `${SERVERS[0]}/ipo_status.html`, concurrency: 3, listIpos, checkPan, getServerStatus };
