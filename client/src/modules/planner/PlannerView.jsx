import { useEffect, useMemo, useRef, useState } from "react";
import { CompanyLogo, Empty, Icon, SkeletonCards, Tabs } from "../../shared/ui/index.js";
import { useStoredState } from "../../shared/hooks/useStoredState.js";
import { date, num } from "../../shared/lib/format.js";
import { todayIso } from "../../shared/lib/ipo.js";
import { useMarket } from "../market/market.controller.jsx";
import { usePans } from "../pans/pans.controller.jsx";
import { analyse, buildPlan, CATEGORIES, VERDICTS } from "./planner.logic.js";
import { IpoCalendar } from "./IpoCalendar.jsx";
import { AgendaCalendar } from "./AgendaCalendar.jsx";
import { ipoId } from "../market/market.controller.jsx";

const rupee = n => `₹${num(Math.round(n))}`;
const lakh = n => (n >= 100000 ? `₹${(n / 100000).toFixed(n >= 1000000 ? 1 : 2)}L` : rupee(n));

function ScoreRing({ score, verdict }) {
  const r = 22, c = 2 * Math.PI * r;
  const colour = verdict === "strong" || verdict === "apply" ? "text-open" : verdict === "consider" ? "text-closed" : verdict === "avoid" ? "text-loss" : "text-ink-3";
  return (
    <div className={`relative size-14 shrink-0 ${colour}`} aria-label={score === null ? "No score" : `Score ${score} of 100`}>
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--raised)" strokeWidth="6" />
        {score !== null && <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[15px] font-extrabold text-ink">{score ?? "–"}</span>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, tone = "" }) {
  return (
    <div className="card p-4">
      <p className={`text-[22px] sm:text-[24px] font-extrabold leading-tight ${tone}`}>{value}</p>
      <p className="text-[12.5px] font-semibold text-ink-3 mt-0.5">{label}</p>
    </div>
  );
}

function PickCard({ a, row, rank, onOpen, focused }) {
  const [open, setOpen] = useState(rank <= 2 || focused);
  const ref = useRef(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);
  const v = VERDICTS[a.verdict];
  const today = todayIso();
  const applyBy = a.window?.applyBy;
  return (
    <article ref={ref} id={`pick-${ipoId(a.ipo)}`} className={`card p-4 sm:p-5 scroll-mt-24 ${focused ? "ring-2 ring-brand" : ""}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <ScoreRing score={a.score} verdict={a.verdict} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold text-ink-3">#{rank}</span>
            <span className={`h-6 px-2.5 rounded-full text-[11.5px] font-bold grid place-items-center ${v.tone}`}>{v.label}</span>
            {a.ipo.type === "SME" && <span className="h-6 px-2.5 rounded-full text-[11.5px] font-bold grid place-items-center bg-sme-soft text-sme">SME</span>}
            {row?.apps > 0 && <span className="h-6 px-2.5 rounded-full text-[11.5px] font-bold grid place-items-center bg-brand text-on-brand">Plan: {row.apps} PAN{row.apps > 1 ? "s" : ""}</span>}
          </div>
          <button onClick={() => onOpen(a.ipo)} className="mt-1.5 flex items-center gap-2 text-left hover:text-brand">
            <CompanyLogo name={a.ipo.name} src={a.ipo.logo} size={28} className="rounded-lg!" />
            <span className="font-bold text-[15.5px] leading-snug">{a.ipo.name}</span>
          </button>
        </div>
      </div>

      {a.size && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-raised/70 px-3 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Apply</p>
            <p className="text-[13.5px] font-bold">{a.size.lots} lot{a.size.lots > 1 ? "s" : ""} · {rupee(a.size.amount)}</p>
          </div>
          <div className="rounded-xl bg-raised/70 px-3 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Allotment chance</p>
            <p className="text-[13.5px] font-bold">{Math.round(a.chance * 100)}%{a.demand.estimated ? <span className="text-ink-3 font-semibold"> est.</span> : ""}</p>
          </div>
          <div className="rounded-xl bg-raised/70 px-3 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Expected / PAN</p>
            <p className={`text-[13.5px] font-bold ${a.ev > 0 ? "text-gain" : "text-loss"}`}>{a.ev !== undefined ? rupee(a.ev) : "—"}</p>
          </div>
          <div className="rounded-xl bg-raised/70 px-3 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Apply by</p>
            <p className="text-[13.5px] font-bold">{applyBy ? (applyBy === today ? "Today, 5 PM" : date(applyBy)) : "—"}</p>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(o => !o)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-brand">
        Why this score <Icon name="chevronDown" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 animate-fade">
          {a.reasons.map(r => (
            <li key={r} className="flex gap-2 text-[13.5px] text-ink-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />{r}
            </li>
          ))}
          {a.window && <li className="flex gap-2 text-[13.5px] text-ink-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />Funds blocked {date(a.window.from)} → back by {date(a.window.until)} if you apply on the last day</li>}
          {row?.skipped && <li className="flex gap-2 text-[13.5px] text-loss"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-loss" />Not in plan: {row.skipped}</li>}
        </ul>
      )}
    </article>
  );
}

export function PlannerView({ onOpenIpo, focusId }) {
  const m = useMarket();
  const { pans } = usePans();
  const [budget, setBudget] = useStoredState("planBudget", 200000);
  const [accounts, setAccounts] = useStoredState("planAccounts", Math.max(1, pans.length || 1));
  const [category, setCategory] = useStoredState("planCategory", "retail");
  const [includeSme, setIncludeSme] = useStoredState("planSme", true);

  const actionable = useMemo(() => (m.board ? [...m.board.open, ...m.board.upcoming] : []), [m.board]);
  const analyses = useMemo(() => actionable
    .filter(i => includeSme || i.type !== "SME")
    .map(i => analyse(i, category))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)), [actionable, includeSme, category]);
  const plan = useMemo(() => buildPlan(analyses, { budget: Number(budget) || 0, accounts: Number(accounts) || 1 }), [analyses, budget, accounts]);
  const rowFor = a => plan.rows.find(r => r.ipo === a.ipo);
  const calendarIpos = useMemo(() => (m.board ? [...m.board.open, ...m.board.upcoming, ...m.board.closed] : []).filter(i => includeSme || i.type !== "SME"), [m.board, includeSme]);

  if (!m.board) return m.error ? <Empty icon="info" title="Couldn't load IPOs">{m.error}</Empty> : <SkeletonCards count={3} />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[28px] sm:text-[32px] font-extrabold tracking-tight">IPO planner</h1>
        <p className="text-ink-3 mt-1">Overlapping IPOs on one calendar, a priority score for each, and the best plan for your budget.</p>
      </div>

      <section className="card p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Budget per day" hint="Money you can keep blocked at once">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 font-bold">₹</span>
              <input type="number" min="0" step="5000" value={budget} onChange={e => setBudget(e.target.value)} className="w-full h-11 pl-8 pr-3 rounded-xl bg-raised font-bold outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </Field>
          <Field label="PANs / demat accounts" hint={pans.length ? `${pans.length} saved PAN${pans.length > 1 ? "s" : ""}` : "One application per PAN"}>
            <div className="flex items-center gap-2">
              <button onClick={() => setAccounts(a => Math.max(1, Number(a) - 1))} className="size-11 rounded-xl bg-raised font-bold text-[18px]" aria-label="Fewer PANs">−</button>
              <span className="flex-1 text-center text-[18px] font-extrabold">{accounts}</span>
              <button onClick={() => setAccounts(a => Math.min(50, Number(a) + 1))} className="size-11 rounded-xl bg-raised font-bold text-[18px]" aria-label="More PANs">+</button>
            </div>
          </Field>
          <Field label="Category" hint={CATEGORIES[category].hint}>
            <Tabs size="sm" label="Category" value={category} onChange={setCategory} items={Object.entries(CATEGORIES).map(([value, c]) => ({ value, label: c.label, tone: "brand" }))} />
          </Field>
          <Field label="SME IPOs" hint="Higher risk, 2-lot minimum">
            <Tabs size="sm" label="SME" value={includeSme ? "yes" : "no"} onChange={v => setIncludeSme(v === "yes")} items={[{ value: "yes", label: "Include", tone: "brand" }, { value: "no", label: "Skip", tone: "brand" }]} />
          </Field>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Applications in plan" value={plan.applications} tone="text-brand" />
        <Stat label="IPOs picked" value={plan.chosen.length} />
        <Stat label="Peak money blocked" value={lakh(plan.peak)} />
        <Stat label="Expected profit" value={rupee(plan.expectedProfit)} tone="text-gain" />
      </div>

      {plan.chosen.length > 0 ? (
        <section className="mt-4 card p-5">
          <h2 className="font-bold text-[16px] flex items-center gap-2"><Icon name="sparkles" className="size-5 text-brand" />Your plan</h2>
          <ol className="mt-3 space-y-2">
            {plan.chosen.map((r, i) => (
              <li key={r.ipo.name}>
                <button onClick={() => onOpenIpo(r.ipo)} className="w-full flex items-start gap-3 rounded-2xl bg-raised/60 active:bg-raised px-3 py-3 text-left">
                  <span className="mt-0.5 size-6 shrink-0 grid place-items-center rounded-full bg-brand text-on-brand text-[12px] font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-bold text-[14.5px] leading-snug">{r.ipo.name}</span>
                      <span className="shrink-0 font-extrabold text-gain text-[14px]">≈ {rupee(r.expected)}</span>
                    </span>
                    <span className="mt-1 block text-[13px] text-ink-2">{r.apps} PAN{r.apps > 1 ? "s" : ""} × {rupee(r.size.amount)} = <b className="text-ink">{lakh(r.capital)}</b></span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-3">Apply by {r.window.applyBy === todayIso() ? "today 5 PM" : date(r.window.applyBy)} · money back {date(r.window.until)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {plan.reuse.length > 0 && (
            <p className="mt-3 flex gap-2 text-[13px] text-ink-2">
              <Icon name="refresh" className="size-4 shrink-0 mt-0.5 text-brand" />
              Money recycles: funds from {plan.reuse[0].from} come back on {date(plan.reuse[0].on)}, in time for {plan.reuse[0].to}. That's why the peak stays at {lakh(plan.peak)}.
            </p>
          )}
        </section>
      ) : (
        <section className="mt-4 card p-5 text-[14px] text-ink-2">
          No IPO fits this budget{category === "shni" ? " — Small HNI applications need just over ₹2 lakh each" : ""}. Try a bigger budget or the Retail category.
        </section>
      )}

      <h2 className="mt-9 mb-3 text-[19px] font-extrabold tracking-tight flex items-center gap-2">
        <span className="size-8 grid place-items-center rounded-xl bg-brand-soft text-brand"><Icon name="calendar" className="size-4.5" /></span>
        IPO calendar
      </h2>
      <div className="sm:hidden"><AgendaCalendar ipos={calendarIpos} plan={plan} budget={Number(budget) || 0} onOpen={onOpenIpo} /></div>
      <div className="hidden sm:block"><IpoCalendar ipos={calendarIpos} plan={plan} budget={Number(budget) || 0} onOpen={onOpenIpo} /></div>

      <h2 className="mt-9 mb-3 text-[19px] font-extrabold tracking-tight flex items-center gap-2">
        <span className="size-8 grid place-items-center rounded-xl bg-brand-soft text-brand"><Icon name="fire" className="size-4.5" /></span>
        Priority ranking
      </h2>
      {analyses.length === 0 ? <Empty icon="calendar" title="No open or upcoming IPOs">Check back when new IPOs are announced.</Empty> : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {analyses.map((a, i) => <PickCard key={a.ipo.name} a={a} row={rowFor(a)} rank={i + 1} onOpen={onOpenIpo} focused={focusId === ipoId(a.ipo)} />)}
        </div>
      )}

      <p className="mt-6 flex gap-2 text-[12.5px] text-ink-3">
        <Icon name="info" className="size-4 shrink-0 mt-0.5" />
        Scores combine GMP, projected demand, allotment odds, expected profit per rupee blocked, GMP trend and issue type. Demand before the close and GMP are estimates; this is a planning aid, not investment advice.
      </p>
    </div>
  );
}
