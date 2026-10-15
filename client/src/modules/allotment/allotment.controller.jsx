import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStoredState } from "../../shared/hooks/useStoredState.js";
import { displayName, normName } from "../../shared/lib/names.js";
import { usePans } from "../pans/pans.controller.jsx";
import { allotmentService } from "./allotment.service.js";

export const NOT_APPLIED = "You have not applied for this IPO.";
export const MAX_PANS = 50;
const POLL_MS = 2 * 60 * 1000;

export const ipoKey = ipo => `${ipo.source}:${ipo.clientId}`;

const AllotmentContext = createContext(null);
export const useAllotment = () => useContext(AllotmentContext);

const rank = r => (r.success ? (Number(r.data.Allotted) > 0 ? 0 : 1) : r.error === NOT_APPLIED ? 2 : 3);

export function summarise(results) {
  const allotted = results.filter(r => r.success && Number(r.data.Allotted) > 0);
  return {
    total: results.length,
    applied: results.filter(r => r.success).length,
    allotted: allotted.length,
    shares: allotted.reduce((s, r) => s + Number(r.data.Allotted), 0)
  };
}

export function AllotmentProvider({ children }) {
  const [ipos, setIpos] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [registrars, setRegistrars] = useState([]);
  const [selectedKey, setSelectedKey] = useStoredState("selectedIpo", "");
  const [recent, setRecent] = useStoredState("recentChecks", []);
  const [newlyOut, setNewlyOut] = useState([]);
  const known = useRef(null);
  const { learnNames, recordHistory } = usePans();

  const load = useCallback(async () => {
    try {
      const list = await allotmentService.listIpos();
      // Only allotments the server marks as genuinely new (isNew) count - an old IPO that reappears
      // after a registrar outage must not trigger alerts or auto-checks. `known` only ever grows.
      if (known.current) {
        const fresh = list.filter(i => i.isNew && !known.current.has(ipoKey(i)));
        if (fresh.length) setNewlyOut(fresh);
      } else {
        known.current = new Set();
      }
      list.forEach(i => known.current.add(ipoKey(i)));
      setIpos(list);
      setLoadError("");
    } catch (err) {
      setLoadError(err.message);
    }
    allotmentService.registrars().then(setRegistrars).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const selected = useMemo(() => ipos.find(i => ipoKey(i) === selectedKey) || null, [ipos, selectedKey]);
  const select = useCallback(ipo => setSelectedKey(ipo ? ipoKey(ipo) : ""), [setSelectedKey]);

  // Match an exchange-listed IPO name to a registrar's allotment listing
  const findFor = useCallback(name => {
    const target = normName(name);
    if (!target) return null;
    return ipos.find(i => normName(i.name) === target)
      || ipos.find(i => { const n = normName(i.name); return n && (n.startsWith(target) || target.startsWith(n)); })
      || null;
  }, [ipos]);

  // Shared by the Allotment page, the IPO sheet and Home quick-check
  const check = useCallback(async (ipo, pans) => {
    const raw = await allotmentService.check(ipo, pans.slice(0, MAX_PANS));
    const results = [...raw].sort((a, b) => rank(a) - rank(b));
    learnNames(results);
    recordHistory(displayName(ipo.name), results);
    const summary = summarise(results);
    setRecent(prev => [
      { key: ipoKey(ipo), name: displayName(ipo.name), registrar: ipo.registrar || ipo.source, at: Date.now(), ...summary },
      ...prev.filter(r => r.key !== ipoKey(ipo))
    ].slice(0, 12));
    return { results, summary };
  }, [learnNames, recordHistory, setRecent]);

  const value = useMemo(() => ({
    ipos, loading: !ipos.length && !loadError, loadError, registrars, selected, select, findFor, check,
    recent, newlyOut, refresh: load
  }), [ipos, loadError, registrars, selected, select, findFor, check, recent, newlyOut, load]);
  return <AllotmentContext.Provider value={value}>{children}</AllotmentContext.Provider>;
}

const IDLE = { status: "idle", results: [], error: "", ipo: null, summary: summarise([]) };

// Runs a check for one IPO against a set of PANs and tracks its state
export function useAllotmentRunner(ipo) {
  const { check } = useAllotment();
  const [state, setState] = useState(IDLE);

  useEffect(() => { setState(s => (s.ipo && ipo && ipoKey(s.ipo) !== ipoKey(ipo) ? IDLE : s)); }, [ipo]);

  const run = useCallback(async pans => {
    if (!ipo || !pans.length) return null;
    setState({ ...IDLE, status: "loading", ipo });
    try {
      const { results, summary } = await check(ipo, pans);
      setState({ status: "done", results, summary, error: "", ipo });
      return summary;
    } catch (err) {
      setState({ ...IDLE, status: "error", error: err.message, ipo });
      return null;
    }
  }, [ipo, check]);

  return { ...state, run, reset: () => setState(IDLE) };
}
