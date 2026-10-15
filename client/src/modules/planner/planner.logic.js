// IPO planner maths: application sizing, allotment odds, expected value, priority score,
// fund-blocking windows and a budget-constrained application plan. Pure functions, no React.
import { estimate, issuePrice, todayIso } from "../../shared/lib/ipo.js";

const DAY = 864e5;

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayRange(from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

const diffDays = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / DAY);

export const CATEGORIES = {
  retail: { label: "Retail", hint: "Minimum application - best odds per rupee when oversubscribed" },
  shni: { label: "Small HNI", hint: "Just above ₹2 lakh per application" }
};

// Lots and amount for one application in the chosen category
export function applicationSize(ipo, category) {
  const price = issuePrice(ipo);
  const lot = ipo.lotSize;
  if (!price || !lot) return null;
  const perLot = price * lot;
  let lots;
  if (ipo.type === "SME") lots = category === "shni" ? 3 : 2;
  else if (category === "shni") lots = Math.floor(200000 / perLot) + 1;
  else lots = 1;
  return { lots, shares: lots * lot, amount: lots * perLot, price };
}

function categoryTimes(ipo, names) {
  const cats = ipo.subscription?.categories || [];
  for (const n of names) {
    const hit = cats.find(c => c.category === n);
    if (hit && hit.times !== null && hit.times !== undefined) return Number(hit.times);
  }
  return null;
}

// Final oversubscription for the category.
// - Bidding over: the actual number.
// - Bidding live: live number scaled up for the days left (bids pile up near the close).
// - Not started: projected from GMP on a flattening curve (12% GMP ≈ 8x, 33% ≈ 35x, 70% ≈ 110x).
const LIVE_GROWTH = [1.5, 2.5, 4]; // closes today / tomorrow / later

export function demand(ipo, category) {
  const names = category === "shni" ? ["sNII (₹2–10L)", "NII"] : ["Retail", "Individual"];
  const actual = categoryTimes(ipo, names) ?? (ipo.subscription?.total ? Number(ipo.subscription.total) : null);
  const today = todayIso();
  const closed = ipo.status === "closed" || ipo.status === "listed" || (ipo.closeDate && ipo.closeDate < today);
  const e = estimate(ipo);
  const pct = e ? Math.max(0, e.pct) : 0;
  const fromGmp = Math.min(250, 1 + Math.pow(pct, 1.6) / 8);
  if (actual !== null && actual > 0) {
    if (closed) return { times: actual, estimated: false, basis: "final" };
    const daysLeft = ipo.closeDate ? Math.max(0, diffDays(today, ipo.closeDate)) : 2;
    // Early in bidding the live figure is tiny, so never go below what GMP implies
    const fromLive = actual * LIVE_GROWTH[Math.min(daysLeft, 2)];
    return { times: Math.max(fromLive, fromGmp), estimated: true, basis: fromLive >= fromGmp ? "live" : "gmp", live: actual };
  }
  return { times: fromGmp, estimated: true, basis: "gmp" };
}

// Chance one application gets at least the minimum allotment.
// Retail mainboard: lottery for 1 lot among applicants; applicants average ~1.3 lots, so p ≈ 1.3 / X.
// SME / sHNI: every application is the same size, so p ≈ 1 / X.
export function allotmentChance(ipo, category, times) {
  if (times <= 1) return 1;
  const k = ipo.type !== "SME" && category === "retail" ? 1.3 : 1;
  return Math.min(1, k / times);
}

function gmpTrend(ipo) {
  const pts = (ipo.gmpTrend || []).map(p => p.gmp);
  if (pts.length < 3) return 0; // two points is noise
  const recent = pts.slice(-3);
  const change = recent[recent.length - 1] - recent[0];
  const base = Math.max(1, Math.abs(recent[0]));
  return change / base; // relative move over the last few sessions
}

// When funds are blocked if you apply on the last day (cheapest for capital), and when they come back
export function blockWindow(ipo) {
  const close = ipo.closeDate;
  if (!close) return null;
  const allot = ipo.allotmentDate || addDays(close, 1);
  return { applyBy: close, from: close, until: addDays(allot, 1) };
}

