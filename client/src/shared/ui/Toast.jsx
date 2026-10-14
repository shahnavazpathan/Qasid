import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();

  const show = useCallback((message, action) => {
    clearTimeout(timer.current);
    setToast({ message, action, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), action ? 6000 : 2500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="fixed inset-x-0 bottom-20 sm:bottom-8 z-[60] flex justify-center pointer-events-none px-4">
        {toast && (
          <div key={toast.id} className="pointer-events-auto flex items-center gap-5 rounded-lg bg-ink text-canvas pl-4 pr-2 h-11 text-[14px] animate-rise">
            <span>{toast.message}</span>
            {toast.action && (
              <button
                className="h-8 px-3 rounded-md font-medium hover:bg-canvas/10"
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
