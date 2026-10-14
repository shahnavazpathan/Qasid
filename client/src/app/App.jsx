import { useHashRoute } from "../shared/hooks/useHashRoute.js";
import { ThemeToggle, ToastProvider } from "../shared/ui/index.js";
import { PansProvider } from "../modules/pans/index.js";
import { AllotmentProvider, AllotmentView, useAllotment } from "../modules/allotment/index.js";
import { MarketProvider, MarketView } from "../modules/market/index.js";

const ROUTES = ["ipos", "allotment"];
const NAV = [{ route: "ipos", label: "IPOs" }, { route: "allotment", label: "Allotment" }];

function Footer() {
  const { registrars } = useAllotment();
  const down = registrars.filter(r => r.status && !r.status.ok).map(r => r.label);
  return (
    <footer className="mt-32 pb-12 text-[13px] text-ink-3 space-y-1">
      {down.length > 0 && <p>{down.join(", ")} unavailable right now</p>}
      <p>GMP is unofficial · Not investment advice</p>
    </footer>
  );
}

function Shell() {
  const [route, go] = useHashRoute(ROUTES, "ipos");

  return (
    <div className="mx-auto max-w-[1080px] px-4 sm:px-8">
      <header className="sticky top-0 z-40 bg-canvas -mx-4 px-4 sm:-mx-8 sm:px-8">
        <div className="h-16 flex items-center gap-8">
          <a href="#/ipos" className="font-semibold tracking-tight text-[17px]">Qasid</a>
          <nav aria-label="Main" className="flex gap-6">
            {NAV.map(n => (
              <a
                key={n.route}
                href={`#/${n.route}`}
                aria-current={route === n.route ? "page" : undefined}
                className={`text-[15px] transition-colors ${route === n.route ? "text-ink font-medium" : "text-ink-3 hover:text-ink-2"}`}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
      </header>

      <main className="pt-10 sm:pt-16">
        {route === "ipos" ? <MarketView onGoToAllotment={() => go("allotment")} /> : <AllotmentView />}
      </main>

      <Footer />
    </div>
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
