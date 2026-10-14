import { useMemo, useState } from "react";
import { Button, CompanyLogo, GainChip, Icon, SkeletonCards } from "../../shared/ui/index.js";
import { date, num } from "../../shared/lib/format.js";
import { displayName } from "../../shared/lib/names.js";
import { estimate } from "../../shared/lib/ipo.js";
import { useMarket } from "../market/market.controller.jsx";
import { IpoCard, LiveBadge } from "../market/index.js";
import { ipoKey, useAllotment } from "../allotment/allotment.controller.jsx";
import { QuickCheck } from "../allotment/QuickCheck.jsx";

function StatTile({ label, value, icon, tone, onClick }) {
  return (
    <button onClick={onClick} className="text-left rounded-2xl bg-white/12 hover:bg-white/20 transition-colors p-3.5 backdrop-blur-sm">
      <span className={`size-8 grid place-items-center rounded-xl ${tone}`}><Icon name={icon} className="size-4.5" /></span>
      <p className="mt-2.5 text-[26px] font-extrabold leading-none">{value ?? "–"}</p>
      <p className="mt-1 text-[12px] font-semibold text-white/80">{label}</p>
    </button>
  );
}

function SectionHead({ title, icon, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-9">
      <h2 className="flex items-center gap-2 text-[19px] font-extrabold tracking-tight">
        <span className="size-8 grid place-items-center rounded-xl bg-brand-soft text-brand"><Icon name={icon} className="size-4.5" /></span>
        {title}
      </h2>
      {action && <button onClick={onAction} className="text-[13.5px] font-bold text-brand hover:underline inline-flex items-center gap-1">{action}<Icon name="arrowRight" className="size-4" /></button>}
    </div>
  );
}

