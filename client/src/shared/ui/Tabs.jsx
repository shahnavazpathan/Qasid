// Pill tabs. `tone` per item tints the active pill with that stage's colour.
const ACTIVE = {
  brand: "bg-brand text-on-brand",
  open: "bg-open text-on-brand",
  upcoming: "bg-upcoming text-on-brand",
  closed: "bg-closed text-on-brand",
  listed: "bg-listed text-on-brand",
  sme: "bg-sme text-on-brand",
  ink: "bg-ink text-canvas"
};

export function Tabs({ items, value, onChange, label, size = "md", className = "" }) {
  const sizing = size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-10 px-4 text-[14px]";
  return (
    <div role="tablist" aria-label={label} className={`flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 ${className}`}>
      {items.map(item => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`${sizing} shrink-0 inline-flex items-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all ${
              active ? `${ACTIVE[item.tone || "ink"]} shadow-card` : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink hover:ring-ink-3"
            }`}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className={`min-w-5 h-5 px-1.5 grid place-items-center rounded-full text-[11px] ${active ? "bg-white/25" : "bg-raised"}`}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
