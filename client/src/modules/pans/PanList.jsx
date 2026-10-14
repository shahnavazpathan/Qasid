import { useState } from "react";
import { useToast } from "../../shared/ui/index.js";
import { usePans } from "./pans.controller.jsx";

function Check({ on }) {
  return (
    <span aria-hidden="true" className={`size-[18px] shrink-0 grid place-items-center rounded-[5px] border transition-colors ${on ? "bg-ink border-ink text-canvas" : "border-ink-3"}`}>
      {on && (
        <svg viewBox="0 0 12 12" className="size-3">
          <path d="m2.5 6.2 2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export function PanList() {
  const { pans, selected, add, remove, toggle, selectAll } = usePans();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const allOn = pans.length > 0 && selected.length === pans.length;

  const submit = e => {
    e.preventDefault();
    if (!draft.trim()) return;
    const { invalid } = add(draft);
    setError(invalid.length ? `${invalid.join(", ")} — a PAN looks like ABCDE1234F` : "");
    setDraft(invalid.join(", "));
  };

  const onRemove = pan => {
    const undo = remove(pan);
    toast(`Removed ${pan}`, { label: "Undo", run: undo });
  };

  return (
    <div>
      {pans.length > 0 && (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[13px] text-ink-3">{selected.length} of {pans.length} selected</span>
            <button onClick={() => selectAll(!allOn)} className="text-[13px] text-ink-2 hover:text-ink">
              {allOn ? "Clear" : "Select all"}
            </button>
          </div>
          <ul className="-mx-3">
            {pans.map(p => {
              const on = selected.includes(p.pan);
              const label = [p.nickname, p.name].filter(Boolean).join(" · ");
              return (
                <li key={p.pan} className="group flex items-center rounded-lg hover:bg-raised">
                  <button
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(p.pan)}
                    className="flex-1 min-w-0 flex items-center gap-4 px-3 py-3 text-left"
                  >
                    <Check on={on} />
                    <span className={`font-mono text-[14px] tracking-wide ${on ? "text-ink" : "text-ink-3"}`}>{p.pan}</span>
                    <span className="truncate text-[14px] text-ink-2">{label}</span>
                  </button>
                  <button
                    onClick={() => onRemove(p.pan)}
                    aria-label={`Remove ${p.pan}`}
                    className="size-10 mr-1 grid place-items-center rounded-md text-ink-3 hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                  >
                    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
                      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <form onSubmit={submit} className={pans.length ? "mt-3" : ""}>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={e => { setDraft(e.target.value); setError(""); }}
            placeholder={pans.length ? "Add another PAN" : "Enter PAN, e.g. ABCDE1234F"}
            aria-label="Add PAN"
            aria-invalid={!!error}
            autoComplete="off"
            spellCheck="false"
            autoCapitalize="characters"
            className="flex-1 min-w-0 h-11 px-3 rounded-lg bg-raised font-mono text-[14px] uppercase placeholder:normal-case placeholder:font-sans placeholder:text-ink-3 outline-none focus:ring-1 focus:ring-ink-3"
          />
          <button type="submit" disabled={!draft.trim()} className="h-11 px-4 rounded-lg text-ink-2 hover:text-ink hover:bg-raised disabled:opacity-40">
            Add
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-[13px] text-ink-2">{error}</p>}
      </form>
    </div>
  );
}
