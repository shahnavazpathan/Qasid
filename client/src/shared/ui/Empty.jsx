import { Icon } from "./Icon.jsx";

export function Empty({ icon = "sparkles", title, children, action }) {
  return (
    <div className="card py-12 px-6 text-center">
      <Icon name={icon} className="mx-auto mb-3 size-7 text-ink-3" />
      {title && <p className="font-bold text-[16px]">{title}</p>}
      {children && <p className="mt-1 text-ink-3 text-[14px]">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
