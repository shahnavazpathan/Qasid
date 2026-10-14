import { useState } from "react";
import { Button, Icon } from "../../shared/ui/index.js";
import { displayName } from "../../shared/lib/names.js";
import { PAN_RE, parsePans } from "../../shared/lib/pan.js";
import { usePans } from "../pans/pans.controller.jsx";
import { useAllotmentRunner } from "./allotment.controller.jsx";
import { Results } from "./Results.jsx";

// Check allotment for one IPO right where the user is (IPO sheet, Home) using saved PANs
export function QuickCheck({ ipo, onOpenFull }) {
  const { selected, pans, add } = usePans();
  const runner = useAllotmentRunner(ipo);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const loading = runner.status === "loading";

  const addAndCheck = e => {
    e.preventDefault();
    const { invalid } = add(draft);
    if (invalid.length) return setError(`${invalid.join(", ")} isn't a valid PAN (e.g. ABCDE1234F)`);
    const fresh = parsePans(draft).filter(p => PAN_RE.test(p.pan)).map(p => p.pan);
    setError("");
    setDraft("");
    if (fresh.length) runner.run([...new Set([...selected, ...fresh])]);
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 overflow-hidden relative">
        <div className="absolute -right-10 -top-10 size-36 rounded-full bg-open-soft" aria-hidden="true" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-open bg-open-soft rounded-full px-2.5 h-6"><i className="size-1.5 rounded-full bg-open animate-live" />Allotment is out</span>
          <p className="mt-2 font-bold text-[16px]">{displayName(ipo.name)}</p>
          <p className="text-[13px] text-ink-3">Registrar · {ipo.registrar || ipo.source}</p>

          {pans.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" disabled={loading || !selected.length} onClick={() => runner.run(selected)}>
                <Icon name={loading ? "refresh" : "check"} className={`size-5 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Checking…" : `Check ${selected.length} saved PAN${selected.length === 1 ? "" : "s"}`}
              </Button>
              {onOpenFull && <button onClick={onOpenFull} className="text-[13.5px] font-semibold text-brand hover:underline">Choose PANs →</button>}
            </div>
          ) : (
            <form onSubmit={addAndCheck} className="mt-4">
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={e => { setDraft(e.target.value); setError(""); }}
                  placeholder="Enter PAN, e.g. ABCDE1234F"
                  aria-label="PAN"
                  autoCapitalize="characters"
                  spellCheck="false"
                  className="flex-1 min-w-0 h-12 px-4 rounded-2xl bg-raised font-mono text-[15px] uppercase placeholder:normal-case placeholder:font-sans placeholder:text-ink-3 outline-none focus:ring-2 focus:ring-brand"
                />
                <Button type="submit" variant="primary" size="lg" disabled={!draft.trim() || loading}>Check</Button>
              </div>
              {error ? <p className="mt-2 text-[13px] text-loss">{error}</p> : <p className="mt-2 text-[12.5px] text-ink-3">The PAN is saved in this browser so you can check future IPOs in one tap.</p>}
            </form>
          )}
        </div>
      </div>

      {runner.status === "error" && <p className="card p-4 text-loss font-semibold">{runner.error}</p>}
      {runner.status === "done" && <Results ipo={runner.ipo} results={runner.results} summary={runner.summary} compact />}
    </div>
  );
}
