import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useStoredState } from "../../shared/hooks/useStoredState.js";
import { normName } from "../../shared/lib/names.js";
import { usePans } from "../pans/index.js";
import { allotmentService } from "./allotment.service.js";

export const NOT_APPLIED = "You have not applied for this IPO.";
export const MAX_PANS = 50;

export const ipoKey = ipo => `${ipo.source}:${ipo.clientId}`;

const AllotmentContext = createContext(null);
export const useAllotment = () => useContext(AllotmentContext);

export function AllotmentProvider({ children }) {
  const [ipos, setIpos] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [registrars, setRegistrars] = useState([]);
  const [selectedKey, setSelectedKey] = useStoredState("selectedIpo", "");

  useEffect(() => {
    allotmentService.listIpos()
      .then(list => { setIpos(list); setLoadError(""); })
      .catch(err => setLoadError(err.message))
      .finally(() => allotmentService.registrars().then(setRegistrars).catch(() => {}));
  }, []);

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

  const value = useMemo(
    () => ({ ipos, loading: !ipos.length && !loadError, loadError, registrars, selected, select, findFor }),
    [ipos, loadError, registrars, selected, select, findFor]
  );
  return <AllotmentContext.Provider value={value}>{children}</AllotmentContext.Provider>;
}

const rank = r => (r.success ? (Number(r.data.Allotted) > 0 ? 0 : 1) : r.error === NOT_APPLIED ? 2 : 3);
const IDLE = { status: "idle", results: [], error: "", ipo: null };

export function useAllotmentCheck() {
  const { selected } = useAllotment();
  const { selected: pans, learnNames } = usePans();
  const [state, setState] = useState(IDLE);

  // Results belong to one IPO; switching IPO clears them
  useEffect(() => { setState(s => (s.ipo && s.ipo !== selected ? IDLE : s)); }, [selected]);

  const run = useCallback(async () => {
    if (!selected || !pans.length) return;
    const ipo = selected;
    setState({ status: "loading", results: [], error: "", ipo });
    try {
      const results = await allotmentService.check(ipo, pans.slice(0, MAX_PANS));
      learnNames(results);
      setState({ status: "done", results: [...results].sort((a, b) => rank(a) - rank(b)), error: "", ipo });
    } catch (err) {
      setState({ status: "error", results: [], error: err.message, ipo });
    }
  }, [selected, pans, learnNames]);

  const summary = useMemo(() => {
    const allotted = state.results.filter(r => r.success && Number(r.data.Allotted) > 0);
    return {
      total: state.results.length,
      applied: state.results.filter(r => r.success).length,
      allotted: allotted.length,
      shares: allotted.reduce((s, r) => s + Number(r.data.Allotted), 0)
    };
  }, [state.results]);

  return { ...state, summary, run, canRun: !!selected && pans.length > 0, panCount: Math.min(pans.length, MAX_PANS) };
}
