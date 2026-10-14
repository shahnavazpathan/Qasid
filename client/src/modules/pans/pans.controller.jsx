import { createContext, useCallback, useContext, useMemo } from "react";
import { useStoredState } from "../../shared/hooks/useStoredState.js";
import { PAN_RE, parsePans } from "../../shared/lib/pan.js";

// Older builds stored this placeholder in place of a real name
const LEGACY_PLACEHOLDER = "Check allotment to fetch name";

const PansContext = createContext(null);
export const usePans = () => useContext(PansContext);

export function PansProvider({ children }) {
  const [stored, setStored] = useStoredState("savedPans", []);
  const [excluded, setExcluded] = useStoredState("uncheckedPans", []);

  const pans = useMemo(
    () => stored.map(p => ({ ...p, name: p.name === LEGACY_PLACEHOLDER ? "" : p.name || "" })),
    [stored]
  );
  const selected = useMemo(() => pans.filter(p => !excluded.includes(p.pan)).map(p => p.pan), [pans, excluded]);

  const add = useCallback(text => {
    const entries = parsePans(text);
    const valid = entries.filter(e => PAN_RE.test(e.pan));
    const invalid = entries.filter(e => !PAN_RE.test(e.pan)).map(e => e.pan);
    if (valid.length) {
      setStored(prev => {
        const next = prev.map(p => ({ ...p }));
        valid.forEach(({ pan, nickname }) => {
          const hit = next.find(p => p.pan === pan);
          if (hit) { if (nickname) hit.nickname = nickname; }
          else next.push({ pan, name: "", nickname });
        });
        return next;
      });
      setExcluded(prev => prev.filter(pan => !valid.some(v => v.pan === pan)));
    }
    return { added: valid.length, invalid };
  }, [setStored, setExcluded]);

  // Returns an undo function
  const remove = useCallback(pan => {
    let snapshot;
    setStored(prev => { snapshot = prev; return prev.filter(p => p.pan !== pan); });
    return () => setStored(snapshot);
  }, [setStored]);

  const toggle = useCallback(pan => {
    setExcluded(prev => prev.includes(pan) ? prev.filter(p => p !== pan) : [...prev, pan]);
  }, [setExcluded]);

  const selectAll = useCallback(on => setExcluded(on ? [] : stored.map(p => p.pan)), [setExcluded, stored]);

  const learnNames = useCallback(results => {
    const found = new Map(results
      .filter(r => r.success && r.data?.Name && r.data.Name !== "N/A" && !r.data.Name.includes("Not Provided"))
      .map(r => [r.pan, r.data.Name]));
    if (!found.size) return;
    setStored(prev => prev.map(p => found.has(p.pan) ? { ...p, name: found.get(p.pan) } : p));
  }, [setStored]);

  // Per-PAN record of past outcomes: { PAN: [{ ipo, status, shares, at }] }
  const [history, setHistory] = useStoredState("panHistory", {});
  const recordHistory = useCallback((ipoName, results) => {
    setHistory(prev => {
      const next = { ...prev };
      for (const r of results) {
        if (!r.success && r.error !== "You have not applied for this IPO.") continue;
        const status = r.success ? (Number(r.data.Allotted) > 0 ? "allotted" : "not-allotted") : "not-applied";
        const entry = { ipo: ipoName, status, shares: r.success ? Number(r.data.Allotted) || 0 : 0, at: Date.now() };
        next[r.pan] = [entry, ...(next[r.pan] || []).filter(e => e.ipo !== ipoName)].slice(0, 30);
      }
      return next;
    });
  }, [setHistory]);

  const labelFor = useCallback(pan => {
    const p = pans.find(x => x.pan === pan);
    return p ? [p.nickname, p.name].filter(Boolean).join(" · ") : "";
  }, [pans]);

  const value = useMemo(
    () => ({ pans, selected, add, remove, toggle, selectAll, learnNames, labelFor, history, recordHistory }),
    [pans, selected, add, remove, toggle, selectAll, learnNames, labelFor, history, recordHistory]
  );
  return <PansContext.Provider value={value}>{children}</PansContext.Provider>;
}
