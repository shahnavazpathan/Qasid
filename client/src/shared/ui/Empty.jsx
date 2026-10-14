import { Icon } from "./Icon.jsx";

export function Empty({ icon = "sparkles", title, children, action }) {
  return (
    <div className="card py-14 px-6 text-center">
      <span className="mx-auto mb-4 size-14 grid place-items-center rounded-2xl bg-brand-soft text-brand">
        <Icon name={icon} className="size-7" />
      </span>
      {title && <p className="font-bold text-[16px]">{title}</p>}
      {children && <p className="mt-1 text-ink-3 text-[14px]">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
