import { useCallback, useEffect, useRef } from "react";
import { useHashRoute } from "../shared/hooks/useHashRoute.js";
import { Icon, LogoMark, SkeletonCards, ThemeToggle, ToastProvider } from "../shared/ui/index.js";
import { PansProvider, PansView, usePans } from "../modules/pans/index.js";
import { AllotmentProvider, AllotmentView, useAllotment } from "../modules/allotment/index.js";
import { IpoDetail, ipoId, MarketProvider, MarketView, useMarket } from "../modules/market/index.js";
import { AlertsProvider, useAlerts } from "../modules/alerts/index.js";
import { AuthProvider, useAuth } from "../shared/auth/auth.jsx";
import { HomeView } from "../modules/home/index.js";
import { PlannerView } from "../modules/planner/index.js";

const ROUTES = ["home", "ipos", "planner", "allotment", "pans", "ipo"];
const NAV = [
  { route: "home", label: "Home", icon: "home" },
  { route: "ipos", label: "IPOs", icon: "list" },
  { route: "planner", label: "Planner", icon: "calendar" },
  { route: "allotment", label: "Allotment", icon: "check" },
  { route: "pans", label: "My PANs", icon: "users" }
];

function Logo() {
  return (
    <a href="#/home" className="flex items-center gap-2.5 shrink-0" aria-label="Qasid home">
      <LogoMark size={36} fill="#ffffff" pathFill="#000000" className="rounded-xl shadow-lg" />
      <span className="font-extrabold tracking-tight text-[20px] text-white">Qasid</span>
    </a>
  );
}

