import { useState } from "react";
import { Button, Empty, Icon, useToast } from "../../shared/ui/index.js";
import { num } from "../../shared/lib/format.js";
import { useStoredState } from "../../shared/hooks/useStoredState.js";
import { AlertsSetup } from "../alerts/AlertsSetup.jsx";
import { usePans } from "./pans.controller.jsx";
import { maskPan, PanAdder, PanAvatar } from "./PanList.jsx";

const OUTCOME = {
  "allotted": "bg-gain-soft text-gain",
  "not-allotted": "bg-loss-soft text-loss",
  "not-applied": "bg-raised text-ink-3"
};

export function PansView() {
  const { pans, remove, history } = usePans();
  const toast = useToast();
  const [masked, setMasked] = useStoredState("maskPans", false);
  const [openPan, setOpenPan] = useState(null);

  const wins = Object.values(history).flat().filter(h => h.status === "allotted");
  const shares = wins.reduce((s, h) => s + h.shares, 0);

  const exportList = () => {
    const text = pans.map(p => [p.pan, p.nickname].filter(Boolean).join(" ")).join("\n");
    navigator.clipboard?.writeText(text).then(() => toast("PAN list copied - paste it on another device to import", null, "success"));
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[28px] sm:text-[32px] font-extrabold tracking-tight">Saved PANs</h1>
        <p className="text-ink-3 mt-1">Family and friends' PANs, kept privately in this browser.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4"><p className="text-[26px] font-extrabold text-brand">{pans.length}</p><p className="text-[12.5px] font-semibold text-ink-3">PANs saved</p></div>
            <div className="card p-4"><p className="text-[26px] font-extrabold text-gain">{wins.length}</p><p className="text-[12.5px] font-semibold text-ink-3">Allotments won</p></div>
            <div className="card p-4"><p className="text-[26px] font-extrabold text-listed">{num(shares)}</p><p className="text-[12.5px] font-semibold text-ink-3">Shares received</p></div>
          </div>

          <section className="card p-5">
            <h2 className="font-bold text-[16px] mb-3">Add PANs</h2>
            <PanAdder />
            <p className="mt-2 text-[12.5px] text-ink-3">Paste many at once, separated by commas or new lines. Add a nickname after a space.</p>
          </section>

          {pans.length === 0 ? (
            <Empty icon="users" title="No PANs yet">Add PANs above, then check any IPO's allotment for all of them in one tap.</Empty>
          ) : (
            <section className="card p-2 sm:p-3">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="font-bold text-[15px]">Your PANs</span>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => setMasked(!masked)}>{masked ? "Show" : "Mask"}</Button>
                  <Button size="sm" onClick={exportList}><Icon name="copy" className="size-4" />Export</Button>
                </div>
              </div>
              <ul>
                {pans.map(p => {
                  const past = history[p.pan] || [];
                  const won = past.filter(h => h.status === "allotted").length;
                  const expanded = openPan === p.pan;
                  return (
                    <li key={p.pan} className="rounded-2xl hover:bg-raised/50">
                      <div className="flex items-center gap-3 px-3 py-3">
                        <PanAvatar pan={p.pan} label={p.nickname || p.name} size={42} />
                        <button onClick={() => setOpenPan(expanded ? null : p.pan)} className="min-w-0 flex-1 text-left">
                          <p className="font-bold text-[15px] truncate">{p.nickname || p.name || "Unnamed"}</p>
                          <p className="text-[13px] text-ink-3 truncate">
                            <span className="font-mono tracking-wide">{masked ? maskPan(p.pan) : p.pan}</span>
                            {p.nickname && p.name ? ` · ${p.name}` : ""}
                          </p>
                        </button>
                        {past.length > 0 && (
                          <span className="hidden sm:inline-flex h-7 px-2.5 items-center rounded-full bg-gain-soft text-gain text-[12px] font-bold">{won}/{past.length} won</span>
                        )}
                        <button onClick={() => setOpenPan(expanded ? null : p.pan)} aria-label="Show history" className="size-9 grid place-items-center rounded-xl text-ink-3 hover:bg-raised">
                          <Icon name="chevronDown" className={`size-4.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </button>
                        <button
                          onClick={() => { const undo = remove(p.pan); toast(`Removed ${p.pan}`, { label: "Undo", run: undo }); }}
                          aria-label={`Remove ${p.pan}`}
                          className="size-9 grid place-items-center rounded-xl text-ink-3 hover:text-loss hover:bg-loss-soft"
                        >
                          <Icon name="trash" className="size-4.5" />
                        </button>
                      </div>
                      {expanded && (
                        <div className="px-4 pb-4 animate-fade">
                          {past.length === 0 ? <p className="text-[13px] text-ink-3 pl-[54px]">No checks yet.</p> : (
                            <ul className="pl-[54px] space-y-1.5">
                              {past.map(h => (
                                <li key={h.ipo} className="flex items-center justify-between gap-3 text-[13.5px]">
                                  <span className="truncate">{h.ipo}</span>
                                  <span className={`shrink-0 h-6 px-2 rounded-full text-[11.5px] font-bold grid place-items-center ${OUTCOME[h.status]}`}>
                                    {h.status === "allotted" ? `${h.shares} shares` : h.status === "not-allotted" ? "Not allotted" : "Not applied"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
        <AlertsSetup />
      </div>
    </div>
  );
}
