// Presentation logic shared by every IPO view: stage colours, countdowns, estimates, lot maths.

export const STAGES = {
  open: { label: "Open", text: "text-open", bg: "bg-open", soft: "bg-open-soft", ring: "ring-open/30" },
  upcoming: { label: "Upcoming", text: "text-upcoming", bg: "bg-upcoming", soft: "bg-upcoming-soft", ring: "ring-upcoming/30" },
  closed: { label: "Closed", text: "text-closed", bg: "bg-closed", soft: "bg-closed-soft", ring: "ring-closed/30" },
  listed: { label: "Listed", text: "text-listed", bg: "bg-listed", soft: "bg-listed-soft", ring: "ring-listed/30" }
};

const DAY = 864e5;

export function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  return Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / DAY);
}

// "Closes today", "Opens in 3 days", "Lists tomorrow"...
export function countdown(ipo) {
  const today = todayIso();
  const rel = (iso, verb) => {
    const d = daysBetween(today, iso);
    if (d === null) return null;
    if (d === 0) return `${verb} today`;
    if (d === 1) return `${verb} tomorrow`;
    if (d > 1) return `${verb} in ${d} days`;
    return null;
  };
  if (ipo.status === "upcoming") return rel(ipo.openDate, "Opens") || "Dates soon";
  if (ipo.status === "open") return rel(ipo.closeDate, "Closes");
  if (ipo.status === "closed") return rel(ipo.allotmentDate, "Allotment") || rel(ipo.listingDate, "Lists") || "Awaiting listing";
  return null;
}

export function issuePrice(ipo) {
  return ipo.priceMax || ipo.issuePrice || ipo.priceMin || null;
}

// Estimated listing from GMP
export function estimate(ipo) {
  const price = issuePrice(ipo);
  if (ipo.gmp === null || ipo.gmp === undefined || !price) return null;
  const gmp = Number(ipo.gmp);
  return {
    gmp,
    price: price + gmp,
    pct: (gmp / price) * 100,
    perLot: ipo.lotSize ? gmp * ipo.lotSize : null
  };
}

// SME individuals must apply for at least 2 lots
export function minInvestment(ipo) {
  const price = issuePrice(ipo);
  return price && ipo.lotSize ? price * ipo.lotSize * (ipo.type === "SME" ? 2 : 1) : null;
}

// SEBI application limits: retail up to ₹2L, small NII ₹2L–10L, big NII above ₹10L.
// SME issues: individuals apply for a fixed 2 lots; HNIs start at 3 lots.
export function lotTable(ipo) {
  const price = issuePrice(ipo);
  const lot = ipo.lotSize;
  if (!price || !lot) return [];
  const perLot = price * lot;
  const lotsUnder = limit => Math.floor(limit / perLot);
  const rows = [];
  if (ipo.type === "SME") {
    rows.push({ category: "Individual", lots: 2, shares: 2 * lot, amount: 2 * perLot });
    rows.push({ category: "HNI (min)", lots: 3, shares: 3 * lot, amount: 3 * perLot });
    return rows;
  }
  const retailMax = Math.max(1, lotsUnder(200000));
  const sHniMin = retailMax + 1;
  const sHniMax = Math.max(sHniMin, lotsUnder(1000000));
  const bHniMin = sHniMax + 1;
  rows.push({ category: "Retail (min)", lots: 1, shares: lot, amount: perLot });
  rows.push({ category: "Retail (max)", lots: retailMax, shares: retailMax * lot, amount: retailMax * perLot });
  rows.push({ category: "sHNI (min)", lots: sHniMin, shares: sHniMin * lot, amount: sHniMin * perLot });
  rows.push({ category: "sHNI (max)", lots: sHniMax, shares: sHniMax * lot, amount: sHniMax * perLot });
  rows.push({ category: "bHNI (min)", lots: bHniMin, shares: bHniMin * lot, amount: bHniMin * perLot });
  return rows;
}

// Stable vivid colour per company for logo fallbacks
const SWATCHES = ["#EA580C", "#DB2777", "#E11D48", "#D97706", "#16A34A", "#0D9488", "#0891B2", "#2563EB", "#C2410C", "#65A30D"];
export function swatch(name) {
  let h = 0;
  for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SWATCHES[h % SWATCHES.length];
}

export function initials(name) {
  return String(name || "?")
    .replace(/\b(limited|ltd|india|the)\b\.?/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase() || "?";
}

export function shareText(ipo) {
  const e = estimate(ipo);
  const parts = [
    `${ipo.name} IPO`,
    ipo.priceMax ? `Price ₹${ipo.priceMin && ipo.priceMin !== ipo.priceMax ? `${ipo.priceMin}–` : ""}${ipo.priceMax}` : null,
    ipo.subscription?.total ? `Subscribed ${Number(ipo.subscription.total).toFixed(2)}x` : null,
    e ? `GMP ₹${e.gmp} (${e.pct.toFixed(1)}%)` : null
  ].filter(Boolean);
  return parts.join(" · ");
}
