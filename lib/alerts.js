// Tells the owner when something breaks: a data source that keeps failing (a registrar or site changed
// its page), a source that recovers, or a crash. Always logged; also sent to the owner's phone through
// ntfy.sh when ALERT_NTFY_TOPIC is set (install the ntfy app and subscribe to that topic).
const axios = require("axios");
const { ALERT_NTFY_TOPIC } = require("../config");

// About 10-15 minutes of failures for sources polled every minute or two, so one bad response stays quiet
const FAIL_THRESHOLD = 10;
const sources = new Map(); // name -> { fails, alerted, lastError }

async function notify(title, message, { priority = "default", tags = "warning" } = {}) {
  console.warn(`[ALERT] ${title}: ${message}`);
  if (!ALERT_NTFY_TOPIC) return;
  try {
    await axios.post(`https://ntfy.sh/${encodeURIComponent(ALERT_NTFY_TOPIC)}`, String(message).slice(0, 500), {
      headers: { Title: `Qasid: ${title}`, Priority: priority, Tags: tags },
      timeout: 10000
    });
  } catch (err) {
    console.error("[ALERT] ntfy failed:", err.message);
  }
}

// Record each fetch from a data source; alerts once when it starts failing for good, once when it recovers
function sourceResult(name, ok, error) {
  const s = sources.get(name) || { fails: 0, alerted: false, lastError: null };
  if (ok) {
    if (s.alerted) notify(`${name} is working again`, `${name} recovered after ${s.fails} failed attempts.`, { tags: "white_check_mark" });
    sources.set(name, { fails: 0, alerted: false, lastError: null });
    return;
  }
  s.fails++;
  s.lastError = String(error?.message || error || "unknown error").slice(0, 200);
  if (s.fails >= FAIL_THRESHOLD && !s.alerted) {
    s.alerted = true;
    notify(`${name} is failing`, `${s.fails} failures in a row. Last error: ${s.lastError}`, { priority: "high" });
  }
  sources.set(name, s);
}

// Sources that are currently failing, for the logs and /health
const failing = () => [...sources].filter(([, s]) => s.fails >= FAIL_THRESHOLD).map(([name]) => name);

module.exports = { notify, sourceResult, failing };
