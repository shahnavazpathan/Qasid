import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useStoredState } from "../../shared/hooks/useStoredState.js";
import { PAN_RE, parsePans } from "../../shared/lib/pan.js";
import { useAuth } from "../../shared/auth/auth.jsx";
import { api } from "../../shared/api/client.js";

// Older builds stored this placeholder in place of a real name
const LEGACY_PLACEHOLDER = "Check allotment to fetch name";

const PansContext = createContext(null);
export const usePans = () => useContext(PansContext);

export function PansProvider({ children }) {
  const { signedIn } = useAuth();
  const [stored, setStored] = useStoredState("savedPans", []);
  const [excluded, setExcluded] = useStoredState("uncheckedPans", []);
  const syncing = useRef(false);

  // When signed in, fetch PANs from the server DB and merge with any existing local PANs
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api.get("/api/user/pans").then(async data => {
      if (!live || !data.success || !Array.isArray(data.pans)) return;
      syncing.current = true;

      const dbPans = data.pans.map(p => ({ pan: p.pan, name: p.name || "", nickname: p.nickname || "Main" }));

      // Merge local PANs that might exist before sign in
      const localPans = stored || [];
      const combined = [...dbPans];
      let hasNewLocal = false;

      for (const lp of localPans) {
        if (!combined.some(p => p.pan === lp.pan)) {
          combined.push(lp);
          hasNewLocal = true;
        }
      }

      setStored(combined);

      // If we had local PANs that weren't on the server, migrate them to the DB
      if (hasNewLocal) {
        try {
          await api.post("/api/user/pans", { pans: combined.map(p => ({ pan: p.pan, nickname: p.nickname || "Main" })) });
        } catch (e) {
          console.error("Failed to migrate local PANs to DB:", e);
        }
      }

      setTimeout(() => { syncing.current = false; }, 100);
    }).catch(() => {});
    return () => { live = false; };
  }, [signedIn]);

  // Push PAN changes to server DB when signed in
  const persist = useCallback(nextStored => {
    setStored(nextStored);
    if (!signedIn || syncing.current) return;
    api.post("/api/user/pans", { pans: nextStored.map(p => ({ pan: p.pan, nickname: p.nickname || "Main" })) }).catch(() => {});
  }, [signedIn, setStored]);

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
      let nextStored;
      setStored(prev => {
        nextStored = prev.map(p => ({ ...p }));
        valid.forEach(({ pan, nickname }) => {
          const hit = nextStored.find(p => p.pan === pan);
          if (hit) { if (nickname) hit.nickname = nickname; }
          else nextStored.push({ pan, name: "", nickname });
        });
        return nextStored;
      });
      persist(nextStored);
      setExcluded(prev => prev.filter(pan => !valid.some(v => v.pan === pan)));
    }
    return { added: valid.length, invalid };
  }, [setStored, persist, setExcluded]);

  // Returns an undo function
  const remove = useCallback(pan => {
    let snapshot, nextStored;
    setStored(prev => {
      snapshot = prev;
      nextStored = prev.filter(p => p.pan !== pan);
      return nextStored;
    });
    persist(nextStored);
    return () => { setStored(snapshot); persist(snapshot); };
  }, [setStored, persist]);

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
