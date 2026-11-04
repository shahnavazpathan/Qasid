import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStoredState } from "../../shared/hooks/useStoredState.js";
import { displayName, normName } from "../../shared/lib/names.js";
import { usePans } from "../pans/pans.controller.jsx";
import { allotmentService } from "./allotment.service.js";

export const NOT_APPLIED = "You have not applied for this IPO.";
export const MAX_PANS = 50;
const POLL_MS = 2 * 60 * 1000;
// PANs per request: results show up batch by batch, and when an allotment comes out one person's 50 PANs
// don't sit in front of everyone else's in the registrar queue
const BATCH = 5;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  // Shared by the Allotment page, the IPO sheet and Home quick-check.
  // onProgress(results so far, total) is called after each batch.
  const check = useCallback(async (ipo, pans, onProgress) => {
    const list = pans.slice(0, MAX_PANS);
    const runBatches = async (targets, report) => {
      const out = [];
      let failures = 0, lastError = null;
      for (let i = 0; i < targets.length; i += BATCH) {
        const batch = targets.slice(i, i + BATCH);
        try {
          out.push(...await allotmentService.check(ipo, batch));
        } catch (err) {
          failures++;
          lastError = err;
          out.push(...batch.map(pan => ({ pan, success: false, error: err.message })));
        }
        report(out);
      }
      // Every batch failed (offline, rate limited...): one clear error instead of the same one per PAN
      if (failures && failures === Math.ceil(targets.length / BATCH)) throw lastError;
      return out;
    };

    let raw = await runBatches(list, out => onProgress?.(out, list.length));
    // The registrar was too busy for some PANs: one more try after a short pause
    const busy = raw.filter(r => r.busy).map(r => r.pan);
    if (busy.length) {
      await sleep(4000);
      const merge = out => { const byPan = new Map(out.map(r => [r.pan, r])); return raw.map(r => byPan.get(r.pan) || r); };
      raw = merge(await runBatches(busy, out => onProgress?.(merge(out), list.length)).catch(() => []));
    }
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
    const total = Math.min(pans.length, MAX_PANS);
    setState({ ...IDLE, status: "loading", ipo, progress: { done: 0, total } });
    // Updates only apply while this run is still the one on screen (the user may have picked another IPO)
    const mine = s => s.ipo === ipo;
    const showPartial = partial => setState(s => (mine(s) && s.status === "loading"
      ? { ...s, results: [...partial].sort((a, b) => rank(a) - rank(b)), summary: summarise(partial), progress: { done: partial.length, total } }
      : s));
    try {
      const { results, summary } = await check(ipo, pans, showPartial);
      setState(s => (mine(s) ? { status: "done", results, summary, error: "", ipo } : s));
      return summary;
    } catch (err) {
      setState(s => (mine(s) ? { ...IDLE, status: "error", error: err.message, ipo } : s));
      return null;
    }
  }, [ipo, check]);

  return { ...state, run, reset: () => setState(IDLE) };
}
