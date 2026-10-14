import { useId, useMemo, useRef, useState } from "react";
import { CompanyLogo, Icon } from "../../shared/ui/index.js";
import { displayName } from "../../shared/lib/names.js";
import { ipoKey, useAllotment } from "./allotment.controller.jsx";

export function IpoPicker() {
  const { ipos, loading, loadError, selected, select } = useAllotment();
  const [query, setQuery] = useState("");
  const [registrar, setRegistrar] = useState("all");
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const listId = useId();

  const registrars = useMemo(() => {
    const counts = new Map();
    ipos.forEach(i => counts.set(i.source, { label: i.registrar || i.source, n: (counts.get(i.source)?.n || 0) + 1 }));
    return [...counts.entries()];
  }, [ipos]);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    return ipos
      .filter(i => registrar === "all" || i.source === registrar)
      .filter(i => !q || displayName(i.name).toUpperCase().includes(q) || (i.registrar || "").toUpperCase().includes(q))
      .slice(0, 60);
  }, [ipos, query, registrar]);

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
      <div className="flex items-center gap-3 rounded-2xl bg-brand-soft/60 ring-1 ring-brand/20 p-3.5">
        <CompanyLogo name={displayName(selected.name)} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[16px] leading-snug truncate">{displayName(selected.name)}</p>
          <p className="text-[12.5px] text-brand font-semibold">{selected.registrar || selected.source}</p>
        </div>
        <button
          onClick={() => { setEditing(true); setActive(0); requestAnimationFrame(() => input.current?.focus()); }}
          className="shrink-0 h-9 px-3.5 rounded-xl bg-surface ring-1 ring-line text-[13px] font-semibold hover:ring-brand"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-3 -mx-1 px-1">
        {[["all", { label: "All", n: ipos.length }], ...registrars].map(([id, r]) => (
          <button
            key={id}
            onClick={() => { setRegistrar(id); setActive(0); }}
            className={`shrink-0 h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors ${registrar === id ? "bg-ink text-canvas" : "bg-raised text-ink-2 hover:text-ink"}`}
          >
            {r.label} <span className="opacity-60">{r.n}</span>
          </button>
        ))}
      </div>
      <div className="relative">
        <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-ink-3" />
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
          className="w-full h-12 pl-10 pr-4 rounded-2xl bg-raised text-[15px] placeholder:text-ink-3 outline-none focus:ring-2 focus:ring-brand"
        />
      </div>
      {loadError && <p className="mt-3 text-[14px] text-loss">{loadError}</p>}
      {!loading && !loadError && (
        <ul id={listId} role="listbox" aria-label="IPOs" className="mt-2 max-h-[320px] overflow-y-auto space-y-1">
          {matches.length === 0 && <li className="px-3 py-3 text-ink-3">No match</li>}
          {matches.map((ipo, i) => (
            <li
              key={ipoKey(ipo)}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => { e.preventDefault(); choose(ipo); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer ${i === active ? "bg-brand-soft" : ""}`}
            >
              <CompanyLogo name={displayName(ipo.name)} size={32} className="rounded-xl!" />
              <span className="flex-1 truncate font-medium text-[14px]">{displayName(ipo.name)}</span>
              <span className="shrink-0 text-[11.5px] font-semibold text-ink-3 bg-raised rounded-full px-2 h-6 grid place-items-center">{ipo.registrar || ipo.source}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