function Row({ ipo, right, onOpen }) {
  return (
    <button onClick={() => onOpen(ipo)} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-raised/70 text-left">
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
            className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${ipoKey(i) === ipoKey(current) ? "bg-open text-on-brand" : "bg-surface ring-1 ring-line text-ink-2 hover:text-ink"}`}
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
  const maxGain = Math.max(1, ...recentListings.map(i => Math.abs(i.listingGain)));
  const events = [
    ...m.today.opening.map(i => ["Opens today", i, "text-upcoming bg-upcoming-soft"]),
    ...m.today.closing.map(i => ["Closes today", i, "text-closed bg-closed-soft"]),
    ...m.today.allotment.map(i => ["Allotment today", i, "text-open bg-open-soft"]),
    ...m.today.listing.map(i => ["Lists today", i, "text-listed bg-listed-soft"])
  ];

  return (
    <div>
      <section className="hero-gradient text-white rounded-[28px] p-5 sm:p-8 shadow-pop relative overflow-hidden">
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-white/80 font-semibold text-[13px]">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1 className="mt-1 text-[28px] sm:text-[36px] leading-tight font-extrabold tracking-tight">Today's IPO market</h1>
            <p className="mt-1 text-white/80 max-w-md">Live GMP, subscription and allotment status for every mainboard and SME IPO.</p>
          </div>
          <div className="[&>button]:bg-white/15 [&>button]:text-white"><LiveBadge /></div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <StatTile label="Open now" value={m.counts.open} icon="bolt" tone="bg-open text-on-brand" onClick={() => onBrowse("open")} />
          <StatTile label="Closing today" value={board ? m.today.closing.length : null} icon="clock" tone="bg-closed text-on-brand" onClick={() => onBrowse("open")} />
          <StatTile label="Upcoming" value={m.counts.upcoming} icon="calendar" tone="bg-upcoming text-on-brand" onClick={() => onBrowse("upcoming")} />
          <StatTile label="Allotment today" value={board ? m.today.allotment.length : null} icon="check" tone="bg-gain text-on-brand" onClick={() => onBrowse("closed")} />
          <StatTile label="Listing today" value={board ? m.today.listing.length : null} icon="trendUp" tone="bg-listed text-on-brand" onClick={() => onBrowse("listed")} />
        </div>
      </section>

      {events.length > 0 && (
        <div className="mt-5 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {events.map(([label, ipo, tone]) => (
            <button key={label + ipo.name} onClick={() => onOpenIpo(ipo)} className="shrink-0 card flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-full!">
              <CompanyLogo name={ipo.name} src={ipo.logo} size={30} className="rounded-full!" />
              <span className="text-[13px] font-semibold max-w-[180px] truncate">{ipo.name}</span>
              <span className={`h-6 px-2 rounded-full text-[11.5px] font-bold grid place-items-center ${tone}`}>{label}</span>
            </button>
          ))}
        </div>
      )}

      <SectionHead title="Check allotment" icon="check" action="All IPOs" onAction={() => onCheckAllotment(null)} />
      <QuickAllotment />

      <SectionHead title="Open for bidding" icon="bolt" action="View all" onAction={() => onBrowse("open")} />
      {!board ? <SkeletonCards count={3} /> : board.open.length === 0 ? (
        <div className="card p-6 text-ink-3">No IPO is open right now — see what's <button onClick={() => onBrowse("upcoming")} className="text-brand font-bold">coming up</button>.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {board.open.slice(0, 6).map(ipo => (
            <IpoCard key={ipo.name} ipo={ipo} allotment={findFor(ipo.name)} onOpen={onOpenIpo} onCheck={onCheckAllotment} />
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div>
          <SectionHead title="Upcoming" icon="calendar" action="All" onAction={() => onBrowse("upcoming")} />
          <div className="card p-2">
            {(board?.upcoming || []).slice(0, 6).map(ipo => (
              <Row key={ipo.name} ipo={ipo} onOpen={onOpenIpo} right={
                <span className="text-right shrink-0">
                  <span className="block text-[12.5px] font-bold text-upcoming">{ipo.openDate ? date(ipo.openDate) : "TBA"}</span>
                  <span className="block text-[11.5px] text-ink-3">opens</span>
                </span>
              } />
            ))}
            {board && !board.upcoming.length && <p className="p-4 text-ink-3 text-[14px]">Nothing announced yet.</p>}
          </div>
        </div>

        <div>
          <SectionHead title="Top GMP" icon="fire" />
          <div className="card p-2">
            {topGmp.map((ipo, i) => {
              const e = estimate(ipo);
              return (
                <Row key={ipo.name} ipo={ipo} onOpen={onOpenIpo} right={
                  <span className="text-right shrink-0">
                    <span className={`block text-[14px] font-extrabold ${e.gmp >= 0 ? "text-gain" : "text-loss"}`}>{e.pct > 0 ? "+" : ""}{e.pct.toFixed(1)}%</span>
                    <span className="block text-[11.5px] text-ink-3">#{i + 1} · ₹{num(e.gmp)}</span>
                  </span>
                } />
              );
            })}
            {board && !topGmp.length && <p className="p-4 text-ink-3 text-[14px]">No GMP reported.</p>}
          </div>
        </div>

        <div>
          <SectionHead title="Recent listings" icon="trendUp" action="All" onAction={() => onBrowse("listed")} />
          <div className="card p-4 space-y-3">
            {recentListings.map(ipo => (
              <button key={ipo.name} onClick={() => onOpenIpo(ipo)} className="w-full text-left">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13.5px] font-semibold truncate">{ipo.name}</span>
                  <GainChip value={ipo.listingGain} />
                </div>
                <div className="h-2 rounded-full bg-raised overflow-hidden">
                  <div className={`h-full rounded-full animate-grow ${ipo.listingGain >= 0 ? "bg-gain" : "bg-loss"}`} style={{ width: `${Math.max(4, (Math.abs(ipo.listingGain) / maxGain) * 100)}%` }} />
                </div>
              </button>
            ))}
            {board && !recentListings.length && <p className="text-ink-3 text-[14px]">No recent listings.</p>}
          </div>
        </div>
      </div>

      <section className="mt-9 card p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5 overflow-hidden relative">
        <div className="absolute -left-10 -top-10 size-40 rounded-full bg-brand-soft" aria-hidden="true" />
        <span className="relative size-14 grid place-items-center rounded-2xl brand-gradient text-white"><Icon name="bell" className="size-7" /></span>
        <div className="relative flex-1">
          <p className="font-extrabold text-[18px]">Never miss an allotment</p>
          <p className="text-ink-3 text-[14px]">Watch an IPO with ★ and Qasid alerts you when it opens, closes and lists — and checks every saved PAN the moment allotment is out.</p>
        </div>
        <Button variant="primary" className="relative" onClick={() => onBrowse("open")}>Pick IPOs to watch</Button>
      </section>
    </div>
  );
}
