import { useEffect } from "react";

// Fires on a single key when the user isn't typing in a field
export function useHotkey(key, handler) {
  useEffect(() => {
    const onKey = e => {
      if (e.key !== key || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      handler(e);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [key, handler]);
}
