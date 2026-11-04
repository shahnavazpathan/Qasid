#!/usr/bin/env node
// Smoke test: starts the real server on a spare port and checks the endpoints that matter, the way the
// website, an outside script and RapidAPI would call them. Run it before every push:
//
//   npm test
//
// Uses the local file store (never MONGODB_URI) and sends no alerts. Checks that need live data from the
// IPO sources only warn when those sources are down, so a source outage doesn't fail the test.
const { spawn } = require("child_process");
const path = require("path");

const PORT = 3199;
const BASE = `http://localhost:${PORT}`;
const SITE = "https://qasid.thevellora.co.in";
const SECRET = "smoke-test-secret";

let failed = 0, warned = 0;
const pass = msg => console.log(`  ✓ ${msg}`);
const fail = msg => { failed++; console.log(`  ✗ ${msg}`); };
const warn = msg => { warned++; console.log(`  ! ${msg}`); };
const check = (ok, msg, detail = "") => (ok ? pass(msg) : fail(`${msg}${detail ? ` (${detail})` : ""}`));

// Looks like a browser on the real site behind Render's proxy, so the API gate is actually exercised
const browser = cookie => ({ origin: SITE, "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.7", ...(cookie ? { cookie } : {}) });
const rapid = { "x-rapidapi-proxy-secret": SECRET, "x-rapidapi-user": "smoke" };
const get = (p, headers = {}) => fetch(BASE + p, { headers });
const post = (p, body, headers = {}) => fetch(BASE + p, {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body)
});
const json = async res => { try { return await res.json(); } catch { return null; } };

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("server did not start within 30 seconds");
}

async function run() {
  console.log("\nSite and session");
  let res = await get("/health");
  check(res.status === 200 && (await json(res))?.status === "OK", "/health answers");
  res = await get("/", { "x-forwarded-for": "203.0.113.7" });
  const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
  check(res.status === 200 && cookie.startsWith("qs="), "page load hands out a session cookie");

  console.log("\nWebsite API gate");
  res = await get("/api/market/", browser());
  check(res.status === 403, "API refuses a call without the session cookie", res.status);
  res = await get("/api/user/pans", browser(cookie));
  check((await json(res))?.guest === true, "signed-out visitor is a guest");
  res = await post("/api/check", {}, browser(cookie));
  check(res.status === 400, "allotment check with no IPO is a 400", res.status);
  res = await post("/api/check", "{not json", browser(cookie));
  check(res.status === 400 && (await json(res))?.success === false, "malformed JSON gets a JSON 400", res.status);
  res = await post("/api/push/subscribe", { subscription: { endpoint: "https://evil.example.com/x", keys: { p256dh: "x", auth: "y" } } }, browser(cookie));
  check(res.status === 400, "push subscription to an unknown host is refused", res.status);
  // Name-based ids (all IPOs on Render, where NSE is blocked) contain spaces and must not be rejected
  res = await get("/api/market/ipo/SOME%20IPO%20NAME", browser(cookie));
  check(res.status !== 400, "IPO detail accepts ids with spaces", res.status);

  console.log("\nPublic /v1 API (RapidAPI)");
  res = await get("/v1/ipos");
  check(res.status === 401, "refuses calls without RapidAPI's secret", res.status);
  res = await get("/v1/ipos", { "x-rapidapi-proxy-secret": "wrong" });
  check(res.status === 401, "refuses a wrong secret", res.status);
  res = await get("/v1/ipos/SOME%20IPO%20NAME", rapid);
  check(res.status === 404 || res.status === 502, "/v1/ipos/{id} accepts ids with spaces", res.status);
  res = await get("/v1/calendar?from=nope", rapid);
  check(res.status === 400, "calendar rejects a bad date", res.status);
  res = await get("/v1/calendar?from=2026-02-31", rapid);
  check(res.status === 400, "calendar rejects an impossible date", res.status);
  res = await get("/v1/nothing-here", rapid);
  check(res.status === 404, "unknown endpoint is a 404", res.status);

  res = await get("/v1/ipos", rapid);
  const list = await json(res);
  if (res.status === 502) {
    warn("IPO sources are unreachable, so the data checks were skipped");
  } else {
    check(res.status === 200 && Array.isArray(list?.data), "/v1/ipos returns IPOs", res.status);
    check(!JSON.stringify(list).toLowerCase().includes("gmp"), "no GMP in the public API");
    if (list?.data?.length) {
      res = await get(`/v1/ipos/${encodeURIComponent(list.data[0].id)}`, rapid);
      check(res.status === 200, `/v1/ipos/{id} finds "${list.data[0].id}"`, res.status);
    } else {
      warn("the IPO list is empty, so the single-IPO check was skipped");
    }
    res = await get("/v1/calendar", rapid);
    check(res.status === 200, "/v1/calendar returns events", res.status);
  }
}

(async () => {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    // MONGODB_URI empty: never touch the production database. No ntfy topic: no alerts.
    env: { ...process.env, PORT: String(PORT), MONGODB_URI: "", ALERT_NTFY_TOPIC: "", RAPIDAPI_PROXY_SECRET: SECRET, NSE_DISABLED: "1" },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  server.stderr.on("data", d => { stderr += d; });
  try {
    await waitForServer();
    await run();
  } catch (err) {
    fail(`test run stopped: ${err.message}`);
    if (stderr) console.log(stderr.slice(-1500));
  } finally {
    server.kill();
  }
  console.log(`\n${failed ? `${failed} failed` : "All checks passed"}${warned ? `, ${warned} warning${warned > 1 ? "s" : ""}` : ""}\n`);
  process.exit(failed ? 1 : 0);
})();
