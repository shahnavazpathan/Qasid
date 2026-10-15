import { useCallback, useEffect, useRef } from "react";
import { useHashRoute } from "../shared/hooks/useHashRoute.js";
import { Icon, SkeletonCards, ThemeToggle, ToastProvider } from "../shared/ui/index.js";
import { PansProvider, PansView, usePans } from "../modules/pans/index.js";
import { AllotmentProvider, AllotmentView, useAllotment } from "../modules/allotment/index.js";
import { IpoDetail, ipoId, MarketProvider, MarketView, useMarket } from "../modules/market/index.js";
import { AlertsProvider, useAlerts } from "../modules/alerts/index.js";
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
      <span className="size-9 grid place-items-center rounded-xl brand-gradient text-white font-extrabold text-[17px] shadow-[0_6px_16px_-6px_rgb(234_88_12/.7)]">Q</span>
      <span className="font-extrabold tracking-tight text-[19px]">Qasid</span>
    </a>
  );
}

function AlertBell() {
  const { notificationsOn, enableNotifications, watchlist } = useAlerts();
  return (
    <button
      onClick={notificationsOn ? undefined : enableNotifications}
      title={notificationsOn ? `Alerts on · watching ${watchlist.length}` : "Turn on IPO alerts"}
      aria-label="IPO alerts"
      className="relative size-10 grid place-items-center rounded-xl text-ink-2 hover:text-ink hover:bg-raised"
    >
      <Icon name={notificationsOn ? "bell" : "bellOff"} className="size-5" />
      {watchlist.length > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-closed text-on-brand text-[10px] font-bold grid place-items-center">{watchlist.length}</span>}
    </button>
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
      <PansProvider>
        <AllotmentProvider>
          <MarketProvider>
            <Shell />
          </MarketProvider>
        </AllotmentProvider>
      </PansProvider>
    </ToastProvider>
  );
}