function AlertBell() {
  const { notificationsOn, watchlist } = useAlerts();
  // Opens the alert setup card (install guide / turn on / test)
  const open = () => {
    window.location.hash = "/pans";
    setTimeout(() => document.getElementById("alerts")?.scrollIntoView({ block: "start", behavior: "smooth" }), 150);
  };
  return (
    <button
      onClick={open}
      title={notificationsOn ? `Alerts on · watching ${watchlist.length}` : "Turn on allotment alerts"}
      aria-label={notificationsOn ? "Allotment alerts on" : "Turn on allotment alerts"}
      className="relative size-10 grid place-items-center rounded-xl text-ink-2 hover:text-ink hover:bg-raised"
    >
      <Icon name={notificationsOn ? "bell" : "bellOff"} className="size-5" />
      {watchlist.length > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-closed text-on-brand text-[10px] font-bold grid place-items-center">{watchlist.length}</span>}
    </button>
  );
}

function GoogleButton() {
  const { user, signedIn, signIn, signOut } = useAuth();
  if (signedIn && user) {
    return (
      <button
        onClick={signOut}
        title={user.email || "Sign out"}
        className="flex items-center gap-2 h-10 px-2.5 rounded-xl hover:bg-raised transition-colors"
      >
        {user.picture ? (
          <img src={user.picture} alt="" className="size-7 rounded-full ring-1 ring-line" />
        ) : (
          <span className="size-7 grid place-items-center rounded-full bg-brand text-on-brand text-[12px] font-bold">
            {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="hidden sm:inline text-[13px] font-semibold text-ink-2 max-w-[140px] truncate">
          {user.name || user.email}
        </span>
      </button>
    );
  }
  return (
    <button
      onClick={signIn}
      className="flex items-center gap-2 h-10 px-3 rounded-xl bg-surface ring-1 ring-line hover:bg-raised transition-colors text-[13px] font-semibold text-ink"
      title="Sign in with Google"
    >
      <GoogleG />
      <span className="hidden sm:inline">Sign in</span>
    </button>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16 4 9.1 8.5 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.9 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-8l-6.5 5C9.1 39.5 16 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.4 4.1-4.4 5.3l6.5 5.5C41.2 35.6 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  );
}

function Footer() {
  const { registrars } = useAllotment();
  const m = useMarket();
  const down = registrars.filter(r => r.status && !r.status.ok).map(r => r.label);
  return (
    <footer className="mt-16 pb-28 sm:pb-12 border-t border-line pt-6 text-[12.5px] text-ink-3 space-y-1.5">
      <div className="flex items-center gap-2"><Logo /></div>
      <p>Data: NSE, SEBI, registrars{m.board?.sources ? `, ${m.board.sources.filter(s => s !== "NSE").join(", ")}` : ""}. Refreshed every minute.</p>
      {down.length > 0 && <p className="text-closed">Temporarily unavailable: {down.join(", ")}</p>}
      <p>GMP is unofficial and indicative. Nothing here is investment advice.</p>
    </footer>
  );
}

function Shell() {
  const [route, go, param] = useHashRoute(ROUTES, "home");
  const market = useMarket();
  const allotment = useAllotment();
  const { pans } = usePans();
  const lastMain = useRef(null);
  if (route !== "ipo") lastMain.current = route;
  // IPO pages live under the IPOs section of the nav
  const page = route === "ipo" ? "ipos" : route;

  const openIpo = useCallback(ipo => go("ipo", ipoId(ipo)), [go]);
  // Back returns to wherever the IPO was opened from (or the IPO list for a shared link)
  const closeIpo = useCallback(() => { if (lastMain.current) history.back(); else go("ipos"); }, [go]);
  const pageIpo = route === "ipo" && param ? market.findById(param) : null;

  const checkAllotment = useCallback(registrarIpo => {
    if (registrarIpo) allotment.select(registrarIpo);
    go("allotment");
  }, [allotment, go]);

  const browse = useCallback(status => { market.setStatus(status); go("ipos"); }, [market, go]);

  useEffect(() => {
    if (route !== "allotment" || !param) return;
    const target = allotment.ipos.find(i => `${i.source}:${i.clientId}` === param);
    if (target) { allotment.select(target); go("allotment"); }
  }, [route, param, allotment, go]);

  // Deep link to an IPO that has since dropped off the board
  useEffect(() => {
    if (route === "ipo" && market.board && !pageIpo) go("ipos");
  }, [route, market.board, pageIpo, go]);

  return (
    <AlertsProvider onOpenAllotment={() => go("allotment")}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-xl border-b border-line/70">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 h-16 flex items-center gap-6">
            <Logo />
            <nav aria-label="Main" className="hidden md:flex gap-1 ml-4">
              {NAV.map(n => (
                <a
                  key={n.route}
                  href={`#/${n.route}`}
                  aria-current={page === n.route ? "page" : undefined}
                  className={`h-10 px-4 inline-flex items-center gap-2 rounded-xl text-[14px] font-semibold transition-colors ${page === n.route ? "bg-brand-soft text-brand" : "text-ink-2 hover:text-ink hover:bg-raised"}`}
                >
                  <Icon name={n.icon} className="size-4.5" />
                  {n.label}
                  {n.route === "pans" && pans.length > 0 && <span className="text-[11px] opacity-70">{pans.length}</span>}
                </a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <GoogleButton />
              <AlertBell />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1200px] px-4 sm:px-6 pt-6 sm:pt-8">
          {page === "home" && <HomeView onOpenIpo={openIpo} onCheckAllotment={checkAllotment} onBrowse={browse} />}
          {route === "ipos" && <MarketView onOpenIpo={openIpo} onCheckAllotment={checkAllotment} />}
          {route === "ipo" && (pageIpo
            ? <IpoDetail key={ipoId(pageIpo)} ipo={pageIpo} onBack={closeIpo} onCheckAllotment={checkAllotment} />
            : <SkeletonCards count={3} />)}
          {page === "planner" && <PlannerView onOpenIpo={openIpo} focusId={param} />}
          {page === "allotment" && <AllotmentView />}
          {page === "pans" && <PansView />}
          <Footer />
        </main>

        <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5 h-16">
            {NAV.map(n => {
              const active = page === n.route;
              return (
                <a key={n.route} href={`#/${n.route}`} aria-current={active ? "page" : undefined} className={`flex flex-col items-center justify-center gap-1 text-[11px] font-bold ${active ? "text-brand" : "text-ink-3"}`}>
                  <span className={`h-7 w-12 grid place-items-center rounded-full transition-colors ${active ? "bg-brand-soft" : ""}`}>
                    <Icon name={n.icon} className="size-5" />
                  </span>
                  {n.label}
                </a>
              );
            })}
          </div>
        </nav>

      </div>
    </AlertsProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <PansProvider>
          <AllotmentProvider>
            <MarketProvider>
              <Shell />
            </MarketProvider>
          </AllotmentProvider>
        </PansProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