// Full analysis for one IPO
export function analyse(ipo, category) {
  const size = applicationSize(ipo, category);
  const e = estimate(ipo);
  const d = demand(ipo, category);
  const chance = allotmentChance(ipo, category, d.times);
  const window = blockWindow(ipo);
  const reasons = [];
  if (!size || !e) {
    return { ipo, size, chance, demand: d, window, score: null, verdict: "info", reasons: ["Price, lot or GMP not announced yet"] };
  }

  // Shares received if allotted: the minimum lot(s) in an oversubscribed issue, full size otherwise
  const allottedShares = d.times > 1 ? (ipo.type === "SME" ? size.shares : ipo.lotSize * (category === "shni" ? size.lots : 1)) : size.shares;
  const profitIfAllotted = e.gmp * allottedShares;
  const ev = profitIfAllotted * chance;
  const days = window ? Math.max(1, diffDays(window.from, window.until)) : 3;
  const evPerLakh = (ev / size.amount) * 100000;
  const trend = gmpTrend(ipo);
  const qib = categoryTimes(ipo, ["QIB"]);

  let score = 0;
  score += Math.max(-30, Math.min(45, e.pct * 1.2));          // listing pop
  score += Math.max(0, Math.min(30, evPerLakh / 150));          // expected ₹ per ₹1L blocked
  score += trend > 0.08 ? 8 : trend < -0.08 ? -10 : 0;          // GMP momentum
  // Only reward QIB demand: institutions usually bid on the last day, so a low live figure means little
  score += qib !== null ? (qib >= 20 ? 10 : qib >= 5 ? 5 : 0) : 0;
  score += ipo.type === "SME" ? -6 : 0;                         // SME: thinner, more volatile listings
  score += chance >= 0.5 ? 5 : 0;
  score = Math.round(Math.max(0, Math.min(100, score + 10)));

  if (e.gmp <= 0) score = Math.min(score, 15);
  const verdict = e.gmp <= 0 ? "avoid" : score >= 70 ? "strong" : score >= 50 ? "apply" : score >= 30 ? "consider" : "avoid";

  reasons.push(`${e.pct >= 0 ? "+" : ""}${e.pct.toFixed(1)}% GMP → est. ₹${Math.round(profitIfAllotted).toLocaleString("en-IN")} profit if allotted`);
  reasons.push(`${Math.round(chance * 100)}% allotment chance · ${d.basis === "final" ? `${d.times.toFixed(1)}x final demand` : d.basis === "live" ? `${d.live.toFixed(1)}x live, ~${d.times.toFixed(0)}x expected at close` : `~${d.times.toFixed(0)}x demand projected from GMP`}`);
  reasons.push(`₹${Math.round(evPerLakh).toLocaleString("en-IN")} expected per ₹1L blocked for ~${days} day${days > 1 ? "s" : ""}`);
  if (trend > 0.08) reasons.push("GMP rising over recent sessions");
  if (trend < -0.08) reasons.push("GMP falling over recent sessions");
  if (qib !== null && qib >= 20) reasons.push(`Strong institutional demand (QIB ${qib.toFixed(1)}x)`);
  if (ipo.type === "SME") reasons.push("SME issue: higher risk and 2-lot minimum");
  if (category === "retail" && d.times > 1 && ipo.type !== "SME") reasons.push("Apply 1 lot per PAN - extra lots don't improve retail odds");

  return { ipo, size, chance, demand: d, window, ev, evPerLakh, profitIfAllotted, days, trend, score, verdict, reasons };
}

export const VERDICTS = {
  strong: { label: "Strong apply", tone: "bg-open text-on-brand" },
  apply: { label: "Apply", tone: "bg-open-soft text-open" },
  consider: { label: "Consider", tone: "bg-closed-soft text-closed" },
  avoid: { label: "Avoid", tone: "bg-loss-soft text-loss" },
  info: { label: "Awaiting data", tone: "bg-raised text-ink-3" }
};

// Greedy budget allocation: best IPOs first, as many PANs as the per-day blocked capital allows.
// Applying on each IPO's last day lets money unblocked from one allotment fund the next IPO.
export function buildPlan(analyses, { budget, accounts }) {
  const used = new Map();
  const rows = [];
  const candidates = analyses
    // "Consider" picks only make the plan when they still return at least ~2% on the blocked money
    .filter(a => a.score !== null && a.window && a.size && (a.verdict === "strong" || a.verdict === "apply" || (a.verdict === "consider" && a.evPerLakh >= 2000)))
    .sort((a, b) => b.score - a.score || b.evPerLakh - a.evPerLakh);

  for (const a of candidates) {
    const days = dayRange(a.window.from, addDays(a.window.until, -1));
    const free = Math.min(...days.map(d => budget - (used.get(d) || 0)));
    const apps = Math.max(0, Math.min(accounts, Math.floor(free / a.size.amount)));
    if (apps === 0) { rows.push({ ...a, apps: 0, skipped: free < a.size.amount ? "Budget fully blocked on these dates" : "" }); continue; }
    days.forEach(d => used.set(d, (used.get(d) || 0) + apps * a.size.amount));
    rows.push({ ...a, apps, capital: apps * a.size.amount, expected: apps * a.ev });
  }

  const chosen = rows.filter(r => r.apps > 0);
  const peak = Math.max(0, ...used.values());
  // Money that comes back before another chosen IPO's apply date can be recycled into it
  const reuse = [];
  for (const r of chosen) {
    for (const next of chosen) {
      if (next !== r && r.window.until <= next.window.from) {
        reuse.push({ from: r.ipo.name, to: next.ipo.name, on: r.window.until });
      }
    }
  }
  return {
    rows,
    chosen,
    usedByDay: used,
    peak,
    totalCapitalApplied: chosen.reduce((s, r) => s + r.capital, 0),
    expectedProfit: chosen.reduce((s, r) => s + r.expected, 0),
    applications: chosen.reduce((s, r) => s + r.apps, 0),
    reuse: reuse.slice(0, 4)
  };
}

// Calendar span: today (or earliest open date) to the latest listing among shown IPOs, max ~5 weeks
export function calendarSpan(ipos) {
  const today = todayIso();
  const starts = ipos.map(i => i.openDate).filter(Boolean);
  const ends = ipos.map(i => i.listingDate || i.allotmentDate || i.closeDate).filter(Boolean);
  const from = [today, ...starts].sort()[0] < addDays(today, -7) ? addDays(today, -7) : [today, ...starts].sort()[0];
  let to = [addDays(today, 10), ...ends].sort().at(-1);
  if (diffDays(from, to) > 35) to = addDays(from, 35);
  return dayRange(from, to);
}

// How many IPOs are open for bidding on each day
export function overlapByDay(ipos, days) {
  return new Map(days.map(d => [d, ipos.filter(i => i.openDate && i.closeDate && i.openDate <= d && d <= i.closeDate)]));
}
