import { Button } from "../../shared/ui/index.js";
import { PanList } from "../pans/index.js";
import { MAX_PANS, useAllotmentCheck } from "./allotment.controller.jsx";
import { IpoPicker } from "./IpoPicker.jsx";
import { Results } from "./Results.jsx";

function Step({ n, title, children }) {
  return (
    <section className="grid sm:grid-cols-[140px_1fr] gap-x-10 gap-y-4">
      <h2 className="label pt-1.5"><span className="mr-2 opacity-60">{n}</span>{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function AllotmentView() {
  const check = useAllotmentCheck();
  const loading = check.status === "loading";

  return (
    <div className="max-w-[720px]">
      <h1 className="text-[28px] leading-9 font-medium tracking-tight mb-12">Allotment</h1>

      <div className="space-y-12">
        <Step n="1" title="IPO"><IpoPicker /></Step>
        <Step n="2" title="PANs"><PanList /></Step>
        <div className="sm:pl-[180px]">
          <Button variant="primary" onClick={check.run} disabled={!check.canRun || loading} className="w-full sm:w-auto sm:min-w-[220px]">
            {loading ? "Checking…" : check.panCount > 1 ? `Check ${check.panCount} PANs` : "Check allotment"}
          </Button>
          {check.panCount === MAX_PANS && <p className="mt-3 text-[13px] text-ink-3">Up to {MAX_PANS} PANs per check</p>}
        </div>
      </div>

      <div className="mt-20 sm:pl-[180px]" aria-live="polite">
        {check.status === "error" && <p className="text-ink-2">{check.error}</p>}
        {check.status === "done" && <Results ipo={check.ipo} results={check.results} summary={check.summary} />}
      </div>
    </div>
  );
}
