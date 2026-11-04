import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

const TONE_ICON = { info: ["info", "text-brand"], success: ["check", "text-open"], alert: ["bell", "text-closed"] };

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();

  // show(message, action?, tone?)  -  action = { label, run }
  const show = useCallback((message, action, tone = "info") => {
    clearTimeout(timer.current);
    setToast({ message, action, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), action ? 7000 : 3000);
  }, []);

  const [icon, colour] = TONE_ICON[toast?.tone] || TONE_ICON.info;

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="fixed inset-x-0 bottom-24 sm:bottom-8 z-[60] flex justify-center pointer-events-none px-4">
        {toast && (
          <div key={toast.id} className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink text-canvas pl-4 pr-2 min-h-12 py-2 text-[14px] font-medium shadow-pop animate-rise max-w-[560px]">
            <Icon name={icon} className={`size-5 shrink-0 ${colour}`} />
            <span>{toast.message}</span>
            {toast.action && (
              <button
                className="shrink-0 h-8 px-3 rounded-xl font-bold text-brand-2 hover:bg-canvas/10"
                onClick={() => { toast.action.run(); setToast(null); }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
