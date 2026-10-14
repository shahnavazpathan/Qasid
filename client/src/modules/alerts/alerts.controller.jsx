import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStoredState } from "../../shared/hooks/useStoredState.js";
import { displayName, normName } from "../../shared/lib/names.js";
import { useToast } from "../../shared/ui/index.js";
import { useMarket } from "../market/market.controller.jsx";
import { useAllotment } from "../allotment/allotment.controller.jsx";
import { usePans } from "../pans/pans.controller.jsx";

const AlertsContext = createContext(null);
export const useAlerts = () => useContext(AlertsContext);

const supported = typeof window !== "undefined" && "Notification" in window;
const watchKey = name => normName(name);

const EVENT_TEXT = {
  open: name => `${name} IPO is now open for bidding`,
  closed: name => `${name} IPO bidding has closed`,
  listed: name => `${name} has listed today`
};

export function AlertsProvider({ onOpenAllotment, children }) {
  const toast = useToast();
  const market = useMarket();
  const allotment = useAllotment();
  const { selected: pans } = usePans();
  const [watchlist, setWatchlist] = useStoredState("watchlist", []);
  const [autoCheck, setAutoCheck] = useStoredState("autoCheck", true);
  const [permission, setPermission] = useState(supported ? Notification.permission : "unsupported");
  const handledEvents = useRef(null);
  const handledAllotments = useRef(null);

  const isWatched = useCallback(name => watchlist.includes(watchKey(name)), [watchlist]);
  const toggleWatch = useCallback(name => {
    const key = watchKey(name);
    const adding = !watchlist.includes(key);
    setWatchlist(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
    toast(adding ? `Watching ${displayName(name)} - you'll get alerts` : `Stopped watching ${displayName(name)}`, null, adding ? "success" : "info");
  }, [watchlist, setWatchlist, toast]);

  const enableNotifications = useCallback(async () => {
    if (!supported) return toast("This browser doesn't support notifications");
    const result = await Notification.requestPermission();
    setPermission(result);
    toast(result === "granted" ? "Alerts on for your watchlist" : "Notifications are blocked in browser settings", null, result === "granted" ? "success" : "info");
  }, [toast]);

  const notify = useCallback((title, body) => {
    if (permission !== "granted" || !document.hidden) return;
    try { new Notification(title, { body, icon: "/favicon.svg", tag: title }); } catch {}
  }, [permission]);

  // IPO stage changes (opened / closed / listed) for watched IPOs
  useEffect(() => {
    if (handledEvents.current === market.events) return;
    handledEvents.current = market.events;
    for (const e of market.events) {
      if (!isWatched(e.ipo.name) || !EVENT_TEXT[e.type]) continue;
      const text = EVENT_TEXT[e.type](displayName(e.ipo.name));
      toast(text, null, "alert");
      notify("Qasid IPO alert", text);
    }
  }, [market.events, isWatched, toast, notify]);

  // Freshly published allotments: auto-check saved PANs, or prompt to check
  useEffect(() => {
    if (handledAllotments.current === allotment.newlyOut) return;
    handledAllotments.current = allotment.newlyOut;
    for (const ipo of allotment.newlyOut) {
      const name = displayName(ipo.name);
      const relevant = isWatched(ipo.name) || watchlist.length === 0;
      if (!relevant) continue;
      if (autoCheck && pans.length) {
        allotment.check(ipo, pans).then(({ summary }) => {
          const text = summary.allotted
            ? `🎉 ${name}: ${summary.allotted} of ${summary.total} PANs allotted (${summary.shares} shares)`
            : `${name}: allotment out - none of your ${summary.total} PANs got shares`;
          toast(text, { label: "View", run: () => { allotment.select(ipo); onOpenAllotment(); } }, summary.allotted ? "success" : "alert");
          notify("Allotment out", text);
        }).catch(() => {});
      } else {
        const text = `${name} allotment is out`;
        toast(text, { label: "Check", run: () => { allotment.select(ipo); onOpenAllotment(); } }, "alert");
        notify("Allotment out", text);
      }
    }
  }, [allotment, autoCheck, pans, isWatched, watchlist.length, toast, notify, onOpenAllotment]);

  const value = useMemo(() => ({
    watchlist, isWatched, toggleWatch, autoCheck, setAutoCheck,
    permission, enableNotifications, notificationsOn: permission === "granted"
  }), [watchlist, isWatched, toggleWatch, autoCheck, setAutoCheck, permission, enableNotifications]);

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}
