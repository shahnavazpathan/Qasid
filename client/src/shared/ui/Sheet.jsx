import { useEffect, useRef } from "react";
import { Icon } from "./Icon.jsx";

export function Sheet({ open, onClose, label, children, wide = false }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[#0C0A09]/55 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`absolute inset-x-0 bottom-0 top-10 sm:top-3 sm:bottom-3 sm:right-3 sm:left-auto ${wide ? "sm:w-[640px]" : "sm:w-[520px]"} bg-canvas rounded-t-[28px] sm:rounded-[28px] overflow-y-auto outline-none shadow-pop animate-rise sm:animate-slide`}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="sticky top-3 z-10 float-right mr-3 size-10 grid place-items-center rounded-full bg-surface/90 backdrop-blur text-ink-2 hover:text-ink shadow-card"
        >
          <Icon name="close" className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
