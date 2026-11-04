import { useCallback, useEffect, useRef, useState } from "react";
import { useHashRoute } from "../shared/hooks/useHashRoute.js";
import { Icon, LogoMark, SkeletonCards, ThemeToggle, ToastProvider } from "../shared/ui/index.js";
import { PansProvider, PansView, usePans } from "../modules/pans/index.js";
import { AllotmentProvider, AllotmentView, useAllotment } from "../modules/allotment/index.js";
import { IpoDetail, ipoId, MarketProvider, MarketView, useMarket } from "../modules/market/index.js";
import { AlertsProvider, useAlerts } from "../modules/alerts/index.js";
import { AuthProvider, useAuth } from "../shared/auth/auth.jsx";
import { ConsentDialog, DeleteAccountDialog } from "../shared/auth/AccountDialogs.jsx";
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
      <LogoMark size={36} fill="var(--ink)" pathFill="var(--canvas)" className="rounded-xl shadow-lg" />
      <span className="font-extrabold tracking-tight text-[20px] text-ink">Qasid</span>
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

function ProfileMenu({ user, signOut }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDown = e => {
      if (!ref.current || ref.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center gap-2 h-10 pl-1.5 pr-2.5 rounded-xl bg-surface ring-1 ring-line hover:bg-raised transition-colors"
      >
        {user.picture ? (
          <img src={user.picture} alt="" className="size-7 rounded-full ring-1 ring-line" />
        ) : (
          <span className="size-7 grid place-items-center rounded-full bg-brand text-on-brand text-[12px] font-bold">
            {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="hidden sm:inline text-[13px] font-semibold text-ink max-w-[140px] truncate">
          {user.name || user.email}
        </span>
        <svg viewBox="0 0 24 24" className={`size-3.5 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-surface ring-1 ring-line shadow-lg py-1.5 z-50">
          <div className="px-3 py-2 border-b border-line">
            <p className="text-[13px] font-bold text-ink truncate">{user.name || "Signed in"}</p>
            <p className="text-[12px] text-ink-3 truncate">{user.email || ""}</p>
          </div>
          <button
            onClick={() => { setOpen(false); signOut(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-semibold text-loss hover:bg-loss-soft transition-colors"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
          <button
            onClick={() => { setOpen(false); setConfirmDelete(true); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-semibold text-ink-3 hover:bg-raised hover:text-loss transition-colors"
          >
            <Icon name="trash" className="size-4" />
            Delete account
          </button>
        </div>
      )}
      <DeleteAccountDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} />
    </div>
  );
}

function GoogleButton() {
  const { user, signedIn, renderButton, signOut } = useAuth();
  if (signedIn && user) {
    return <ProfileMenu user={user} signOut={signOut} />;
  }
  return <GoogleSignIn renderButton={renderButton} />;
}

// Google's own button, redrawn when the theme or screen width changes (icon only on phones)
function GoogleSignIn({ renderButton }) {
  const ref = useRef(null);
  useEffect(() => {
    const wide = matchMedia("(min-width: 640px)");
    const draw = () => {
      const dark = document.documentElement.dataset.theme !== "light";
      if (ref.current) renderButton(ref.current, { dark, compact: !wide.matches }).catch(e => console.error("[auth]", e.message));
    };
    draw();
    const themeWatch = new MutationObserver(draw);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    wide.addEventListener("change", draw);
    return () => { themeWatch.disconnect(); wide.removeEventListener("change", draw); };
  }, [renderButton]);
  // color-scheme light: Google's frame is a light page; inside our dark page the browser would otherwise
  // paint the frame's background solid white around the button
  return <div ref={ref} className="h-10 flex items-center" style={{ colorScheme: "light" }} />;
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
      <p>GMP is unofficial grey-market data and only indicative. Qasid is not registered with SEBI and nothing here is investment advice.</p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
        <a href="/terms.html" className="font-semibold text-ink-2 hover:text-ink">Terms of Service</a>
        <a href="/privacy.html" className="font-semibold text-ink-2 hover:text-ink">Privacy Policy</a>
        <a href="mailto:sk7611065@gmail.com" className="font-semibold text-ink-2 hover:text-ink">Grievances: sk7611065@gmail.com</a>
      </p>
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
              <ConsentDialog />
            </MarketProvider>
          </AllotmentProvider>
        </PansProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
