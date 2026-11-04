// Pill tabs. The active one is plain ink on canvas: colour is kept for the data, not the controls.

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
              active ? "bg-ink text-canvas" : "bg-surface text-ink-2 border border-line hover:text-ink"
            }`}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className={`min-w-5 h-5 px-1.5 grid place-items-center rounded-full text-[11px] ${active ? "bg-canvas/20" : "bg-raised"}`}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
