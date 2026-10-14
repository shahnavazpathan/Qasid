import { date } from "../../shared/lib/format.js";

export function FilingsList({ items }) {
  return (
    <ul>
      {items.map(f => (
        <li key={f.url}>
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="-mx-3 px-3 py-4 flex items-baseline gap-6 rounded-lg hover:bg-raised transition-colors"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{f.name}</span>
              <span className="block text-[13px] text-ink-3 mt-0.5">{f.kind}</span>
            </span>
            <span className="shrink-0 text-[14px] text-ink-2">{date(f.filedDate, true)}</span>
            <span aria-hidden="true" className="shrink-0 text-ink-3">↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
