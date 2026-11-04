import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Centred dialog for decisions that need an answer (agreement, permanent delete).
// onClose is optional: without it, Escape and the backdrop don't close it.
export function Dialog({ open, onClose, label, children }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = e => { if (e.key === "Escape" && onClose) onClose(); };
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
  // Rendered into <body>: inside the blurred sticky header, "fixed" would be relative to the header
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div className="absolute inset-0 bg-[#0C0A09]/60 backdrop-blur-[2px] animate-fade" onClick={onClose || undefined} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="relative w-full max-w-[460px] max-h-[90vh] overflow-y-auto card p-6 shadow-pop animate-rise outline-none"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
