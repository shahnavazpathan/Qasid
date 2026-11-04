import { useCallback, useRef } from "react";
import { Empty, Icon, PageHeader, SearchField, SkeletonCards, SkeletonRows, Tabs } from "../../shared/ui/index.js";
import { useHotkey } from "../../shared/hooks/useHotkey.js";
import { clock } from "../../shared/lib/format.js";
import { useAllotment } from "../allotment/allotment.controller.jsx";
import { useAlerts } from "../alerts/alerts.controller.jsx";
import { useMarket } from "./market.controller.jsx";
import { IpoCard } from "./IpoCard.jsx";
import { FilingsList } from "./FilingsList.jsx";

const TYPES = [{ value: "all", label: "All" }, { value: "Mainboard", label: "Mainboard" }, { value: "SME", label: "SME", tone: "sme" }];
const SORT_OPTIONS = [
  ["default", "Smart order"], ["gmp", "Highest GMP %"], ["subscription", "Most subscribed"], ["size", "Biggest issue"], ["gain", "Best listing gain"]
];

export function LiveBadge() {
  const m = useMarket();
  if (!m.board) return null;
  return (
    <button onClick={m.refresh} disabled={m.refreshing} title="Refresh now" className="inline-flex items-center gap-1.5 h-8 px-2 rounded-lg text-ink-3 hover:text-ink text-[12.5px] font-medium">
      <span className="size-1.5 rounded-full bg-open" />
      {m.refreshing ? "Updating…" : `Updated ${clock(m.board.updatedAt)}`}
    </button>
  );
}

export function MarketView({ onOpenIpo, onCheckAllotment }) {
  const m = useMarket();
  const { findFor } = useAllotment();
  const { isWatched } = useAlerts();
  const search = useRef(null);
  useHotkey("/", useCallback(() => search.current?.focus(), []));

  const statusTabs = [
    { value: "open", label: "Open", count: m.counts.open, tone: "open" },
    { value: "upcoming", label: "Upcoming", count: m.counts.upcoming, tone: "upcoming" },
    { value: "closed", label: "Closed", count: m.counts.closed, tone: "closed" },
    { value: "listed", label: "Listed", count: m.counts.listed, tone: "listed" },
    { value: "watch", label: "Watchlist", icon: <Icon name="star" className="size-4" />, tone: "closed" },
    { value: "filed", label: "DRHP filed", tone: "brand" }
  ];
  const filed = m.status === "filed";
  const watch = m.status === "watch";
  const list = watch ? m.all.filter(i => isWatched(i.name)) : m.list;
  const error = filed ? m.filingsError : !m.board && m.error;

  return (
    <div>
      <PageHeader title="IPOs" description="Price band, GMP, subscription and allotment.">
        <LiveBadge />
      </PageHeader>

      <Tabs label="Status" items={statusTabs} value={m.status} onChange={m.setStatus} />

      <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        {!filed && <Tabs size="sm" label="Type" items={TYPES} value={m.type} onChange={m.setType} />}
        <div className="flex gap-2 sm:ml-auto">
          {!filed && (
            <label className="relative">
              <span className="sr-only">Sort</span>
              <select
                value={m.sort}
                onChange={e => m.setSort(e.target.value)}
                className="appearance-none h-10 pl-3.5 pr-9 rounded-lg bg-surface border border-line text-[13.5px] font-semibold outline-none focus:ring-2 focus:ring-brand"
              >
                {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <Icon name="chevronDown" className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
            </label>
          )}
          <SearchField ref={search} value={m.query} onChange={m.setQuery} placeholder="Search IPO" className="flex-1 sm:w-64" />
        </div>
      </div>

      <div className="mt-5 min-h-[50vh]">
        {m.loading ? (filed ? <SkeletonRows /> : <SkeletonCards />) :
          error ? <Empty icon="info" title="Couldn't load">{error}</Empty> :
          list.length === 0 ? (
            <Empty icon={watch ? "star" : "search"} title={watch ? "Your watchlist is empty" : m.query ? "No match" : "Nothing here right now"}>
              {watch ? "Tap ★ on any IPO to get alerts when it opens, closes, lists or its allotment comes out." : m.query ? "Try another name." : "Check the other tabs."}
            </Empty>
          ) :
          filed ? <FilingsList items={list} /> : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(ipo => (
                <IpoCard
                  key={`${ipo.name}-${ipo.symbol || ""}`}
                  ipo={ipo}
                  allotment={findFor(ipo.name)}
                  onOpen={onOpenIpo}
                  onCheck={onCheckAllotment}
                />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
