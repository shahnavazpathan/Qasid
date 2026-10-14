import { Button } from "../../shared/ui/index.js";
import { date, gmp, issueSize, num, priceBand, rupees, signed, times } from "../../shared/lib/format.js";
import { useAllotment } from "../allotment/index.js";
import { useIpoDetail } from "./market.controller.jsx";

function Fact({ label, children }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-[15px]">{children}</dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-12">
      <h3 className="label mb-4">{title}</h3>
      {children}
    </section>
  );
}

function Timeline({ ipo }) {
  const steps = [
    ["Opens", ipo.openDate], ["Closes", ipo.closeDate], ["Allotment", ipo.allotmentDate],
    ["Refunds", ipo.refundDate], ["Demat credit", ipo.creditDate], ["Listing", ipo.listingDate]
  ].filter(([, d]) => d);
  if (!steps.length) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = steps.findIndex(([, d]) => new Date(d) >= today);

  return (
    <Section title="Timeline">
      <ol>
        {steps.map(([label, d], i) => {
          const past = next === -1 || i < next;
          const current = i === next;
          return (
            <li key={label} className={`flex justify-between py-1.5 ${past ? "text-ink-3" : current ? "text-ink font-medium" : "text-ink-2"}`}>
              <span>{current && <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-ink mr-2 align-middle" />}{label}</span>
              <span>{date(d, true)}</span>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

export function IpoDetail({ ipo: base, onCheckAllotment }) {
  const { detail, loading } = useIpoDetail(base);
  const { findFor } = useAllotment();
  const ipo = { ...base, ...(detail || {}) };
  const allotment = findFor(ipo.name);
  const g = gmp(ipo);
  const sub = ipo.subscription || {};
  const categories = (sub.categories || []).filter(c => c.category !== "Total" && c.times !== null);
  const docs = [...(detail?.documents || []), ...(base.documents || [])]
    .filter((d, i, arr) => arr.findIndex(x => x.url === d.url) === i);

  const meta = [ipo.type === "SME" ? "SME" : "Mainboard", ipo.exchange, ipo.symbol].filter(Boolean).join(" · ");

  return (
    <article>
      <p className="label">{meta}</p>
      <h2 className="mt-2 text-[28px] leading-9 font-medium tracking-tight">{ipo.name}</h2>
      {ipo.industry && <p className="mt-2 text-ink-2">{ipo.industry}</p>}

      {allotment && (
        <Button variant="primary" className="mt-8 w-full" onClick={() => onCheckAllotment(allotment)}>
          Check allotment
        </Button>
      )}

      <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6">
        <Fact label="Price band">{priceBand(ipo)}</Fact>
        <Fact label="Lot">{ipo.lotSize ? `${num(ipo.lotSize)} shares` : "—"}</Fact>
        <Fact label="Min. investment">{ipo.lotSize && ipo.priceMax ? rupees(ipo.lotSize * ipo.priceMax) : "—"}</Fact>
        <Fact label="Issue size">{issueSize(ipo)}</Fact>
        <Fact label="GMP">{g?.text ?? "—"}</Fact>
        <Fact label="Subscribed">{times(sub.total)}</Fact>
        {ipo.listingPrice && <Fact label="Listing price">{rupees(ipo.listingPrice, 2)}</Fact>}
        {ipo.listingGain !== null && ipo.listingGain !== undefined && <Fact label="Listing gain">{signed(ipo.listingGain, "%")}</Fact>}
        {ipo.currentPrice && <Fact label="Current price">{rupees(ipo.currentPrice, 2)}</Fact>}
        {ipo.registrarName && <Fact label="Registrar">{ipo.registrarName}</Fact>}
      </dl>
      {ipo.leadManagers && (
        <dl className="mt-6"><Fact label="Lead managers">{ipo.leadManagers}</Fact></dl>
      )}

      <Timeline ipo={ipo} />

      {(categories.length > 0 || loading) && (
        <Section title="Subscription">
          {loading && !categories.length ? (
            <div className="space-y-3 animate-pulse">{[0, 1, 2].map(i => <div key={i} className="h-4 rounded bg-raised" />)}</div>
          ) : (
            <>
              <table className="w-full text-[15px]">
                <tbody>
                  {categories.map(c => (
                    <tr key={c.category}>
                      <td className="py-1.5 text-ink-2">{c.category}</td>
                      <td className="py-1.5 text-right">{times(c.times)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sub.updatedAt && <p className="mt-3 text-[13px] text-ink-3">As of {sub.updatedAt}</p>}
            </>
          )}
        </Section>
      )}

      {docs.length > 0 && (
        <Section title="Documents">
          <ul className="space-y-2">
            {docs.map(d => (
              <li key={d.url}>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-ink-2 hover:text-ink underline decoration-line underline-offset-4">
                  {d.label}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {ipo.about && (
        <Section title="About">
          <p className="text-ink-2 leading-relaxed">{ipo.about}</p>
        </Section>
      )}
    </article>
  );
}
