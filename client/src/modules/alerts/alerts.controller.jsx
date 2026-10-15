import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStoredState } from "../../shared/hooks/useStoredState.js";
import { displayName, normName } from "../../shared/lib/names.js";
import { idbSet } from "../../shared/lib/idb.js";
import { useToast } from "../../shared/ui/index.js";
import { useMarket } from "../market/market.controller.jsx";
import { useAllotment } from "../allotment/allotment.controller.jsx";
import { usePans } from "../pans/pans.controller.jsx";
import { disablePush, enablePush, isIos, isStandalone, pushStatus, sendTestPush, syncPush } from "./push.js";

const AlertsContext = createContext(null);
export const useAlerts = () => useContext(AlertsContext);

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
  const [push, setPush] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const handledEvents = useRef(null);
  const handledAllotments = useRef(null);

  /* ---------- Push subscription state ---------- */
  const refreshPush = useCallback(() => pushStatus().then(setPush).catch(() => setPush("unsupported")), []);
  useEffect(() => {
    refreshPush();
    syncPush();
    const onVisible = () => { if (!document.hidden) refreshPush(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshPush]);

  // Android/desktop Chrome: keep the native install prompt for our own "Install app" button
  useEffect(() => {
    const onPrompt = e => { e.preventDefault(); setInstallEvent(e); };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); toast("Qasid installed - open it from your home screen", null, "success"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, [toast]);

  const install = useCallback(async () => {
    if (!installEvent) return false;
    installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => null);
    setInstallEvent(null);
    return choice?.outcome === "accepted";
  }, [installEvent]);

  // The service worker can't read localStorage: mirror what it needs for the on-device allotment check
  useEffect(() => { idbSet("alertSettings", { autoCheck, pans }); }, [autoCheck, pans]);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      const status = await enablePush();
      setPush(status);
      if (status === "on") toast("Allotment alerts are on for this device", null, "success");
      else if (status === "denied") toast("Notifications are blocked - allow them in your browser or phone settings");
      return status;
    } catch (err) {
      toast(`Couldn't turn on alerts: ${err.message}`);
      return "off";
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    try { setPush(await disablePush()); toast("Alerts turned off for this device"); } finally { setBusy(false); }
  }, [toast]);

  const test = useCallback(async () => {
    try { await sendTestPush(); toast("Test alert sent - check your notifications", null, "success"); }
    catch (err) { toast(err.message || "Couldn't send a test alert"); }
  }, [toast]);

  /* ---------- Watchlist ---------- */
  const isWatched = useCallback(name => watchlist.includes(watchKey(name)), [watchlist]);
  const toggleWatch = useCallback(name => {
    const key = watchKey(name);
    const adding = !watchlist.includes(key);
    setWatchlist(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
    toast(adding ? `Watching ${displayName(name)}` : `Stopped watching ${displayName(name)}`, null, adding ? "success" : "info");
  }, [watchlist, setWatchlist, toast]);

  // In-app alerts while Qasid is open (push covers the closed-app case)
  useEffect(() => {
    if (handledEvents.current === market.events) return;
    handledEvents.current = market.events;
    for (const e of market.events) {
      if (!isWatched(e.ipo.name) || !EVENT_TEXT[e.type]) continue;
      toast(EVENT_TEXT[e.type](displayName(e.ipo.name)), null, "alert");
    }
  }, [market.events, isWatched, toast]);

  useEffect(() => {
    if (handledAllotments.current === allotment.newlyOut) return;
    handledAllotments.current = allotment.newlyOut;
    for (const ipo of allotment.newlyOut) {
      const name = displayName(ipo.name);
      const open = () => { allotment.select(ipo); onOpenAllotment(); };
      if (autoCheck && pans.length) {
        allotment.check(ipo, pans).then(({ summary }) => {
          toast(summary.allotted
            ? `🎉 ${name}: ${summary.allotted} of ${summary.total} PANs allotted (${summary.shares} shares)`
            : `${name}: allotment out - none of your ${summary.total} PANs got shares`,
          { label: "View", run: open }, summary.allotted ? "success" : "alert");
        }).catch(() => {});
      } else {
        toast(`${name} allotment is out`, { label: "Check", run: open }, "alert");
      }
    }
  }, [allotment, autoCheck, pans, toast, onOpenAllotment]);

  const value = useMemo(() => ({
    watchlist, isWatched, toggleWatch, autoCheck, setAutoCheck,
    push, busy, turnOn, turnOff, test, notificationsOn: push === "on",
    canInstall: !!installEvent, install, installed, ios: isIos()
  }), [watchlist, isWatched, toggleWatch, autoCheck, setAutoCheck, push, busy, turnOn, turnOff, test, installEvent, install, installed]);

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}
