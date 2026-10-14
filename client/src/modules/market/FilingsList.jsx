import { CompanyLogo, Icon } from "../../shared/ui/index.js";
import { date } from "../../shared/lib/format.js";

const KIND_TONE = { DRHP: "bg-brand-soft text-brand", UDRHP: "bg-listed-soft text-listed", Addendum: "bg-closed-soft text-closed", RHP: "bg-open-soft text-open" };

export function FilingsList({ items }) {
  return (
    <div>
      <p className="mb-3 text-[13.5px] text-ink-3">Companies that filed a Draft Red Herring Prospectus with SEBI — tomorrow's IPOs.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map(f => (
          <li key={f.url}>
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="card flex items-center gap-3 p-4 hover:-translate-y-0.5 hover:shadow-pop transition-all">
              <CompanyLogo name={f.name} size={42} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[14.5px] truncate">{f.name}</span>
                <span className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-3">
                  <span className={`h-5 px-2 rounded-full font-bold grid place-items-center ${KIND_TONE[f.kind] || "bg-raised text-ink-2"}`}>{f.kind}</span>
                  Filed {date(f.filedDate, true)}
                </span>
              </span>
              <Icon name="arrowUpRight" className="size-4.5 text-ink-3 shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
