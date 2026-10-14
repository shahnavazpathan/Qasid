import { Button, useToast } from "../../shared/ui/index.js";
import { num } from "../../shared/lib/format.js";
import { displayName, downloadCsv, normName } from "../../shared/lib/names.js";
import { usePans } from "../pans/index.js";
import { NOT_APPLIED } from "./allotment.controller.jsx";

const statusOf = r => {
  if (r.success) return Number(r.data.Allotted) > 0 ? "allotted" : "not-allotted";
  return r.error === NOT_APPLIED ? "not-applied" : "error";
};

const statusText = r => ({
  "allotted": `Allotted ${r.data?.Allotted}`,
  "not-allotted": "Not allotted",
  "not-applied": "Not applied",
  "error": r.error || "Unavailable"
})[statusOf(r)];

function Outcome({ r }) {
  const s = statusOf(r);
  if (s === "allotted") return <span className="font-medium text-ink">{num(r.data.Allotted)} shares</span>;
  if (s === "not-allotted") return <span className="text-ink-2">Not allotted</span>;
  return <span className="text-ink-3">{statusText(r)}</span>;
}

export function Results({ ipo, results, summary }) {
  const { labelFor } = usePans();
  const toast = useToast();
  const name = r => (r.success ? r.data.Name : labelFor(r.pan)) || "";

  const copy = () => {
    const text = [displayName(ipo.name), ...results.map(r => `${r.pan}  ${statusText(r)}`)].join("\n");
    navigator.clipboard?.writeText(text).then(() => toast("Copied"), () => toast("Couldn't copy"));
  };

  const csv = () => downloadCsv(`${normName(ipo.name).replace(/ /g, "_") || "allotment"}.csv`, [
    ["PAN", "Name", "Status", "Applied", "Allotted"],
    ...results.map(r => [r.pan, name(r), statusText(r), r.success ? r.data.Applied || "" : "", r.success ? r.data.Allotted : ""])
  ]);

  return (
    <section aria-label="Results" className="animate-fade">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-[28px] leading-9 font-medium tracking-tight">
            {summary.allotted} <span className="text-ink-3 font-normal">of {summary.total} allotted</span>
          </p>
          {summary.shares > 0 && <p className="text-ink-2 mt-1">{num(summary.shares)} shares</p>}
        </div>
        <div className="flex gap-4 shrink-0">
          <Button onClick={copy}>Copy</Button>
          <Button onClick={csv}>CSV</Button>
        </div>
      </div>

      <ul className="mt-8">
        {results.map(r => (
          <li key={r.pan} className="py-4 grid grid-cols-[1fr_auto] gap-x-6 items-baseline">
            <div className="min-w-0">
              <span className="font-mono text-[14px] tracking-wide">{r.pan}</span>
              {name(r) && <p className="text-[14px] text-ink-2 truncate">{name(r)}</p>}
            </div>
            <div className="text-right text-[15px]">
              <Outcome r={r} />
              {r.success && Number(r.data.Applied) > 0 && <p className="text-[13px] text-ink-3">of {num(r.data.Applied)} applied</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
