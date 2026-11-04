import { useState } from "react";
import { Icon, useToast } from "../../shared/ui/index.js";
import { initials, swatch } from "../../shared/lib/ipo.js";
import { usePans } from "./pans.controller.jsx";

export const maskPan = pan => `${pan.slice(0, 5)}••••${pan.slice(-1)}`;

function Check({ on }) {
  return (
    <span aria-hidden="true" className={`size-5 shrink-0 grid place-items-center rounded-md transition-colors ${on ? "bg-brand text-on-brand" : "ring-2 ring-line"}`}>
      {on && <Icon name="check" className="size-3.5" strokeWidth={2.4} />}
    </span>
  );
}

export function PanAvatar({ pan, label, size = 36 }) {
  return (
    <span style={{ width: size, height: size, background: swatch(pan) }} className="shrink-0 grid place-items-center rounded-xl text-white text-[12px] font-bold">
      {initials(label || pan)}
    </span>
  );
}

export function PanAdder({ compact = false }) {
  const { add, pans } = usePans();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const submit = e => {
    e.preventDefault();
    if (!draft.trim()) return;
    const { invalid, added } = add(draft);
    setError(invalid.length ? `${invalid.join(", ")} — a PAN looks like ABCDE1234F` : "");
    setDraft(invalid.join(", "));
    if (added) toast(`Saved ${added} PAN${added > 1 ? "s" : ""}`, null, "success");
  };

  return (
    <form onSubmit={submit}>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={e => { setDraft(e.target.value); setError(""); }}
          placeholder={pans.length ? "Add PAN (optional nickname: ABCDE1234F Mom)" : "Enter PAN, e.g. ABCDE1234F"}
          aria-label="Add PAN"
          aria-invalid={!!error}
          autoComplete="off"
          spellCheck="false"
          autoCapitalize="characters"
          className={`flex-1 min-w-0 ${compact ? "h-11" : "h-12"} px-4 rounded-2xl bg-raised font-mono text-[14px] uppercase placeholder:normal-case placeholder:font-sans placeholder:text-ink-3 outline-none focus:ring-2 focus:ring-brand`}
        />
        <button type="submit" disabled={!draft.trim()} className={`${compact ? "h-11" : "h-12"} px-4 rounded-2xl bg-brand-soft text-brand font-bold inline-flex items-center gap-1.5 disabled:opacity-40`}>
          <Icon name="plus" className="size-4.5" />Add
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-loss">{error}</p>}
    </form>
  );
}

export function PanList() {
  const { pans, selected, remove, toggle, selectAll } = usePans();
  const toast = useToast();
  const allOn = pans.length > 0 && selected.length === pans.length;

  const onRemove = pan => {
    const undo = remove(pan);
    toast(`Removed ${pan}`, { label: "Undo", run: undo });
  };

  return (
    <div>
      {pans.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-semibold text-ink-3">{selected.length} of {pans.length} selected</span>
            <button onClick={() => selectAll(!allOn)} className="text-[13px] font-bold text-brand hover:underline">
              {allOn ? "Clear all" : "Select all"}
            </button>
          </div>
          <ul className="grid sm:grid-cols-2 gap-2 mb-3 max-h-[360px] overflow-y-auto">
            {pans.map(p => {
              const on = selected.includes(p.pan);
              const label = [p.nickname, p.name].filter(Boolean).join(" · ");
              return (
                <li key={p.pan} className={`group flex items-center rounded-2xl transition-colors ${on ? "bg-brand-soft/70 ring-1 ring-brand/25" : "bg-raised/60"}`}>
                  <button role="checkbox" aria-checked={on} onClick={() => toggle(p.pan)} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left">
                    <Check on={on} />
                    <PanAvatar pan={p.pan} label={p.nickname || p.name} size={32} />
                    <span className="min-w-0">
                      <span className={`block font-mono text-[13px] tracking-wide ${on ? "text-ink" : "text-ink-3"}`}>{p.pan}</span>
                      <span className="block truncate text-[12px] text-ink-2">{label || "Name appears after first check"}</span>
                    </span>
                  </button>
                  <button
                    onClick={() => onRemove(p.pan)}
                    aria-label={`Remove ${p.pan}`}
                    className="size-9 mr-1 grid place-items-center rounded-xl text-ink-3 hover:text-loss sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                  >
                    <Icon name="close" className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <PanAdder compact />
    </div>
  );
}
