import { useId, useMemo, useRef, useState } from "react";
import { displayName } from "../../shared/lib/names.js";
import { ipoKey, useAllotment } from "./allotment.controller.jsx";

export function IpoPicker() {
  const { ipos, loading, loadError, selected, select } = useAllotment();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    const list = q
      ? ipos.filter(i => displayName(i.name).toUpperCase().includes(q) || (i.registrar || "").toUpperCase().includes(q))
      : ipos;
    return list.slice(0, 40);
  }, [ipos, query]);

  const choose = ipo => {
    select(ipo);
    setQuery("");
    setEditing(false);
  };

  const onKey = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && matches[active]) { e.preventDefault(); choose(matches[active]); }
    else if (e.key === "Escape" && selected) { setEditing(false); setQuery(""); }
  };

  if (selected && !editing) {
    return (
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[20px] leading-7 font-medium">{displayName(selected.name)}</p>
          <p className="text-[13px] text-ink-3 mt-0.5">{selected.registrar || selected.source}</p>
        </div>
        <button
          onClick={() => { setEditing(true); setActive(0); requestAnimationFrame(() => input.current?.focus()); }}
          className="shrink-0 text-[14px] text-ink-2 hover:text-ink pt-1"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={input}
        role="combobox"
        aria-expanded={!loading}
        aria-controls={listId}
        aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
        aria-label="Search IPOs"
        value={query}
        onChange={e => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={onKey}
        placeholder={loading ? "Loading IPOs…" : "Search IPO or registrar"}
        disabled={loading}
        autoComplete="off"
        spellCheck="false"
        className="w-full h-12 px-4 rounded-lg bg-raised text-[15px] placeholder:text-ink-3 outline-none focus:ring-1 focus:ring-ink-3"
      />
      {loadError && <p className="mt-3 text-[14px] text-ink-2">{loadError}</p>}
      {!loading && !loadError && (
        <ul id={listId} role="listbox" aria-label="IPOs" className="mt-2 -mx-3 max-h-[340px] overflow-y-auto">
          {matches.length === 0 && <li className="px-3 py-3 text-ink-3">No match</li>}
          {matches.map((ipo, i) => (
            <li
              key={ipoKey(ipo)}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => { e.preventDefault(); choose(ipo); }}
              className={`flex items-baseline justify-between gap-4 px-3 py-2.5 rounded-lg cursor-pointer ${i === active ? "bg-raised" : ""}`}
            >
              <span className="truncate">{displayName(ipo.name)}</span>
              <span className="shrink-0 text-[13px] text-ink-3">{ipo.registrar || ipo.source}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
