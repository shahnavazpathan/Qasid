import { useEffect, useMemo, useRef, useState } from "react";
import { CompanyLogo, Icon } from "../../shared/ui/index.js";
import { todayIso } from "../../shared/lib/ipo.js";
import { addDays, blockWindow, calendarSpan } from "./planner.logic.js";

// Phone calendar: swipeable date strip + agenda for the chosen day.
const fmt = (iso, opts) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });
const isWeekend = iso => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

const KINDS = {
  last: { label: "Last day to apply", dot: "bg-loss", chip: "bg-loss-soft text-loss", icon: "clock" },
  opens: { label: "Opens", dot: "bg-upcoming", chip: "bg-upcoming-soft text-upcoming", icon: "bolt" },
  bidding: { label: "Open for bidding", dot: "bg-open", chip: "bg-open-soft text-open", icon: "calendar" },
  allotment: { label: "Allotment", dot: "bg-gain", chip: "bg-gain-soft text-gain", icon: "check" },
  listing: { label: "Listing", dot: "bg-listed", chip: "bg-listed-soft text-listed", icon: "trendUp" },
  blocked: { label: "Money blocked", dot: "bg-closed", chip: "bg-closed-soft text-closed", icon: "layers" }
};
const ORDER = ["last", "opens", "bidding", "allotment", "listing", "blocked"];

function eventsOn(day, ipos, planned) {
  const out = [];
  for (const ipo of ipos) {
    const w = blockWindow(ipo);
    if (ipo.closeDate === day && ipo.openDate && ipo.openDate <= day) out.push({ kind: "last", ipo });
    else if (ipo.openDate === day) out.push({ kind: "opens", ipo });
    else if (ipo.openDate && ipo.closeDate && ipo.openDate < day && day < ipo.closeDate) out.push({ kind: "bidding", ipo });
    if (ipo.allotmentDate === day) out.push({ kind: "allotment", ipo });
    if (ipo.listingDate === day) out.push({ kind: "listing", ipo });
    const plan = planned.get(ipo);
    if (plan && w && w.from < day && day < w.until && ipo.allotmentDate !== day) out.push({ kind: "blocked", ipo, amount: plan.capital });
  }
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

export function AgendaCalendar({ ipos, plan, budget, onOpen }) {
  const rows = useMemo(() => ipos.filter(i => i.openDate || i.closeDate), [ipos]);
  const days = useMemo(() => (rows.length ? calendarSpan(rows) : []), [rows]);
  const today = todayIso();
  const [day, setDay] = useState(days.includes(today) ? today : days[0]);
  const strip = useRef(null);
  const planned = useMemo(() => new Map(plan.chosen.map(r => [r.ipo, r])), [plan]);
  const byDay = useMemo(() => new Map(days.map(d => [d, eventsOn(d, rows, planned)])), [days, rows, planned]);

  // Start the strip scrolled to the selected day
  useEffect(() => {
    strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  if (!days.length) return <div className="card p-5 text-ink-3">No dated IPOs to show yet.</div>;

  const events = byDay.get(day) || [];
  const used = plan.usedByDay.get(day) || 0;
  const openCount = events.filter(e => e.kind === "last" || e.kind === "opens" || e.kind === "bidding").length;

  return (
    <div className="card overflow-hidden">
      <div ref={strip} className="flex gap-1.5 overflow-x-auto no-scrollbar px-3 py-3 border-b border-line snap-x">
        {days.map(d => {
          const ev = byDay.get(d);
          const kinds = [...new Set(ev.map(e => e.kind))].slice(0, 4);
          const selected = d === day;
          return (
            <button
              key={d}
              onClick={() => setDay(d)}
              aria-pressed={selected}
              aria-label={`${fmt(d, { weekday: "long", day: "numeric", month: "long" })}, ${ev.length} events`}
              className={`snap-center shrink-0 w-[52px] rounded-2xl py-2 flex flex-col items-center gap-0.5 transition-colors ${
                selected ? "bg-brand text-on-brand" : d === today ? "bg-brand-soft text-brand" : isWeekend(d) ? "bg-raised/50 text-ink-3" : "bg-raised/70"
              }`}
            >
              <span className="text-[10.5px] font-bold uppercase">{fmt(d, { weekday: "short" }).slice(0, 3)}</span>
              <span className="text-[18px] font-extrabold leading-none">{Number(d.slice(8, 10))}</span>
              <span className="h-2 flex gap-0.5 items-center">
                {kinds.map(k => <i key={k} className={`size-1.5 rounded-full ${selected ? "bg-on-brand" : KINDS[k].dot}`} />)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-extrabold text-[17px]">{d2(day, today)}</p>
          {openCount > 0 && <span className="text-[12.5px] font-bold text-open">{openCount} open for bidding</span>}
        </div>
        {budget > 0 && used > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[12px] font-semibold text-ink-3 mb-1">
              <span>Plan money blocked</span>
              <span className="text-ink">₹{Math.round(used).toLocaleString("en-IN")} / ₹{Math.round(budget).toLocaleString("en-IN")}</span>
            </div>
            <div className="h-2 rounded-full bg-raised overflow-hidden">
              <div className={`h-full rounded-full ${used / budget > 0.95 ? "bg-loss" : "bg-brand"}`} style={{ width: `${Math.min(100, (used / budget) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <p className="px-4 pb-5 pt-2 text-[14px] text-ink-3">{isWeekend(day) ? "Weekend - markets closed." : "Nothing happens on this day."}</p>
      ) : (
        <ul className="px-2 pb-3">
          {events.map(e => {
            const k = KINDS[e.kind];
            const p = planned.get(e.ipo);
            return (
              <li key={e.kind + e.ipo.name}>
                <button onClick={() => onOpen(e.ipo)} className="w-full flex items-center gap-3 rounded-2xl px-2 py-2.5 text-left active:bg-raised">
                  <CompanyLogo name={e.ipo.name} src={e.ipo.logo} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[14.5px] leading-snug truncate">{e.ipo.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-bold ${k.chip}`}>
                        <Icon name={k.icon} className="size-3.5" />{k.label}{e.kind === "last" && day === today ? " · 5 PM" : ""}
                      </span>
                      {e.kind === "blocked" && <span className="text-[12px] font-semibold text-ink-2">₹{Math.round(e.amount).toLocaleString("en-IN")}</span>}
                      {p && e.kind !== "blocked" && <span className="h-6 px-2 rounded-full text-[11.5px] font-bold grid place-items-center bg-brand text-on-brand">Plan ×{p.apps}</span>}
                    </span>
                  </span>
                  <Icon name="chevronRight" className="size-4.5 text-ink-3 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-4 py-3 border-t border-line text-[11.5px] text-ink-2">
        {ORDER.map(kk => <span key={kk} className="inline-flex items-center gap-1.5"><i className={`size-2 rounded-full ${KINDS[kk].dot}`} />{KINDS[kk].label}</span>)}
      </div>
    </div>
  );
}

function d2(day, today) {
  if (day === today) return `Today · ${fmt(day, { day: "numeric", month: "short" })}`;
  if (day === addDays(today, 1)) return `Tomorrow · ${fmt(day, { day: "numeric", month: "short" })}`;
  return fmt(day, { weekday: "long", day: "numeric", month: "short" });
}
