import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { normName } from "../../shared/lib/names.js";
import { estimate, todayIso } from "../../shared/lib/ipo.js";
import { marketService } from "./market.service.js";

export const STATUSES = ["open", "upcoming", "closed", "listed"];
const REFRESH_MS = 60 * 1000;

const MarketContext = createContext(null);
export const useMarket = () => useContext(MarketContext);

export const ipoId = ipo => ipo.symbol || normName(ipo.name).replace(/ /g, "-");

const SORTS = {
  default: null,
  gmp: (a, b) => (estimate(b)?.pct ?? -1e9) - (estimate(a)?.pct ?? -1e9),
  subscription: (a, b) => (b.subscription?.total ?? -1) - (a.subscription?.total ?? -1),
  size: (a, b) => (b.issueSizeCr ?? 0) - (a.issueSizeCr ?? 0),
  gain: (a, b) => (b.listingGain ?? -1e9) - (a.listingGain ?? -1e9)
};

// What changed for an IPO between two board snapshots - drives live alerts
function diffBoards(prev, next) {
  if (!prev) return [];
  const before = new Map(STATUSES.flatMap(s => (prev[s] || []).map(i => [ipoId(i), i])));
  const events = [];
  for (const s of STATUSES) {
    for (const ipo of next[s] || []) {
      const old = before.get(ipoId(ipo));
      if (old && old.status !== ipo.status) events.push({ type: ipo.status, ipo });
    }
  }
  return events;
}

export function MarketProvider({ children }) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("default");
  const [filings, setFilings] = useState({ items: null, error: "" });
  const [events, setEvents] = useState([]);
  const pickedStatus = useRef(false);
  const lastBoard = useRef(null);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const data = await marketService.board(force);
      const changes = diffBoards(lastBoard.current, data);
      if (changes.length) setEvents(changes);
      lastBoard.current = data;
      setBoard(data);
      setError("");
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
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  useEffect(() => {
    if (status !== "filed" || filings.items) return;
    marketService.filings()
      .then(items => setFilings({ items, error: "" }))
      .catch(err => setFilings({ items: null, error: err.message }));
  }, [status, filings.items]);

  const chooseStatus = useCallback(s => { pickedStatus.current = true; setStatus(s); }, []);

  const all = useMemo(() => (board ? STATUSES.flatMap(s => board[s] || []) : []), [board]);

  const list = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (status === "filed") return (filings.items || []).filter(f => !q || f.name.toUpperCase().includes(q));
    const rows = (board?.[status] || []).filter(i =>
      (type === "all" || i.type === type) &&
      (!q || i.name.toUpperCase().includes(q) || (i.symbol || "").includes(q)));
    return SORTS[sort] ? [...rows].sort(SORTS[sort]) : rows;
  }, [board, filings.items, status, type, query, sort]);

  const counts = useMemo(() => Object.fromEntries(STATUSES.map(s => [s, board ? (board[s] || []).length : undefined])), [board]);

  // Today's key events across the whole board
  const today = useMemo(() => {
    const t = todayIso();
    return {
      closing: all.filter(i => i.status === "open" && i.closeDate === t),
      opening: all.filter(i => i.openDate === t),
      allotment: all.filter(i => i.allotmentDate === t),
      listing: all.filter(i => i.listingDate === t)
    };
  }, [all]);

  const findById = useCallback(id => all.find(i => ipoId(i) === id) || null, [all]);

  const value = useMemo(() => ({
    board, all, error, refreshing, refresh: () => load(true),
    status, setStatus: chooseStatus, type, setType, query, setQuery, sort, setSort,
    list, counts, today, findById, events, filingsError: filings.error,
    loading: status === "filed" ? !filings.items && !filings.error : !board && !error
  }), [board, all, error, refreshing, load, status, chooseStatus, type, query, sort, list, counts, today, findById, events, filings]);

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

// Lazily enriches a board row with exchange detail (category subscription, documents, registrar...)
export function useIpoDetail(ipo) {
  const [state, setState] = useState({ detail: null, loading: false });
  // The board id works whether or not NSE gave the IPO a symbol (the server falls back to BSE/Chittorgarh)
  const id = ipo?.id;

  useEffect(() => {
    if (!id) { setState({ detail: null, loading: false }); return; }
    let live = true;
    setState({ detail: null, loading: true });
    const fetchDetail = () => marketService.detail(id)
      .then(detail => live && setState({ detail, loading: false }))
      .catch(() => live && setState(s => ({ ...s, loading: false })));
    fetchDetail();
    // Keep live subscription fresh while the sheet is open
    const timer = setInterval(() => { if (!document.hidden) fetchDetail(); }, 90 * 1000);
    return () => { live = false; clearInterval(timer); };
  }, [id]);

  return state;
}
