import { useCallback, useRef, useState } from "react";
import { Empty, SearchField, Sheet, SkeletonRows, Tabs } from "../../shared/ui/index.js";
import { useHotkey } from "../../shared/hooks/useHotkey.js";
import { clock } from "../../shared/lib/format.js";
import { useAllotment } from "../allotment/index.js";
import { useMarket } from "./market.controller.jsx";
import { IpoTable } from "./IpoTable.jsx";
import { FilingsList } from "./FilingsList.jsx";
import { IpoDetail } from "./IpoDetail.jsx";

const TYPES = [{ value: "all", label: "All" }, { value: "Mainboard", label: "Mainboard" }, { value: "SME", label: "SME" }];

export function MarketView({ onGoToAllotment }) {
  const m = useMarket();
  const { select } = useAllotment();
  const [open, setOpen] = useState(null);
  const search = useRef(null);
  const close = useCallback(() => setOpen(null), []);
  useHotkey("/", useCallback(() => search.current?.focus(), []));

  const statusTabs = [
    { value: "open", label: "Open", count: m.counts.open },
    { value: "upcoming", label: "Upcoming", count: m.counts.upcoming },
    { value: "closed", label: "Closed", count: m.counts.closed },
    { value: "listed", label: "Listed", count: m.counts.listed },
    { value: "filed", label: "Filed" }
  ];
  const filed = m.status === "filed";
  const error = filed ? m.filingsError : !m.board && m.error;

  const checkAllotment = ipo => {
    select(ipo);
    setOpen(null);
    onGoToAllotment();
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-10">
        <h1 className="text-[28px] leading-9 font-medium tracking-tight">IPOs</h1>
        {m.board && (
          <button
            onClick={m.refresh}
            disabled={m.refreshing}
            title="Refresh"
            className="text-[13px] text-ink-3 hover:text-ink-2 disabled:opacity-60"
          >
            {m.refreshing ? "Updating…" : `Updated ${clock(m.board.updatedAt)}`}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <Tabs label="Status" items={statusTabs} value={m.status} onChange={m.setStatus} />
        <div className="flex items-center gap-6">
          {!filed && <Tabs size="sm" label="Type" items={TYPES} value={m.type} onChange={m.setType} />}
          <SearchField ref={search} value={m.query} onChange={m.setQuery} placeholder="Search" className="flex-1 lg:w-56" />
        </div>
      </div>

      <div className="mt-8 min-h-[50vh]">
        {m.loading ? <SkeletonRows /> :
          error ? <Empty>{error}</Empty> :
          m.list.length === 0 ? <Empty>{m.query ? "No match" : "Nothing here right now"}</Empty> :
          filed ? <FilingsList items={m.list} /> :
          <IpoTable status={m.status} items={m.list} onOpen={setOpen} />}
      </div>

      <Sheet open={!!open} onClose={close} label={open?.name}>
        {open && <IpoDetail ipo={open} onCheckAllotment={checkAllotment} />}
      </Sheet>
    </div>
  );
}
