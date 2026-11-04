import { useEffect, useState } from "react";
import { Button, Confetti, Icon, useToast } from "../../shared/ui/index.js";
import { date, num } from "../../shared/lib/format.js";
import { displayName, downloadCsv, normName } from "../../shared/lib/names.js";
import { initials, swatch } from "../../shared/lib/ipo.js";
import { usePans } from "../pans/pans.controller.jsx";
import { NOT_APPLIED } from "./allotment.controller.jsx";

const statusOf = r => {
  if (r.success) return Number(r.data.Allotted) > 0 ? "allotted" : "not-allotted";
  if (r.retired) return "closed";
  return r.error === NOT_APPLIED ? "not-applied" : "error";
};

const STATUS = {
  "allotted": { label: "Allotted", chip: "bg-gain text-on-brand", card: "ring-2 ring-gain/60 bg-gain-soft/40" },
  "not-allotted": { label: "Not allotted", chip: "bg-loss-soft text-loss", card: "" },
  "not-applied": { label: "Not applied", chip: "bg-raised text-ink-3", card: "" },
  "closed": { label: "Not saved", chip: "bg-raised text-ink-3", card: "" },
  "error": { label: "Retry", chip: "bg-closed-soft text-closed", card: "" }
};

const statusText = r => ({
  "allotted": `Allotted ${r.data?.Allotted} shares`,
  "not-allotted": "Not allotted",
  "not-applied": "Not applied",
  "closed": "Checker closed, no saved result",
  "error": r.error || "Unavailable"
})[statusOf(r)];

function Tile({ value, label, tone }) {
  return (
    <div className={`rounded-2xl px-3 py-3 text-center ${tone}`}>
      <p className="text-[24px] font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-[11.5px] font-semibold opacity-80">{label}</p>
    </div>
  );
}

export function Results({ ipo, results, summary, compact = false }) {
  const { labelFor } = usePans();
  const toast = useToast();
  const [party, setParty] = useState(summary.allotted > 0);
  useEffect(() => {
    if (!party) return;
    const t = setTimeout(() => setParty(false), 3500);
    return () => clearTimeout(t);
  }, [party]);

  const name = r => (r.success ? r.data.Name : labelFor(r.pan)) || "";

  const copy = () => {
    const text = [`${displayName(ipo.name)} – allotment`, ...results.map(r => `${r.pan}  ${statusText(r)}`), `${summary.allotted}/${summary.total} allotted · via Qasid`].join("\n");
    navigator.clipboard?.writeText(text).then(() => toast("Results copied", null, "success"), () => toast("Couldn't copy"));
  };
  const whatsapp = () => {
    const text = `${displayName(ipo.name)} IPO allotment: ${summary.allotted} of ${summary.total} PANs allotted${summary.shares ? ` (${summary.shares} shares)` : ""} 🎯`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const csv = () => downloadCsv(`${normName(ipo.name).replace(/ /g, "_") || "allotment"}.csv`, [
    ["PAN", "Name", "Status", "Applied", "Allotted"],
    ...results.map(r => [r.pan, name(r), statusText(r), r.success ? r.data.Applied || "" : "", r.success ? r.data.Allotted : ""])
  ]);

  return (
    <section aria-label="Results" className="animate-rise">
      {party && <Confetti />}
      <div className={`card p-5 ${summary.allotted ? "border-gain/50" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-ink-3">{displayName(ipo.name)}</p>
            <p className="text-[22px] font-extrabold leading-tight">
              {summary.allotted ? <>🎉 {summary.allotted} of {summary.total} allotted</> : summary.applied ? "No allotment this time" : results.every(r => r.retired) ? "No saved results" : "No applications found"}
            </p>
          </div>
          <div className="flex gap-1">
            <Button size="icon" onClick={copy} aria-label="Copy results"><Icon name="copy" className="size-4.5" /></Button>
            <Button size="icon" onClick={whatsapp} aria-label="Share on WhatsApp"><Icon name="share" className="size-4.5" /></Button>
            <Button size="icon" onClick={csv} aria-label="Download CSV"><Icon name="download" className="size-4.5" /></Button>
          </div>
        </div>
        {ipo.retired && (
          <p className="mt-3 rounded-xl bg-raised px-3 py-2.5 text-[13px] text-ink-2">
            The registrar has closed the checker for this IPO. Results shown are the ones Qasid saved while it was open.
          </p>
        )}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <Tile value={summary.total} label="Checked" tone="bg-raised" />
          <Tile value={summary.applied} label="Applied" tone="bg-upcoming-soft text-upcoming" />
          <Tile value={summary.allotted} label="Allotted" tone="bg-gain-soft text-gain" />
          <Tile value={num(summary.shares)} label="Shares" tone="bg-listed-soft text-listed" />
        </div>
      </div>

      <ul className={`mt-3 grid gap-2.5 ${compact ? "" : "sm:grid-cols-2"}`}>
        {results.map(r => {
          const s = statusOf(r);
          const label = name(r);
          return (
            <li key={r.pan} className={`card px-4 py-3.5 flex items-center gap-3 ${STATUS[s].card}`}>
              <span className="size-10 shrink-0 grid place-items-center rounded-xl text-white text-[13px] font-bold" style={{ background: swatch(r.pan) }}>
                {initials(label || r.pan)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[13.5px] font-medium tracking-wide">{r.pan}</p>
                <p className="text-[13px] text-ink-2 truncate">{label || "—"}</p>
                {r.archived && <p className="text-[11.5px] text-ink-3">Saved {date(r.savedAt, true)}</p>}
              </div>
              <div className="text-right shrink-0">
                <span className={`inline-flex h-7 items-center px-2.5 rounded-full text-[12px] font-bold ${STATUS[s].chip}`}>
                  {s === "allotted" ? `${num(r.data.Allotted)} shares` : s === "error" ? "Error" : STATUS[s].label}
                </span>
                {r.success && Number(r.data.Applied) > 0 && <p className="text-[11.5px] text-ink-3 mt-1">of {num(r.data.Applied)} applied</p>}
                {s === "closed" && <p className="text-[11.5px] text-ink-3 mt-1">Checker closed</p>}
                {s === "error" && <p className="text-[11.5px] text-ink-3 mt-1 max-w-[160px] truncate" title={r.error}>{r.error}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
