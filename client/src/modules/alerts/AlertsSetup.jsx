import { Button, Icon } from "../../shared/ui/index.js";
import { usePans } from "../pans/pans.controller.jsx";
import { useAlerts } from "./alerts.controller.jsx";

function ShareIcon() {
  // iOS Safari "Share" glyph
  return (
    <svg viewBox="0 0 24 24" className="inline size-5 -mt-0.5 text-upcoming" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative w-12 h-7 shrink-0 rounded-full transition-colors ${on ? "bg-open" : "bg-line"}`}>
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function IosSteps() {
  return (
    <ol className="mt-3 space-y-2.5">
      {[
        <>Tap <ShareIcon /> <b>Share</b> in Safari's toolbar</>,
        <>Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b></>,
        <>Open <b>Qasid</b> from your home screen and tap <b>Turn on alerts</b></>
      ].map((step, i) => (
        <li key={i} className="flex gap-3 text-[14px]">
          <span className="size-6 shrink-0 grid place-items-center rounded-full bg-brand text-on-brand text-[12px] font-bold">{i + 1}</span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

// Full alerts card (Saved PANs page) or a compact banner (Home)
export function AlertsSetup({ compact = false }) {
  const a = useAlerts();
  const { pans, selected } = usePans();

  if (compact && a.push === "on") return null;
  if (a.push === "checking") return compact ? null : <section className="card p-5 h-40 animate-pulse" />;

  const header = (
    <div className="flex items-start gap-3">
      <span className={`size-11 shrink-0 grid place-items-center rounded-2xl ${a.push === "on" ? "bg-open text-on-brand" : "bg-brand text-on-brand"}`}>
        <Icon name="bell" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-extrabold text-[16px] leading-snug">{a.push === "on" ? "Allotment alerts are on" : "Get notified the moment allotment is out"}</p>
        <p className="text-[13px] text-ink-3 mt-0.5">
          {a.push === "on"
            ? `This device gets a notification for every new allotment${a.autoCheck && selected.length ? `, with results for your ${selected.length} PAN${selected.length > 1 ? "s" : ""}` : ""}.`
            : "Works even when Qasid is closed - like a native app."}
        </p>
      </div>
    </div>
  );

  let body;
  if (a.push === "needs-install") {
    body = (
      <div className="mt-3 rounded-2xl bg-raised/70 p-4">
        <p className="text-[13.5px] font-semibold">On iPhone, alerts work once Qasid is on your Home Screen:</p>
        <IosSteps />
      </div>
    );
  } else if (a.push === "unsupported") {
    body = <p className="mt-3 text-[13.5px] text-ink-2">This browser can't receive notifications. On Android use Chrome; on iPhone use Safari and add Qasid to your Home Screen.</p>;
  } else if (a.push === "denied") {
    body = <p className="mt-3 text-[13.5px] text-ink-2">Notifications are blocked for Qasid. Allow them in your browser's site settings (or phone Settings → Notifications), then come back here.</p>;
  } else if (a.push === "off") {
    body = (
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" size="md" onClick={a.turnOn} disabled={a.busy} className="flex-1 sm:flex-none whitespace-nowrap">
          <Icon name="bell" className="size-5" />{a.busy ? "Turning on…" : "Turn on alerts"}
        </Button>
        {a.canInstall && !a.installed && (
          <Button variant="outline" size="md" onClick={a.install} className="flex-1 sm:flex-none whitespace-nowrap">
            <Icon name="download" className="size-5" />Install app
          </Button>
        )}
      </div>
    );
  } else {
    body = compact ? null : (
      <div className="mt-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold text-[14px]">Check my PANs automatically</p>
            <p className="text-[12.5px] text-ink-3">{pans.length ? "The notification shows how many of your PANs got shares" : "Add PANs below to get results right in the notification"}</p>
          </div>
          <Toggle on={a.autoCheck} onChange={a.setAutoCheck} label="Check my PANs automatically" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" size="sm" onClick={a.test}><Icon name="bolt" className="size-4" />Send test alert</Button>
          <Button variant="ghost" size="sm" onClick={a.turnOff} disabled={a.busy}>Turn off on this device</Button>
          {a.canInstall && !a.installed && <Button variant="outline" size="sm" onClick={a.install}><Icon name="download" className="size-4" />Install app</Button>}
        </div>
      </div>
    );
  }

  return (
    <section id="alerts" className={`card ${compact ? "p-4" : "p-5"} scroll-mt-24 ${a.push === "on" ? "" : "ring-1 ring-brand/25"}`}>
      {header}
      {body}
    </section>
  );
}
