import { forwardRef } from "react";
import { Icon } from "./Icon.jsx";

export const SearchField = forwardRef(function SearchField({ value, onChange, placeholder, className = "", ...props }, ref) {
  return (
    <div className={`relative ${className}`}>
      <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-ink-3 pointer-events-none" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        spellCheck="false"
        className="w-full h-11 pl-10 pr-10 rounded-2xl bg-surface ring-1 ring-line text-ink placeholder:text-ink-3 outline-none focus:ring-2 focus:ring-brand transition-shadow"
        {...props}
      />
      {value ? (
        <button onClick={() => onChange("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-full text-ink-3 hover:bg-raised">
          <Icon name="close" className="size-3.5" />
        </button>
      ) : (
        <kbd className="hidden sm:grid absolute right-3 top-1/2 -translate-y-1/2 size-6 place-items-center rounded-md ring-1 ring-line text-[11px] text-ink-3 font-sans">/</kbd>
      )}
    </div>
  );
});
