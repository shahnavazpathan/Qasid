import { CompanyLogo, GainChip, Icon, Sparkline, StageChip, SubChip, TypeChip } from "../../shared/ui/index.js";
import { date, num, priceBand, rupees } from "../../shared/lib/format.js";
import { countdown, estimate, minInvestment, STAGES } from "../../shared/lib/ipo.js";
import { useAlerts } from "../alerts/alerts.controller.jsx";
import { ipoId } from "./market.controller.jsx";

function Stat({ label, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[12px] text-ink-3">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold tabular-nums truncate">{children}</p>
    </div>
  );
}

export function GmpBlock({ ipo, compact = false }) {
  const e = estimate(ipo);
  if (!e) return <span className="text-[13px] text-ink-3">GMP —</span>;
  const tone = e.gmp > 0 ? "text-gain" : e.gmp < 0 ? "text-loss" : "text-ink-3";
  const trend = (ipo.gmpTrend || []).map(p => p.gmp);
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-[12px] text-ink-3">GMP</p>
        <p className={`text-[16px] font-bold leading-tight tabular-nums ${tone}`}>
          {e.gmp > 0 ? "+" : ""}₹{num(e.gmp)} <span className="text-[13px] font-bold">({e.pct > 0 ? "+" : ""}{e.pct.toFixed(1)}%)</span>
        </p>
        {!compact && <p className="text-[12px] text-ink-3">≈ {rupees(e.price)}{e.perLot ? ` · ${e.perLot >= 0 ? "+" : "−"}₹${num(Math.abs(e.perLot))}/lot` : ""}</p>}
      </div>
      {!compact && trend.length > 1 && <Sparkline values={trend} className={tone} />}
    </div>
  );
}

export function IpoCard({ ipo, allotment, onOpen, onCheck }) {
  const { isWatched, toggleWatch } = useAlerts();
  const watched = isWatched(ipo.name);
  const stage = STAGES[ipo.status];
  const when = countdown(ipo);
  const sub = ipo.subscription?.total;

  return (
    <article className="card group relative overflow-hidden transition-colors hover:border-ink-3/40">
      <button onClick={() => onOpen(ipo)} className="block w-full text-left p-4 pb-3" aria-label={`Open ${ipo.name}`}>
        <div className="flex items-start gap-3">
          <CompanyLogo name={ipo.name} src={ipo.logo} />
          <div className="min-w-0">
            <h3 className="font-bold text-[15.5px] leading-snug line-clamp-2">{ipo.name}</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StageChip status={ipo.status} />
              <TypeChip type={ipo.type} />
              {allotment && <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11.5px] font-semibold bg-gain-soft text-gain">Allotment out</span>}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {ipo.status === "listed" ? (
            <>
              <Stat label="Issue">{rupees(ipo.issuePrice || ipo.priceMax)}</Stat>
              <Stat label="Listed at">{ipo.listingPrice ? rupees(ipo.listingPrice, 2) : "—"}</Stat>
              <Stat label="Listed on">{date(ipo.listingDate)}</Stat>
            </>
          ) : (
            <>
              <Stat label="Price">{priceBand(ipo)}</Stat>
              <Stat label="Lot">{ipo.lotSize ? `${num(ipo.lotSize)} sh` : "—"}</Stat>
              <Stat label="Min ₹">{minInvestment(ipo) ? `₹${num(minInvestment(ipo))}` : "—"}</Stat>
            </>
          )}
        </div>

        <div className="mt-4">
          {ipo.status === "listed" ? (
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-3 font-medium">Listing gain</span>
              <GainChip value={ipo.listingGain} />
            </div>
          ) : (
            <GmpBlock ipo={ipo} />
          )}
        </div>

        {sub ? (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[12.5px] text-ink-3">Subscribed{ipo.applications ? ` · ${num(ipo.applications)} applications` : ""}</span>
            <SubChip times={sub} />
          </div>
        ) : null}
      </button>

      <div className="flex items-center gap-2 px-4 pb-3">
        <span className={`text-[13px] font-semibold ${stage?.text || "text-ink-3"}`}>
          {when || (ipo.status === "listed" ? `Listed ${date(ipo.listingDate)}` : "—")}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {(ipo.status === "open" || ipo.status === "upcoming") && !allotment && (
            <a
              href={`#/planner/${encodeURIComponent(ipoId(ipo))}`}
              aria-label={`Plan ${ipo.name} in the IPO planner`}
              className="h-9 px-3 inline-flex items-center rounded-lg text-[13px] font-semibold border border-line text-ink-2 hover:text-ink hover:bg-raised"
            >
              Plan
            </a>
          )}
          {allotment && (
            <button onClick={() => onCheck(allotment, ipo)} className="h-9 px-3 rounded-lg text-[13px] font-semibold brand-gradient text-white hover:brightness-110">
              Check allotment
            </button>
          )}
          <button
            onClick={() => toggleWatch(ipo.name)}
            aria-pressed={watched}
            aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
            className={`size-9 grid place-items-center rounded-lg transition-colors ${watched ? "text-[#f59e0b]" : "text-ink-3 hover:text-ink hover:bg-raised"}`}
          >
            <Icon name="star" filled={watched} className="size-4.5" />
          </button>
        </div>
      </div>
    </article>
  );
}
