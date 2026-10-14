import { useEffect, useRef } from "react";

export function Sheet({ open, onClose, label, children }) {
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
      <div className="absolute inset-0 bg-ink/25 animate-fade" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 top-12 sm:top-0 sm:left-auto sm:w-[480px] bg-canvas rounded-t-2xl sm:rounded-none overflow-y-auto outline-none animate-rise sm:animate-slide"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="sticky top-0 float-right m-3 size-10 grid place-items-center rounded-full text-ink-2 hover:text-ink hover:bg-raised"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
            <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <div className="px-6 sm:px-10 pt-10 pb-16">{children}</div>
      </div>
    </div>
  );
}
