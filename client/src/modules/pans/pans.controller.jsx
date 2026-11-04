import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useStoredState } from "../../shared/hooks/useStoredState.js";
import { PAN_RE, parsePans } from "../../shared/lib/pan.js";
import { useAuth } from "../../shared/auth/auth.jsx";
import { api } from "../../shared/api/client.js";
import { useToast } from "../../shared/ui/Toast.jsx";

// Older builds stored this placeholder in place of a real name
const LEGACY_PLACEHOLDER = "Check allotment to fetch name";
// Older builds gave every PAN without a nickname the nickname "Main", which then hid the holder's name
const LEGACY_NICKNAME = "Main";
const cleanNickname = nickname => (nickname && nickname !== LEGACY_NICKNAME ? nickname : "");
// The server keeps at most this many PANs per account
const MAX_PANS = 50;

const save = list => api.post("/api/user/pans", { pans: list.map(p => ({ pan: p.pan, nickname: cleanNickname(p.nickname), name: p.name || "" })) });

const PansContext = createContext(null);
export const usePans = () => useContext(PansContext);

export function PansProvider({ children }) {
  const { signedIn, consentNeeded, loading } = useAuth();
  // PANs go to the account only after the user has agreed to the Terms and Privacy Policy
  const synced = signedIn && !consentNeeded;
  const toast = useToast();
  const [stored, setStored] = useStoredState("savedPans", []);
  const [excluded, setExcluded] = useStoredState("uncheckedPans", []);
  const [history, setHistory] = useStoredState("panHistory", {});
  const syncing = useRef(false);
  // The saved list as of the last render, for callbacks that finish later (allotment results)
  const latest = useRef(stored);
  latest.current = stored;
  // Whether this browser's list holds an account's PANs (kept across reloads, e.g. when a new Terms
  // version asks a synced user to agree again and they sign out instead)
  const [fromAccount, setFromAccount] = useStoredState("pansFromAccount", false);

  // When signed in, fetch the account's PANs and add any saved in this browser before signing in
  useEffect(() => {
    if (!synced) return;
    let live = true;
    api.get("/api/user/pans").then(async data => {
      if (!live || !data.success || !Array.isArray(data.pans)) return;
      syncing.current = true;

      const combined = data.pans.map(p => ({ pan: p.pan, name: p.name || "", nickname: cleanNickname(p.nickname) }));
      let hasNewLocal = false;
      let left = 0;
      for (const lp of stored || []) {
        const hit = combined.find(p => p.pan === lp.pan);
        if (hit) {
          // Keep a name this browser already looked up
          if (!hit.name && lp.name) { hit.name = lp.name; hasNewLocal = true; }
        } else if (combined.length < MAX_PANS) {
          combined.push(lp);
          hasNewLocal = true;
        } else {
          left++;
        }
      }

      setStored(combined);
      if (left) toast(`Your account is full (${MAX_PANS} PANs). ${left} PAN${left > 1 ? "s" : ""} from this device weren't added.`, null, "alert");
      if (hasNewLocal) await save(combined).catch(() => toast("Couldn't save your PANs to your account. Please try again.", null, "alert"));

      setTimeout(() => { syncing.current = false; }, 100);
    }).catch(() => {});
    return () => { live = false; };
  }, [synced]);

  // On sign-out, forget this account's PANs on this device so the next person can't see them
  // (or copy them into their own account by signing in). They come back on the next sign-in.
  // Someone who signs out without agreeing to the Terms never synced, so their browser's PANs stay.
  useEffect(() => {
    // signedIn is false until the session check finishes on page load
    if (loading) return;
    if (synced && !fromAccount) setFromAccount(true);
    if (fromAccount && !signedIn) {
      setFromAccount(false);
      setStored([]);
      setExcluded([]);
      setHistory({});
    }
  }, [loading, synced, signedIn, fromAccount, setFromAccount, setStored, setExcluded, setHistory]);

  // Push PAN changes to the account when signed in
  const persist = useCallback(nextStored => {
    latest.current = nextStored;
    setStored(nextStored);
    if (!synced || syncing.current) return;
    save(nextStored).catch(() => toast("Couldn't save your PANs to your account. Please try again.", null, "alert"));
  }, [synced, setStored, toast]);

  const pans = useMemo(
    () => stored.map(p => ({ ...p, name: p.name === LEGACY_PLACEHOLDER ? "" : p.name || "", nickname: cleanNickname(p.nickname) })),
    [stored]
  );
  const selected = useMemo(() => pans.filter(p => !excluded.includes(p.pan)).map(p => p.pan), [pans, excluded]);

  const add = useCallback(text => {
    const entries = parsePans(text);
    const valid = entries.filter(e => PAN_RE.test(e.pan));
    const invalid = entries.filter(e => !PAN_RE.test(e.pan)).map(e => e.pan);
    const nextStored = stored.map(p => ({ ...p }));
    const taken = [];
    let full = 0;
    valid.forEach(({ pan, nickname }) => {
      const hit = nextStored.find(p => p.pan === pan);
      if (hit) { if (nickname) hit.nickname = nickname; taken.push(pan); }
      else if (nextStored.length < MAX_PANS) { nextStored.push({ pan, name: "", nickname }); taken.push(pan); }
      else full++;
    });
    if (taken.length) {
      persist(nextStored);
      setExcluded(prev => prev.filter(pan => !taken.includes(pan)));
    }
    if (full) toast(`You can save up to ${MAX_PANS} PANs. ${full} PAN${full > 1 ? "s" : ""} weren't added - remove some first.`, null, "alert");
    return { added: taken.length, invalid };
  }, [stored, persist, setExcluded, toast]);

  // Returns an undo function
  const remove = useCallback(pan => {
    const snapshot = stored;
    persist(stored.filter(p => p.pan !== pan));
    return () => persist(snapshot);
  }, [stored, persist]);

  const toggle = useCallback(pan => {
    setExcluded(prev => prev.includes(pan) ? prev.filter(p => p !== pan) : [...prev, pan]);
  }, [setExcluded]);

  const selectAll = useCallback(on => setExcluded(on ? [] : stored.map(p => p.pan)), [setExcluded, stored]);

  const learnNames = useCallback(results => {
    const found = new Map(results
      .filter(r => r.success && r.data?.Name && r.data.Name !== "N/A" && !r.data.Name.includes("Not Provided"))
      .map(r => [r.pan, r.data.Name]));
    if (!found.size) return;
    // Worked out from the latest list (results arrive after the check, when the list may have changed;
    // and not inside a state updater, which React may run later), so the new names reliably reach the
    // account too and show on other devices
    let changed = false;
    const nextStored = latest.current.map(p => {
      if (!found.has(p.pan) || p.name === found.get(p.pan)) return p;
      changed = true;
      return { ...p, name: found.get(p.pan) };
    });
    if (changed) persist(nextStored);
  }, [persist]);

  // Per-PAN record of past outcomes: { PAN: [{ ipo, status, shares, at }] }
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
