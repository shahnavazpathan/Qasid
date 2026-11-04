import { Button, Icon, PageHeader } from "../../shared/ui/index.js";
import { usePans } from "../pans/pans.controller.jsx";
import { useAuth } from "../../shared/auth/auth.jsx";
import { PanList } from "../pans/PanList.jsx";
import { MAX_PANS, useAllotment, useAllotmentRunner } from "./allotment.controller.jsx";
import { IpoPicker } from "./IpoPicker.jsx";
import { Results } from "./Results.jsx";

function Step({ title, hint, children }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3">
        <h2 className="font-semibold text-[15px] leading-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function Sidebar() {
  const { recent, registrars, ipos, select } = useAllotment();
  const up = registrars.filter(r => r.status?.ok).length;
  return (
    <aside className="space-y-4">
      <section className="card p-5">
        <h3 className="font-semibold text-[15px] mb-3">Recent checks</h3>
        {recent.length === 0 ? (
          <p className="text-[13.5px] text-ink-3">Your checks will show up here.</p>
        ) : (
          <ul className="space-y-1.5">
            {recent.slice(0, 6).map(r => {
              const ipo = ipos.find(i => `${i.source}:${i.clientId}` === r.key);
              return (
                <li key={r.key}>
                  <button
                    onClick={() => ipo && select(ipo)}
                    disabled={!ipo}
                    className="w-full flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised text-left disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[13.5px] truncate">{r.name}</span>
                      <span className="block text-[12px] text-ink-3">{timeAgo(r.at)}</span>
                    </span>
                    <span className={`shrink-0 h-6 px-2 rounded-full text-[11.5px] font-bold grid place-items-center ${r.allotted ? "bg-gain-soft text-gain" : "bg-raised text-ink-3"}`}>
                      {r.allotted}/{r.total}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h3 className="font-semibold text-[15px] mb-1">Registrars</h3>
        <p className="flex items-center gap-1.5 text-[13px] text-ink-2"><span className={`size-1.5 rounded-full ${up === registrars.length ? "bg-open" : "bg-closed"}`} />{up} of {registrars.length || "…"} online</p>
        {/* Only the ones that are down are worth naming */}
        <ul className="mt-2 flex flex-wrap gap-1.5 empty:hidden">
          {registrars.filter(r => !r.status?.ok).map(r => (
            <li key={r.id} title={r.status?.error || ""} className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold ${r.status?.ok ? "bg-open-soft text-open" : "bg-loss-soft text-loss"}`}>
              <i className="size-1.5 rounded-full bg-current" />
              {r.label}
              {r.servers && <span className="opacity-70">{r.servers.filter(s => s.healthy).length}/{r.servers.length}</span>}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

export function AllotmentView() {
  const { selected } = useAllotment();
  const { selected: pans } = usePans();
  const { signedIn, consentNeeded } = useAuth();
  const synced = signedIn && !consentNeeded;
  const runner = useAllotmentRunner(selected);
  const loading = runner.status === "loading";
  const count = Math.min(pans.length, MAX_PANS);
  const progress = runner.progress;

  return (
    <div>
      <PageHeader title="Allotment" description="Check every PAN in one go, across 10 registrars." />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="space-y-4 min-w-0">
          <Step title="IPO" hint="IPOs whose allotment is out">
            <IpoPicker />
          </Step>
          <Step title="PANs" hint={synced ? "Saved to your account" : "Saved in this browser. Sign in to keep them on every device."}>
            <PanList />
          </Step>

          <Button
            variant="primary"
            size="lg"
            onClick={() => runner.run(pans)}
            disabled={!selected || !count || loading}
            className="w-full"
          >
            <Icon name={loading ? "refresh" : "check"} className={`size-5 ${loading ? "animate-spin" : ""}`} />
            {loading
              ? progress?.total > 1 ? `Checked ${progress.done} of ${progress.total}…` : "Checking…"
              : count > 1 ? `Check ${count} PANs` : "Check allotment"}
          </Button>

          <div aria-live="polite">
            {runner.status === "error" && <p className="card p-4 text-loss font-semibold">{runner.error}</p>}
            {/* Shown batch by batch while checking; remounted when done so the celebration sees the final count */}
            {(runner.status === "done" || (loading && runner.results.length > 0)) && <Results key={runner.status} ipo={runner.ipo} results={runner.results} summary={runner.summary} />}
          </div>
        </div>
        <Sidebar />
      </div>
    </div>
  );
}
