import { useMemo, useState } from "react";
import { CompanyLogo, GainChip, Icon, PageHeader, SectionTitle, SkeletonCards } from "../../shared/ui/index.js";
import { date, num } from "../../shared/lib/format.js";
import { displayName } from "../../shared/lib/names.js";
import { estimate } from "../../shared/lib/ipo.js";
import { useMarket } from "../market/market.controller.jsx";
import { IpoCard, LiveBadge } from "../market/index.js";
import { ipoKey, useAllotment } from "../allotment/allotment.controller.jsx";
import { QuickCheck } from "../allotment/QuickCheck.jsx";
import { AlertsSetup } from "../alerts/AlertsSetup.jsx";

// On phones the five tiles sit 3 + 2 (wide) on a 6-column grid, so none is hidden off-screen
function StatTile({ label, value, dot, onClick, wide }) {
  return (
    <button onClick={onClick} className={`${wide ? "col-span-3" : "col-span-2"} sm:col-span-1 min-w-0 text-left rounded-xl bg-surface border border-line hover:border-ink-3/40 transition-colors px-3.5 py-3`}>
      <p className="text-[24px] font-bold leading-none tabular-nums">{value ?? "–"}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-2 truncate"><span className={`size-1.5 shrink-0 rounded-full ${dot}`} />{label}</p>
    </button>
  );
}

