import { forwardRef } from "react";

export const SearchField = forwardRef(function SearchField({ value, onChange, placeholder, className = "", ...props }, ref) {
  return (
    <div className={`relative ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3">
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        spellCheck="false"
        className="w-full h-10 pl-9 pr-3 rounded-lg bg-raised text-ink placeholder:text-ink-3 outline-none focus:ring-1 focus:ring-ink-3"
        {...props}
      />
    </div>
  );
});
