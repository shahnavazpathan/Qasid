// Text tabs; selection shown with ink weight and an underline, never color.
export function Tabs({ items, value, onChange, label, size = "md" }) {
  const text = size === "sm" ? "text-[13px]" : "text-[15px]";
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 sm:mx-0 sm:px-0">
      {items.map(item => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`${text} relative shrink-0 py-2 whitespace-nowrap transition-colors ${active ? "text-ink font-medium" : "text-ink-3 hover:text-ink-2"}`}
          >
            {item.label}
            {item.count !== undefined && <span className="ml-1.5 text-ink-3 font-normal">{item.count}</span>}
            <span className={`absolute left-0 right-0 -bottom-px h-px bg-ink transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
          </button>
        );
      })}
    </div>
  );
}
