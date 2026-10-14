import { useAllotment } from "../allotment/index.js";
import { COLUMNS } from "./columns.js";

const GRID = "sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(4,112px)] sm:gap-x-6 sm:items-baseline";

export function IpoTable({ status, items, onOpen }) {
  const { findFor } = useAllotment();
  const cols = COLUMNS[status];
  const last = cols[cols.length - 1];

  return (
    <div role="table" aria-label="IPOs">
      <div role="row" className={`hidden ${GRID} px-3 pb-3`}>
        <span role="columnheader" className="label">Company</span>
        {cols.map(c => <span key={c.label} role="columnheader" className="label text-right">{c.label}</span>)}
      </div>

      {items.map(ipo => {
        const allotment = findFor(ipo.name);
        return (
          <button
            key={`${ipo.name}-${ipo.symbol || ""}`}
            role="row"
            onClick={() => onOpen(ipo)}
            className={`w-[calc(100%+1.5rem)] sm:w-full text-left -mx-3 px-3 sm:mx-0 py-4 rounded-lg hover:bg-raised transition-colors ${GRID} flex items-baseline gap-4`}
          >
            <span role="cell" className="min-w-0 flex-1">
              <span className="block truncate font-medium">{ipo.name}</span>
              <span className="block text-[13px] text-ink-3 mt-0.5">
                {ipo.type === "SME" ? "SME" : "Mainboard"}
                {allotment && <span className="text-ink-2"> · Allotment out</span>}
                <span className="sm:hidden"> · {cols[0].value(ipo)} · {cols[1].label} {cols[1].value(ipo)}</span>
              </span>
            </span>
            {cols.map(c => (
              <span key={c.label} role="cell" className="hidden sm:block text-right text-[14px] text-ink-2">{c.value(ipo)}</span>
            ))}
            <span className="sm:hidden shrink-0 text-right text-[14px] text-ink-2">
              <span className="block text-[11px] uppercase tracking-wider text-ink-3">{last.label}</span>
              {last.value(ipo)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
