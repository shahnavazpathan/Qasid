const isBlank = v => v === null || v === undefined || v === "" || Number.isNaN(Number(v));

export function date(value, withYear = false) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear && { year: "numeric" }) });
}

export function num(n, digits = 0) {
  return isBlank(n) ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export function times(n) {
  return isBlank(n) ? "—" : `${Number(n).toFixed(2)}×`;
}

export function rupees(n, digits = 0) {
  return isBlank(n) ? "—" : `₹${num(n, digits)}`;
}

export function signed(n, suffix = "") {
  if (isBlank(n)) return "—";
  const v = Number(n);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), 1)}${suffix}`;
}

export function priceBand(ipo) {
  const { priceMin, priceMax } = ipo;
  if (priceMin && priceMax && priceMin !== priceMax) return `₹${num(priceMin)}–${num(priceMax)}`;
  if (priceMax || priceMin) return rupees(priceMax || priceMin);
  return ipo.priceBand || "—";
}

export function issueSize(ipo) {
  return ipo.issueSizeCr ? `₹${num(ipo.issueSizeCr, 0)} Cr` : ipo.issueSize || "—";
}

export function gmp(ipo) {
  if (isBlank(ipo.gmp)) return null;
  const v = Number(ipo.gmp);
  const pct = ipo.priceMax ? (v / ipo.priceMax) * 100 : null;
  return { value: v, text: `${signed(v)}${pct === null ? "" : ` · ${signed(pct, "%")}`}` };
}

export function clock(ts) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