function Row({ ipo, right, onOpen }) {
  return (
    <button onClick={() => onOpen(ipo)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-raised/70 text-left">
      <CompanyLogo name={ipo.name} src={ipo.logo} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[14.5px] truncate">{ipo.name}</span>
        <span className="block text-[12.5px] text-ink-3">{ipo.type === "SME" ? "SME" : "Mainboard"}{ipo.priceMax ? ` · ₹${num(ipo.priceMax)}` : ""}</span>
      </span>
      {right}
    </button>
  );
}

function QuickAllotment() {
  const { ipos, loading } = useAllotment();
  const latest = useMemo(() => ipos.slice(0, 8), [ipos]);
  const [pick, setPick] = useState(null);
  const current = pick || latest[0];
  if (loading) return <div className="card h-48 animate-pulse" />;
  if (!current) return null;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {latest.map(i => (
          <button
            key={ipoKey(i)}
            onClick={() => setPick(i)}
            className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${ipoKey(i) === ipoKey(current) ? "bg-ink text-canvas" : "bg-surface border border-line text-ink-2 hover:text-ink"}`}
          >
            {displayName(i.name).replace(/\s+(limited|ltd\.?)$/i, "")}
          </button>
        ))}
      </div>
      <QuickCheck key={ipoKey(current)} ipo={current} />
    </div>
  );
}

export function HomeView({ onOpenIpo, onCheckAllotment, onBrowse }) {
  const m = useMarket();
  const { findFor } = useAllotment();
  const board = m.board;

  const topGmp = useMemo(() => [...(board?.open || []), ...(board?.upcoming || []), ...(board?.closed || [])]
    .filter(i => estimate(i))
    .sort((a, b) => estimate(b).pct - estimate(a).pct)
    .slice(0, 5), [board]);
  const recentListings = useMemo(() => (board?.listed || []).filter(i => i.listingGain !== null && i.listingGain !== undefined).slice(0, 6), [board]);
  const events = [
    ...m.today.opening.map(i => ["Opens today", i, "text-upcoming bg-upcoming-soft"]),
    ...m.today.closing.map(i => ["Closes today", i, "text-closed bg-closed-soft"]),
    ...m.today.allotment.map(i => ["Allotment today", i, "text-open bg-open-soft"]),
    ...m.today.listing.map(i => ["Lists today", i, "text-listed bg-listed-soft"])
  ];

  return (
    <div>
      <PageHeader title="Today" description={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}>
        <LiveBadge />
      </PageHeader>
      <section className="grid grid-cols-6 sm:grid-cols-5 gap-2.5">
        <StatTile label="Open now" value={m.counts.open} dot="bg-open" onClick={() => onBrowse("open")} />
        <StatTile label="Last day" value={board ? m.today.closing.length : null} dot="bg-closed" onClick={() => onBrowse("open")} />
        <StatTile label="Upcoming" value={m.counts.upcoming} dot="bg-upcoming" onClick={() => onBrowse("upcoming")} />
        <StatTile label="Allotment today" value={board ? m.today.allotment.length : null} dot="bg-gain" onClick={() => onBrowse("closed")} wide />
        <StatTile label="Listing today" value={board ? m.today.listing.length : null} dot="bg-listed" onClick={() => onBrowse("listed")} wide />
      </section>

      {events.length > 0 && (
        <div className="mt-5 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {events.map(([label, ipo, tone]) => (
            <button key={label + ipo.name} onClick={() => onOpenIpo(ipo)} className="shrink-0 flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full bg-surface border border-line hover:border-ink-3/40">
              <CompanyLogo name={ipo.name} src={ipo.logo} size={26} className="rounded-full!" />
              <span className="text-[13px] font-semibold max-w-[180px] truncate">{ipo.name}</span>
              <span className={`h-6 px-2 rounded-full text-[11.5px] font-bold grid place-items-center ${tone}`}>{label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-5"><AlertsSetup compact /></div>

      <SectionTitle title="Check allotment" action="All IPOs" onAction={() => onCheckAllotment(null)} />
      <QuickAllotment />

      <SectionTitle title="Open for bidding" action="View all" onAction={() => onBrowse("open")} />
      {!board ? <SkeletonCards count={3} /> : board.open.length === 0 ? (
        <div className="card p-6 text-ink-3">No IPO is open right now — see what's <button onClick={() => onBrowse("upcoming")} className="text-brand font-bold">coming up</button>.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {board.open.slice(0, 6).map(ipo => (
            <IpoCard key={ipo.name} ipo={ipo} allotment={findFor(ipo.name)} onOpen={onOpenIpo} onCheck={onCheckAllotment} />
          ))}
        </div>
      )}

      <a href="#/planner" className="mt-4 card px-4 py-3.5 flex items-center gap-3 hover:border-ink-3/40 transition-colors">
        <Icon name="calendar" className="size-5 shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[15px]">Which IPO should you apply to?</span>
          <span className="block text-[13px] text-ink-3">Scores and a plan for your budget, in the planner</span>
        </span>
        <Icon name="arrowRight" className="size-4 shrink-0 text-ink-3" />
      </a>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <SectionTitle title="Upcoming" action="All" onAction={() => onBrowse("upcoming")} />
          <div className="card p-2">
            {(board?.upcoming || []).slice(0, 6).map(ipo => (
              <Row key={ipo.name} ipo={ipo} onOpen={onOpenIpo} right={
                <span className="text-right shrink-0">
                  <span className="block text-[13px] font-semibold">{ipo.openDate ? date(ipo.openDate) : "TBA"}</span>
                  <span className="block text-[11.5px] text-ink-3">opens</span>
                </span>
              } />
            ))}
            {board && !board.upcoming.length && <p className="p-4 text-ink-3 text-[14px]">Nothing announced yet.</p>}
          </div>
        </div>

        <div>
          <SectionTitle title="Top GMP" />
          <div className="card p-2">
            {topGmp.map((ipo, i) => {
              const e = estimate(ipo);
              return (
                <Row key={ipo.name} ipo={ipo} onOpen={onOpenIpo} right={
                  <span className="text-right shrink-0">
                    <span className={`block text-[14px] font-bold tabular-nums ${e.gmp >= 0 ? "text-gain" : "text-loss"}`}>{e.pct > 0 ? "+" : ""}{e.pct.toFixed(1)}%</span>
                    <span className="block text-[11.5px] text-ink-3">#{i + 1} · ₹{num(e.gmp)}</span>
                  </span>
                } />
              );
            })}
            {board && !topGmp.length && <p className="p-4 text-ink-3 text-[14px]">No GMP reported.</p>}
          </div>
        </div>

        <div>
          <SectionTitle title="Recent listings" action="All" onAction={() => onBrowse("listed")} />
          <div className="card p-2">
            {recentListings.map(ipo => (
              <Row key={ipo.name} ipo={ipo} onOpen={onOpenIpo} right={<GainChip value={ipo.listingGain} />} />
            ))}
            {board && !recentListings.length && <p className="p-4 text-ink-3 text-[14px]">No recent listings.</p>}
          </div>
        </div>
      </div>

    </div>
  );
}
