// Page title, an optional one-line description, and optional actions on the right
export function PageHeader({ title, description, children }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight leading-tight text-balance">{title}</h1>
        {description && <p className="mt-1 max-w-xl text-[14px] text-ink-2">{description}</p>}
      </div>
      {children}
    </header>
  );
}

// Section title with an optional link on the right
export function SectionTitle({ title, action, onAction, className = "" }) {
  return (
    <div className={`mb-3 mt-10 flex items-baseline justify-between gap-3 ${className}`}>
      <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
      {action && <button onClick={onAction} className="text-[13.5px] font-semibold text-ink-2 hover:text-ink">{action}</button>}
    </div>
  );
}
