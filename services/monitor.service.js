// Background IPO monitor (push notifications).
// Refreshing the registrar lists is all the monitor does: fetchLiveIpoList() records first-seen times
// in the persisted registry and announces genuinely new allotments.
const { fetchLiveIpoList } = require("./ipoList.service");

async function runIpoMonitor() {
  try {
    await fetchLiveIpoList(true);
  } catch (error) {
    console.error("[IPO MONITOR] Error:", error.message);
  }
}

async function startIpoMonitor() {
  await runIpoMonitor();

  function scheduleNextRun() {
    // Allotments usually come out in the evening IST: poll every minute 7 PM-4 AM, else every 5 minutes
    const istHour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false })) % 24;
    const intervalMs = (istHour >= 19 || istHour < 4) ? 60 * 1000 : 5 * 60 * 1000;

    setTimeout(async () => {
      await runIpoMonitor();
      scheduleNextRun();
    }, intervalMs);
  }

  scheduleNextRun();
}

module.exports = { startIpoMonitor };
