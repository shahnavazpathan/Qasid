import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { marketService } from "./market.service.js";

export const STATUSES = ["open", "upcoming", "closed", "listed"];
const REFRESH_MS = 60 * 1000;

const MarketContext = createContext(null);
export const useMarket = () => useContext(MarketContext);

export function MarketProvider({ children }) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [filings, setFilings] = useState({ items: null, error: "" });
  const pickedStatus = useRef(false);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const data = await marketService.board(force);
      setBoard(data);
      setError("");
      // Land on the first bucket that has something in it, until the user picks one
      if (!pickedStatus.current) {
        const first = STATUSES.find(s => (data[s] || []).length);
        if (first) setStatus(first);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (status !== "filed" || filings.items) return;
    marketService.filings()
      .then(items => setFilings({ items, error: "" }))
      .catch(err => setFilings({ items: null, error: err.message }));
  }, [status, filings.items]);

  const chooseStatus = useCallback(s => { pickedStatus.current = true; setStatus(s); }, []);

  const list = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (status === "filed") {
      return (filings.items || []).filter(f => !q || f.name.toUpperCase().includes(q));
    }
    return (board?.[status] || []).filter(i =>
      (type === "all" || i.type === type) &&
      (!q || i.name.toUpperCase().includes(q) || (i.symbol || "").includes(q)));
  }, [board, filings.items, status, type, query]);

  const counts = useMemo(() => Object.fromEntries(STATUSES.map(s => [s, board ? (board[s] || []).length : undefined])), [board]);

  const value = useMemo(() => ({
    board, error, refreshing, refresh: () => load(true),
    status, setStatus: chooseStatus, type, setType, query, setQuery,
    list, counts, filingsError: filings.error,
    loading: status === "filed" ? !filings.items && !filings.error : !board && !error
  }), [board, error, refreshing, load, status, chooseStatus, type, query, list, counts, filings]);

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

// Lazily enriches a board row with exchange detail (subscription by category, documents, about)
export function useIpoDetail(ipo) {
  const [state, setState] = useState({ detail: null, loading: false });

  useEffect(() => {
    if (!ipo?.symbol) { setState({ detail: null, loading: false }); return; }
    let live = true;
    setState({ detail: null, loading: true });
    marketService.detail(ipo.symbol, ipo.type)
      .then(detail => live && setState({ detail, loading: false }))
      .catch(() => live && setState({ detail: null, loading: false }));
    return () => { live = false; };
  }, [ipo]);

  return state;
}
