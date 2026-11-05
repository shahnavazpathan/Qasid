// Telegram channel posts: an instant "allotment out" for every new allotment, a morning digest (open, last day,
// allotment and listing today, opening soon) and an evening "listed today" recap. Only the server that sends
// allotment alerts posts (ALLOTMENT_ALERTS), so a standby copy never posts twice.
const market = require("../lib/market");
const storeLib = require("../lib/store");
const telegram = require("../lib/telegram");
const { ALLOTMENT_ALERTS } = require("../config");

const SITE = "https://qasid.thevellora.co.in";
const MAX_PER_SECTION = 8;
const { esc } = telegram;

const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
const isoDay = d => d.toISOString().slice(0, 10);
const addDays = (iso, n) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5));
const dayLabel = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const inr = n => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const cleanName = name => String(name).replace(/^\[[^\]]+\]\s*/, "");

function price(ipo) {
  if (ipo.priceMin && ipo.priceMax && ipo.priceMin !== ipo.priceMax) return `${inr(ipo.priceMin)}–${inr(ipo.priceMax)}`;
  return ipo.priceMax ? inr(ipo.priceMax) : null;
}

function gmp(ipo) {
  if (ipo.gmp === null || ipo.gmp === undefined || !ipo.priceMax) return null;
  const pct = (ipo.gmp / ipo.priceMax) * 100;
  return `GMP ${ipo.gmp >= 0 ? "+" : "−"}${inr(Math.abs(ipo.gmp))} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
}

function line(ipo, ...extra) {
  const bits = [ipo.type === "SME" ? "SME" : null, ...extra].filter(Boolean);
  return `• <b>${esc(ipo.name)}</b>${bits.length ? ` · ${bits.map(esc).join(" · ")}` : ""}`;
}

function section(title, items) {
  if (!items.length) return "";
  const shown = items.slice(0, MAX_PER_SECTION);
  const more = items.length - shown.length;
  return `\n${title}\n${shown.join("\n")}${more > 0 ? `\n• …and ${more} more` : ""}\n`;
}

// Morning digest for `today` (YYYY-MM-DD, IST); null when there is nothing to say
function morningDigest(board, today) {
  const all = ["open", "upcoming", "closed", "listed"].flatMap(s => board[s] || []);
  const sub = ipo => (ipo.subscription?.total ? `${Number(ipo.subscription.total).toFixed(2)}x subscribed` : null);
  const open = (board.open || []).map(ipo => line(ipo, price(ipo), gmp(ipo), sub(ipo), ipo.closeDate === today ? "last day today" : null));
  const allotment = all.filter(ipo => ipo.allotmentDate === today).map(ipo => line(ipo));
  const listing = all.filter(ipo => ipo.listingDate === today).map(ipo => line(ipo, gmp(ipo)));
  const soon = (board.upcoming || [])
    .filter(ipo => ipo.openDate && ipo.openDate > today && ipo.openDate <= addDays(today, 3))
    .map(ipo => line(ipo, price(ipo), `opens ${dayLabel(ipo.openDate)}`));
  const body = section("🟢 <b>Open for bidding</b>", open) + section("🔔 <b>Allotment today</b>", allotment)
    + section("🚀 <b>Listing today</b>", listing) + section("📆 <b>Opening soon</b>", soon);
  if (!body) return null;
  return `📅 <b>IPO update · ${dayLabel(today)}</b>\n${body}\nPlan, GMP and allotment checks: ${SITE}\n<i>GMP is unofficial and only indicative. Not investment advice.</i>`;
}

// Evening recap of IPOs that listed `today` with a known listing gain; null when there are none
function eveningDigest(board, today) {
  const listed = (board.listed || []).filter(ipo => ipo.listingDate === today && typeof ipo.listingGain === "number").map(ipo => {
    const gain = `${ipo.listingGain >= 0 ? "+" : ""}${ipo.listingGain.toFixed(1)}%`;
    return line(ipo, ipo.issuePrice || ipo.priceMax ? `issue ${inr(ipo.issuePrice || ipo.priceMax)}` : null, ipo.listingPrice ? `listed ${inr(ipo.listingPrice)}` : null, gain);
  });
  if (!listed.length) return null;
  return `📈 <b>Listed today · ${dayLabel(today)}</b>\n${section("", listed).trimStart()}\nMore on ${SITE}`;
}

function allotmentMessage(ipo) {
  const key = encodeURIComponent(`${ipo.source}:${ipo.clientId}`);
  return `🎉 <b>Allotment out: ${esc(cleanName(ipo.name))}</b>\nRegistrar: ${esc(ipo.registrar || ipo.source)}\n\nCheck all your PANs in one tap: ${SITE}/#/allotment/${key}`;
}

async function postAllotment(ipo) {
  if (!ALLOTMENT_ALERTS || !telegram.enabled()) return;
  await telegram.post(allotmentMessage(ipo));
  console.log(`[TELEGRAM] Posted allotment: ${cleanName(ipo.name)}`);
}

// Digests go out once a day within their window, remembered in the store so a restart doesn't repost
const DIGESTS = [
  { kind: "morning", from: 9, to: 12, build: morningDigest },
  { kind: "evening", from: 16, to: 20, build: eveningDigest }
];

async function runDigests() {
  const now = istNow();
  const today = isoDay(now);
  const hour = now.getUTCHours();
  const store = storeLib.store();
  const sent = (await store.getConfig("telegramDigests")) || {};
  for (const d of DIGESTS) {
    if (hour < d.from || hour >= d.to || sent[d.kind] === today) continue;
    const text = d.build(await market.getBoard(), today);
    // Post first: a failed post is retried on the next tick. A day with nothing to post is also marked done.
    if (text) {
      await telegram.post(text);
      console.log(`[TELEGRAM] Posted ${d.kind} digest`);
    }
    sent[d.kind] = today;
    await store.setConfig("telegramDigests", sent);
  }
}

// One "connected" post the first time the bot runs, so the owner can see the setup works
async function welcomeOnce() {
  const store = storeLib.store();
  if (await store.getConfig("telegramWelcomed")) return;
  await telegram.post(`✅ <b>Qasid is connected.</b>\nIPO updates every morning, listing gains every evening, and an alert the moment any allotment is out.\n\n${SITE}`);
  await store.setConfig("telegramWelcomed", new Date().toISOString());
  console.log("[TELEGRAM] Posted welcome message");
}

function startTelegramDigests() {
  if (!ALLOTMENT_ALERTS || !telegram.enabled()) return;
  welcomeOnce().catch(err => console.error("[TELEGRAM] welcome failed:", err.message));
  const tick = () => runDigests().catch(err => console.error("[TELEGRAM] digest failed:", err.message));
  tick();
  setInterval(tick, 5 * 60 * 1000).unref();
  console.log("[TELEGRAM] Channel posts on");
}

module.exports = { startTelegramDigests, postAllotment, morningDigest, eveningDigest, allotmentMessage };
