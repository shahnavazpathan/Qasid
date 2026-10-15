import { CompanyLogo, Icon } from "../../shared/ui/index.js";
import { todayIso } from "../../shared/lib/ipo.js";
import { addDays, blockWindow, calendarSpan, overlapByDay } from "./planner.logic.js";

const COL = 44; // px per day

const weekday = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
const dayNum = iso => Number(iso.slice(8, 10));
const monthShort = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
const isWeekend = iso => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

function Legend() {
  const items = [
    ["bg-open", "Bidding open"],
    ["bg-upcoming", "Upcoming bidding"],
    ["bg-closed-soft ring-1 ring-closed/40", "Money blocked (apply on last day)"],
    ["bg-gain", "Allotment"],
    ["bg-listed", "Listing"]
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-3 border-t border-line text-[12px] text-ink-2">
      {items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><i className={`h-2.5 w-5 rounded-sm ${c}`} />{l}</span>)}
    </div>
  );
}

export function IpoCalendar({ ipos, plan, budget, onOpen }) {
  const rows = ipos.filter(i => i.openDate || i.closeDate);
  if (!rows.length) return <div className="card p-5 text-ink-3">No dated IPOs to show yet.</div>;

  const days = calendarSpan(rows);
  const index = new Map(days.map((d, i) => [d, i]));
  const today = todayIso();
  const overlap = overlapByDay(rows, days);
  const planned = new Map(plan.chosen.map(r => [r.ipo, r]));
  const grid = { display: "grid", gridTemplateColumns: `repeat(${days.length}, ${COL}px)` };
  const width = days.length * COL;

  // Clamp a date range onto the visible columns -> CSS grid column span
  const span = (from, to) => {
    if (!from || !to || to < days[0] || from > days.at(-1)) return null;
    const a = index.get(from < days[0] ? days[0] : from);
    const b = index.get(to > days.at(-1) ? days.at(-1) : to);
    return { gridColumn: `${a + 1} / ${b + 2}` };
  };
  const at = d => (index.has(d) ? { gridColumn: `${index.get(d) + 1} / span 1` } : null);

  const overlapTone = n => (n >= 3 ? "bg-loss text-on-brand" : n === 2 ? "bg-closed text-on-brand" : n === 1 ? "bg-open-soft text-open" : "");

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Header: days */}
          <div className="flex border-b border-line bg-surface sticky top-0">
            <div className="sticky left-0 z-10 w-[180px] sm:w-[220px] shrink-0 bg-surface border-r border-line px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3 flex items-end">IPO</div>
            <div style={{ ...grid, width }}>
              {days.map(d => (
                <div key={d} className={`text-center py-2 ${d === today ? "bg-brand text-on-brand rounded-b-lg" : isWeekend(d) ? "text-ink-3 bg-raised/50" : ""}`}>
                  <div className="text-[10px] font-semibold uppercase">{weekday(d).slice(0, 2)}</div>
                  <div className="text-[14px] font-extrabold leading-tight">{dayNum(d)}</div>
                  {(dayNum(d) === 1 || d === days[0]) && <div className="text-[9.5px] font-semibold uppercase opacity-80">{monthShort(d)}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Overlap counter */}
          <div className="flex border-b border-line">
            <div className="sticky left-0 z-10 w-[180px] sm:w-[220px] shrink-0 bg-surface border-r border-line px-4 py-2 text-[12.5px] font-bold">Open on this day</div>
            <div style={{ ...grid, width }} className="items-center py-1.5">
              {days.map(d => {
                const n = overlap.get(d).length;
                return (
                  <div key={d} className="flex justify-center" title={overlap.get(d).map(i => i.name).join(", ")}>
                    {n > 0 && <span className={`size-7 grid place-items-center rounded-lg text-[12px] font-extrabold ${overlapTone(n)}`}>{n}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Money blocked by the plan, per day, vs budget */}
          {budget > 0 && (
            <div className="flex border-b border-line">
              <div className="sticky left-0 z-10 w-[180px] sm:w-[220px] shrink-0 bg-surface border-r border-line px-4 py-2">
                <p className="text-[12.5px] font-bold">Plan money blocked</p>
                <p className="text-[11px] text-ink-3">of ₹{(budget / 100000).toFixed(2)}L budget</p>
              </div>
              <div style={{ ...grid, width }} className="items-end h-14 py-1.5">
                {days.map(d => {
                  const used = plan.usedByDay.get(d) || 0;
                  const pct = Math.min(100, (used / budget) * 100);
                  return (
                    <div key={d} className="h-full flex items-end justify-center" title={used ? `₹${Math.round(used).toLocaleString("en-IN")} blocked` : ""}>
                      {used > 0 && <div className={`w-6 rounded-t-md ${pct > 95 ? "bg-loss" : "bg-brand"}`} style={{ height: `${Math.max(8, pct)}%` }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* One row per IPO */}
          {rows.map(ipo => {
            const w = blockWindow(ipo);
            const bid = span(ipo.openDate || ipo.closeDate, ipo.closeDate || ipo.openDate);
            const blocked = w ? span(addDays(w.from, 1), addDays(w.until, -1)) : null;
            const inPlan = planned.get(ipo);
            return (
              <div key={ipo.name} className="flex border-b border-line last:border-b-0 hover:bg-raised/40">
                <button onClick={() => onOpen(ipo)} className="sticky left-0 z-10 w-[180px] sm:w-[220px] shrink-0 bg-surface border-r border-line px-3 py-2.5 flex items-center gap-2 text-left hover:text-brand">
                  <CompanyLogo name={ipo.name} src={ipo.logo} size={28} className="rounded-lg!" />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold truncate">{ipo.name}</span>
                    <span className="block text-[11px] text-ink-3">
                      {ipo.type === "SME" ? "SME" : "Mainboard"}
                      {inPlan && <span className="text-brand font-bold"> · plan ×{inPlan.apps}</span>}
                    </span>
                  </span>
                </button>
                <div style={{ ...grid, width }} className="relative items-center py-2.5">
                  {days.map(d => d === today && <div key="today" style={at(d)} className="row-start-1 h-full -my-2.5 border-x-2 border-brand/25" />)}
                  {bid && (
                    <div style={bid} className={`row-start-1 h-7 mx-0.5 rounded-lg px-2 flex items-center text-[11px] font-bold truncate ${ipo.status === "open" ? "bg-open text-on-brand" : ipo.status === "upcoming" ? "bg-upcoming text-on-brand" : "bg-closed text-on-brand"}`}>
                      Bid
                    </div>
                  )}
                  {blocked && <div style={blocked} className="row-start-1 h-7 mx-0.5 rounded-lg bg-closed-soft ring-1 ring-closed/40" title="Money blocked until allotment" />}
                  {ipo.allotmentDate && at(ipo.allotmentDate) && (
                    <div style={at(ipo.allotmentDate)} className="row-start-1 flex justify-center" title={`Allotment ${ipo.allotmentDate}`}>
                      <span className="size-7 grid place-items-center rounded-full bg-gain text-on-brand"><Icon name="check" className="size-4" /></span>
                    </div>
                  )}
                  {ipo.listingDate && at(ipo.listingDate) && (
                    <div style={at(ipo.listingDate)} className="row-start-1 flex justify-center" title={`Listing ${ipo.listingDate}`}>
                      <span className="size-7 grid place-items-center rounded-full bg-listed text-on-brand"><Icon name="trendUp" className="size-4" /></span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Legend />
    </div>
  );
}
