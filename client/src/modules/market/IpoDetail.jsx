import { useEffect, useMemo, useState } from "react";
import {
  Button, Chip, CompanyLogo, Icon, LineChart, LinkButton, StageChip, SubscriptionBars, Tabs, TypeChip, useToast
} from "../../shared/ui/index.js";
import { date, issueSize, num, priceBand, rupees } from "../../shared/lib/format.js";
import { countdown, estimate, issuePrice, lotTable, minInvestment, shareText, todayIso } from "../../shared/lib/ipo.js";
import { useAllotment } from "../allotment/allotment.controller.jsx";
import { QuickCheck } from "../allotment/QuickCheck.jsx";
import { useAlerts } from "../alerts/alerts.controller.jsx";
import { ipoId, useIpoDetail } from "./market.controller.jsx";
import { marketService } from "./market.service.js";

const BROKERS = [
  ["Zerodha", "https://kite.zerodha.com/"],
  ["Groww", "https://groww.in/ipo"],
  ["Upstox", "https://upstox.com/ipo/"],
  ["Angel One", "https://www.angelone.in/ipo"]
];

function Card({ title, icon, children, className = "" }) {
  return (
    <section className={`card p-5 ${className}`}>
      {title && (
        <h3 className="flex items-center gap-2 font-bold text-[15px] mb-4">
          {icon && <span className="size-7 grid place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={icon} className="size-4" /></span>}
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

function Fact({ label, value, accent }) {
  return (
    <div className="rounded-2xl bg-raised/70 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-0.5 font-bold text-[15px] ${accent || ""}`}>{value}</p>
    </div>
  );
}

function Timeline({ ipo }) {
  const steps = [
    ["Opens", ipo.openDate, "calendar"], ["Closes", ipo.closeDate, "clock"], ["Allotment", ipo.allotmentDate, "check"],
    ["Refunds", ipo.refundDate, "refresh"], ["Demat credit", ipo.creditDate, "layers"], ["Listing", ipo.listingDate, "trendUp"]
  ].filter(([, d]) => d);
  if (!steps.length) return null;
  const today = todayIso();
  const nextIdx = steps.findIndex(([, d]) => d >= today);

  return (
    <Card title="Timeline" icon="calendar">
      <ol className="relative">
        {steps.map(([label, d, icon], i) => {
          const done = nextIdx === -1 || i < nextIdx;
          const current = i === nextIdx;
          return (
            <li key={label} className="relative flex items-center gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 && <span className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${done ? "bg-open" : "bg-line"}`} />}
              <span className={`relative z-[1] size-8 grid place-items-center rounded-full ${done ? "bg-open text-on-brand" : current ? "brand-gradient text-white ring-4 ring-brand/20" : "bg-raised text-ink-3"}`}>
                <Icon name={done ? "check" : icon} className="size-4" />
              </span>
              <span className={`flex-1 font-semibold ${current ? "text-brand" : done ? "text-ink-2" : "text-ink"}`}>{label}</span>
              <span className={`text-[14px] font-bold ${current ? "text-brand" : "text-ink-2"}`}>{date(d, true)}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Overview({ ipo }) {
  const fresh = ipo.freshIssueCr || 0, ofs = ipo.ofsCr || 0;
  const total = fresh + ofs;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <Fact label="Price band" value={priceBand(ipo)} />
        <Fact label="Lot size" value={ipo.lotSize ? `${num(ipo.lotSize)} shares` : "—"} />
        <Fact label="Min. investment" value={minInvestment(ipo) ? rupees(minInvestment(ipo)) : "—"} />
        <Fact label="Issue size" value={issueSize(ipo)} />
        {ipo.faceValue ? <Fact label="Face value" value={`₹${ipo.faceValue}`} /> : null}
        {ipo.peRatio ? <Fact label="P/E" value={num(ipo.peRatio, 2)} /> : null}
        {ipo.exchange ? <Fact label="Listing at" value={ipo.exchange} /> : null}
        {ipo.applications ? <Fact label="Applications" value={num(ipo.applications)} accent="text-brand" /> : null}
        {ipo.listingPrice ? <Fact label="Listing price" value={rupees(ipo.listingPrice, 2)} /> : null}
        {ipo.listingGain !== null && ipo.listingGain !== undefined ? (
          <Fact label="Listing gain" value={`${ipo.listingGain > 0 ? "+" : ""}${Number(ipo.listingGain).toFixed(2)}%`} accent={ipo.listingGain >= 0 ? "text-gain" : "text-loss"} />
        ) : null}
      </div>

      <Timeline ipo={ipo} />

      {total > 0 && (
        <Card title="Issue structure" icon="layers">
          <div className="flex h-3 rounded-full overflow-hidden bg-raised">
            {fresh > 0 && <div className="bg-brand animate-grow" style={{ width: `${(fresh / total) * 100}%` }} />}
            {ofs > 0 && <div className="bg-sme animate-grow" style={{ width: `${(ofs / total) * 100}%` }} />}
          </div>
          <div className="mt-3 flex justify-between text-[13.5px]">
            <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-brand" />Fresh issue <b>₹{num(fresh, 2)} Cr</b></span>
            <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-sme" />Offer for sale <b>₹{num(ofs, 2)} Cr</b></span>
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">Fresh issue money goes to the company; offer-for-sale money goes to selling shareholders.</p>
        </Card>
      )}

      {(ipo.registrarName || ipo.leadManagers) && (
        <Card title="Intermediaries" icon="shield">
          {ipo.registrarName && <p className="text-[14px]"><span className="text-ink-3">Registrar · </span><b>{ipo.registrarName}</b></p>}
          {ipo.leadManagers && <p className="mt-2 text-[14px]"><span className="text-ink-3">Lead managers · </span>{ipo.leadManagers}</p>}
        </Card>
      )}
    </div>
  );
}

function useGmpHistory(ipo) {
  const [history, setHistory] = useState(null);
  useEffect(() => {
    if (!ipo.gmpPath) return;
    let live = true;
    marketService.gmpHistory(ipo.gmpPath).then(h => live && setHistory(h)).catch(() => {});
    return () => { live = false; };
  }, [ipo.gmpPath]);
  // Scraped day-wise history plus the board's own snapshots (fresher for today)
  return useMemo(() => {
    const byDate = new Map((history || []).map(p => [p.date, p.gmp]));
    for (const p of ipo.gmpTrend || []) byDate.set(p.date, p.gmp);
    return [...byDate.entries()].map(([d, gmp]) => ({ date: d, gmp })).sort((a, b) => a.date.localeCompare(b.date));
  }, [history, ipo.gmpTrend]);
}

function GmpTab({ ipo }) {
  const e = estimate(ipo);
  const series = useGmpHistory(ipo);
  if (!e) return <Card><p className="text-ink-3">No grey market premium reported for this IPO yet.</p></Card>;
  const tone = e.gmp > 0 ? "text-gain" : e.gmp < 0 ? "text-loss" : "text-ink-3";
  const lots = ipo.type === "SME" ? 2 : 1;
  const price = issuePrice(ipo);
  const points = series.map(p => ({ value: p.gmp, label: date(p.date) }));
  const high = series.length ? Math.max(...series.map(p => p.gmp)) : null;
  const low = series.length ? Math.min(...series.map(p => p.gmp)) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Fact label="Current GMP" value={`${e.gmp > 0 ? "+" : ""}₹${num(e.gmp)}`} accent={tone} />
        <Fact label="Expected gain" value={`${e.pct > 0 ? "+" : ""}${e.pct.toFixed(2)}%`} accent={tone} />
        <Fact label="Est. listing price" value={rupees(e.price)} />
        <Fact label={`Est. profit (${lots} lot${lots > 1 ? "s" : ""})`} value={e.perLot !== null ? `${e.perLot >= 0 ? "+" : "−"}₹${num(Math.abs(e.perLot * lots))}` : "—"} accent={tone} />
      </div>
      <Card title="GMP trend" icon="trendUp">
        {points.length > 1 ? (
          <>
            <LineChart points={points} format={v => `₹${v}`} className={tone} />
            <div className="mt-3 flex flex-wrap gap-2 text-[12.5px] font-semibold">
              <span className="h-7 px-2.5 rounded-full bg-gain-soft text-gain grid place-items-center">High ₹{num(high)}</span>
              <span className="h-7 px-2.5 rounded-full bg-loss-soft text-loss grid place-items-center">Low ₹{num(low)}</span>
              <span className="h-7 px-2.5 rounded-full bg-raised text-ink-2 grid place-items-center">{series.length} days tracked</span>
            </div>
          </>
        ) : (
          <p className="text-[14px] text-ink-3">{ipo.gmpPath ? "Loading GMP history…" : "Only today's GMP is available for this IPO so far."}</p>
        )}
        {ipo.gmpUpdated && <p className="mt-3 text-[12.5px] text-ink-3">Last GMP update {ipo.gmpUpdated}</p>}
      </Card>
      {series.length > 1 && (
        <Card title="Day-wise GMP" icon="calendar">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-ink-3 text-[11.5px] uppercase tracking-wide">
                <th className="text-left font-semibold pb-2">Date</th>
                <th className="text-right font-semibold pb-2">GMP</th>
                <th className="text-right font-semibold pb-2">Est. listing</th>
                <th className="text-right font-semibold pb-2">Change</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((p, i, arr) => {
                const prev = arr[i + 1];
                const diff = prev ? p.gmp - prev.gmp : null;
                return (
                  <tr key={p.date} className="border-t border-line">
                    <td className="py-2.5 font-semibold">{date(p.date, true)}</td>
                    <td className={`py-2.5 text-right font-bold ${p.gmp > 0 ? "text-gain" : p.gmp < 0 ? "text-loss" : ""}`}>₹{num(p.gmp, 2)}</td>
                    <td className="py-2.5 text-right">{price ? rupees(price + p.gmp) : "—"}</td>
                    <td className={`py-2.5 text-right font-semibold ${diff > 0 ? "text-gain" : diff < 0 ? "text-loss" : "text-ink-3"}`}>
                      {diff === null ? "—" : diff === 0 ? "0" : `${diff > 0 ? "▲" : "▼"} ${num(Math.abs(diff), 2)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <p className="flex gap-2 text-[12.5px] text-ink-3 px-1">
        <Icon name="info" className="size-4 shrink-0 mt-0.5" />
        GMP is an unofficial grey-market indicator and often changes before listing. It is not investment advice.
      </p>
    </div>
  );
}

function SubscriptionTab({ ipo, loading }) {
  const sub = ipo.subscription || {};
  const categories = sub.categories || [];
  const days = ipo.subscriptionByDay || [];
  const dayCols = ["QIB", "NII", "Retail"].filter(c => days.some(d => d[c] !== undefined));

  if (!categories.length && !sub.total) {
    return <Card><p className="text-ink-3">{loading ? "Loading live subscription…" : ipo.status === "upcoming" ? "Bidding hasn't started yet." : "Subscription data isn't available."}</p></Card>;
  }
  return (
    <div className="space-y-4">
      <div className="card p-5 hero-gradient text-ink">
        <p className="text-ink-3 text-[12px] font-semibold uppercase tracking-wide">Overall subscription</p>
        <p className="mt-1 text-[40px] leading-none font-extrabold">{sub.total ? `${Number(sub.total).toFixed(2)}x` : "—"}</p>
        <p className="mt-2 text-ink-2 text-[13px]">
          {ipo.applications ? `${num(ipo.applications)} applications · ` : ""}{sub.updatedAt ? `as of ${sub.updatedAt}` : "live"}
        </p>
      </div>
      {categories.length > 0 && (
        <Card title="By category" icon="chart">
          <SubscriptionBars categories={categories} />
        </Card>
      )}
      {days.length > 0 && (
        <Card title="Day-wise" icon="calendar">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-ink-3 text-[11.5px] uppercase tracking-wide">
                <th className="text-left font-semibold pb-2">Day</th>
                {dayCols.map(c => <th key={c} className="text-right font-semibold pb-2">{c}</th>)}
                <th className="text-right font-semibold pb-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-2.5 font-semibold">Day {i + 1} <span className="text-ink-3 font-normal">· {date(d.date)}</span></td>
                  {dayCols.map(c => <td key={c} className="py-2.5 text-right">{d[c] !== undefined ? `${Number(d[c]).toFixed(2)}x` : "—"}</td>)}
                  <td className="py-2.5 text-right font-bold text-brand">{Number(d.total).toFixed(2)}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function CalculatorTab({ ipo }) {
  const rows = lotTable(ipo);
  const price = issuePrice(ipo);
  const e = estimate(ipo);
  const [lots, setLots] = useState(ipo.type === "SME" ? 2 : 1);
  if (!rows.length) return <Card><p className="text-ink-3">Price and lot size aren't announced yet.</p></Card>;
  const shares = lots * ipo.lotSize;
  return (
    <div className="space-y-4">
      <Card title="Application size" icon="calculator">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-ink-3 text-[11.5px] uppercase tracking-wide">
              <th className="text-left font-semibold pb-2">Category</th>
              <th className="text-right font-semibold pb-2">Lots</th>
              <th className="text-right font-semibold pb-2">Shares</th>
              <th className="text-right font-semibold pb-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.category} className="border-t border-line">
                <td className="py-2.5 font-semibold">{r.category}</td>
                <td className="py-2.5 text-right">{r.lots}</td>
                <td className="py-2.5 text-right">{num(r.shares)}</td>
                <td className="py-2.5 text-right font-bold">₹{num(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Your application" icon="sparkles">
        <div className="flex items-center gap-3">
          <button onClick={() => setLots(l => Math.max(1, l - 1))} className="size-11 rounded-xl bg-raised text-[20px] font-bold" aria-label="Fewer lots">−</button>
          <div className="flex-1 text-center">
            <p className="text-[28px] font-extrabold leading-none">{lots}</p>
            <p className="text-[12px] text-ink-3 mt-1">lot{lots > 1 ? "s" : ""} · {num(shares)} shares</p>
          </div>
          <button onClick={() => setLots(l => l + 1)} className="size-11 rounded-xl bg-raised text-[20px] font-bold" aria-label="More lots">+</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Fact label="You pay (upper band)" value={`₹${num(shares * price)}`} />
          <Fact
            label="Est. profit at GMP"
            value={e ? `${e.gmp >= 0 ? "+" : "−"}₹${num(Math.abs(e.gmp * shares))}` : "—"}
            accent={e ? (e.gmp >= 0 ? "text-gain" : "text-loss") : ""}
          />
        </div>
      </Card>
    </div>
  );
}

function DocsTab({ ipo, detail }) {
  const docs = [...(detail?.documents || []), ...(ipo.documents || [])].filter((d, i, arr) => arr.findIndex(x => x.url === d.url) === i);
  const links = [
    ipo.sourceUrl && ["Chittorgarh page", ipo.sourceUrl],
    ipo.symbol && ["NSE issue page", `https://www.nseindia.com/market-data/issue-information?symbol=${ipo.symbol}&series=${ipo.type === "SME" ? "SME" : "EQ"}&type=Active`]
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      <Card title="Offer documents" icon="file">
        {docs.length ? (
          <ul className="space-y-2">
            {docs.map(d => (
              <li key={d.url}>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-3 bg-raised/70 hover:bg-raised font-semibold text-[14px]">
                  <Icon name="file" className="size-5 text-brand" />
                  <span className="flex-1">{d.label}</span>
                  <Icon name="arrowUpRight" className="size-4 text-ink-3" />
                </a>
              </li>
            ))}
          </ul>
        ) : <p className="text-ink-3 text-[14px]">No documents published yet.</p>}
      </Card>
      {links.length > 0 && (
        <Card title="More on this IPO" icon="arrowUpRight">
          <div className="flex flex-wrap gap-2">{links.map(([label, url]) => <LinkButton key={url} href={url}>{label} <Icon name="arrowUpRight" className="size-3.5" /></LinkButton>)}</div>
        </Card>
      )}
    </div>
  );
}

export function IpoDetail({ ipo: base, onCheckAllotment, onBack }) {
  const { detail, loading } = useIpoDetail(base);
  const { findFor } = useAllotment();
  const { isWatched, toggleWatch } = useAlerts();
  const toast = useToast();
  const ipo = useMemo(() => ({ ...base, ...(detail || {}), subscription: detail?.subscription || base.subscription }), [base, detail]);
  const allotment = findFor(ipo.name);
  const [tab, setTab] = useState(allotment ? "allotment" : "overview");
  const watched = isWatched(ipo.name);
  const e = estimate(ipo);

  const tabs = [
    { value: "overview", label: "Overview" },
    allotment && { value: "allotment", label: "Allotment", tone: "open" },
    { value: "gmp", label: "GMP", tone: "brand" },
    { value: "subscription", label: "Subscription", tone: "brand" },
    { value: "calc", label: "Calculator", tone: "brand" },
    { value: "docs", label: "Documents", tone: "brand" }
  ].filter(Boolean).map(t => ({ tone: "brand", ...t }));

  const share = async () => {
    const url = `${location.origin}${location.pathname}#/ipo/${encodeURIComponent(ipoId(ipo))}`;
    const text = shareText(ipo);
    try {
      if (navigator.share) await navigator.share({ title: `${ipo.name} IPO`, text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); toast("Link copied", null, "success"); }
    } catch {}
  };

  return (
    <article className="max-w-[920px] mx-auto">
      <button onClick={onBack} className="mb-4 -ml-1 h-9 px-2 inline-flex items-center gap-1.5 rounded-xl text-[14px] font-semibold text-ink-2 hover:text-ink hover:bg-raised">
        <Icon name="arrowRight" className="size-4 rotate-180" />Back
      </button>
      <header className="hero-gradient text-ink px-5 sm:px-8 pt-6 sm:pt-8 pb-6 rounded-[28px] ring-1 ring-brand/15">
        <div className="flex items-start gap-4">
          <CompanyLogo name={ipo.name} src={ipo.logo} size={64} className="ring-1 ring-line" />
          <div className="min-w-0">
            <h1 className="text-[24px] sm:text-[30px] leading-tight font-extrabold tracking-tight">{ipo.name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StageChip status={ipo.status} />
              <TypeChip type={ipo.type} />
              {ipo.symbol && <Chip className="bg-surface! text-ink-2!">{ipo.symbol}</Chip>}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl bg-surface/85 px-3 py-2.5">
            <p className="text-[10.5px] uppercase tracking-wide text-ink-3 font-semibold">Price</p>
            <p className="font-bold text-[14px]">{priceBand(ipo)}</p>
          </div>
          <div className="rounded-2xl bg-surface/85 px-3 py-2.5">
            <p className="text-[10.5px] uppercase tracking-wide text-ink-3 font-semibold">GMP</p>
            <p className="font-bold text-[14px]">{e ? `${e.gmp >= 0 ? "+" : ""}₹${num(e.gmp)} (${e.pct.toFixed(1)}%)` : "—"}</p>
          </div>
          <div className="rounded-2xl bg-surface/85 px-3 py-2.5">
            <p className="text-[10.5px] uppercase tracking-wide text-ink-3 font-semibold">Subscribed</p>
            <p className="font-bold text-[14px]">{ipo.subscription?.total ? `${Number(ipo.subscription.total).toFixed(2)}x` : "—"}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
            <Icon name="clock" className="size-4" />{countdown(ipo) || (ipo.listingDate ? `Listed ${date(ipo.listingDate, true)}` : "")}
          </span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => toggleWatch(ipo.name)} aria-pressed={watched} className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-xl text-[13px] font-bold ${watched ? "bg-brand text-on-brand" : "bg-surface/85 hover:bg-surface"}`}>
              <Icon name="star" filled={watched} className="size-4" />{watched ? "Watching" : "Watch"}
            </button>
            <button onClick={share} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl text-[13px] font-bold bg-surface/85 hover:bg-surface">
              <Icon name="share" className="size-4" />Share
            </button>
          </div>
        </div>
      </header>

      <div className="pt-6 pb-4">
        <Tabs items={tabs} value={tab} onChange={setTab} size="sm" label="IPO sections" className="mb-5" />

        {tab === "overview" && <Overview ipo={ipo} />}
        {tab === "allotment" && allotment && <QuickCheck ipo={allotment} onOpenFull={() => onCheckAllotment(allotment)} />}
        {tab === "gmp" && <GmpTab ipo={ipo} />}
        {tab === "subscription" && <SubscriptionTab ipo={ipo} loading={loading} />}
        {tab === "calc" && <CalculatorTab ipo={ipo} />}
        {tab === "docs" && <DocsTab ipo={ipo} detail={detail} />}

        {(ipo.status === "open" || ipo.status === "upcoming") && (
          <a href={`#/planner/${encodeURIComponent(ipoId(ipo))}`} className="mt-5 card p-4 flex items-center gap-3 active:bg-raised">
            <span className="size-11 shrink-0 grid place-items-center rounded-2xl bg-brand text-on-brand"><Icon name="calendar" className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-[15px]">Should you apply? See its priority score</span>
              <span className="block text-[13px] text-ink-3">Compare with overlapping IPOs and plan your budget</span>
            </span>
            <Icon name="chevronRight" className="size-5 text-ink-3 shrink-0" />
          </a>
        )}
        {(ipo.status === "open" || ipo.status === "upcoming") && (
          <div className="mt-3 card p-5">
            <p className="font-bold text-[15px]">Apply through your broker</p>
            <p className="text-[13px] text-ink-3 mt-0.5">UPI mandate via ASBA · bids close {ipo.closeDate ? date(ipo.closeDate, true) : "soon"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {BROKERS.map(([name, url]) => <LinkButton key={name} href={url}>{name} <Icon name="arrowUpRight" className="size-3.5" /></LinkButton>)}
            </div>
          </div>
        )}
        {!allotment && ipo.status !== "upcoming" && ipo.status !== "open" && (
          <Button variant="soft" className="mt-4 w-full" onClick={() => onCheckAllotment(null)}>
            <Icon name="check" className="size-4.5" />Go to allotment checker
          </Button>
        )}
      </div>
    </article>
  );
}
