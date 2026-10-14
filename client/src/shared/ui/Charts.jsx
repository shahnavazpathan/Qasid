// Tiny dependency-free charts: sparkline, line chart with dots, horizontal bars.

export function Sparkline({ values, width = 84, height = 28, className = "text-brand" }) {
  const pts = values.filter(v => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const step = width / (pts.length - 1);
  const coords = pts.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)]);
  const d = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill="currentColor" opacity=".12" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords.at(-1)[0]} cy={coords.at(-1)[1]} r="2.5" fill="currentColor" />
    </svg>
  );
}

// Labelled line chart for GMP history
export function LineChart({ points, format = v => v, height = 160, className = "text-brand" }) {
  if (points.length < 2) return null;
  const W = 600, H = height, P = { l: 8, r: 8, t: 18, b: 26 };
  const vals = points.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = i => P.l + (i * (W - P.l - P.r)) / (points.length - 1);
  const y = v => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full h-auto ${className}`} role="img" aria-label="Trend chart">
      <path d={`${d} L${x(points.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`} fill="currentColor" opacity=".12" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="4.5" fill="var(--surface)" stroke="currentColor" strokeWidth="2.5" />
          <text x={x(i)} y={y(p.value) - 10} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)">{format(p.value)}</text>
          {i % labelEvery === 0 || i === points.length - 1 ? (
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--ink-3)">{p.label}</text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

// One horizontal bar per category, scaled on a log axis so 0.5x and 150x are both readable
export function SubscriptionBars({ categories }) {
  const rows = categories.filter(c => c.times !== null && c.times !== undefined);
  if (!rows.length) return null;
  const max = Math.max(...rows.map(c => Math.log10(1 + c.times)), Math.log10(2));
  const colour = t => (t >= 50 ? "bg-listed" : t >= 10 ? "bg-open" : t >= 1 ? "bg-closed" : "bg-ink-3");
  return (
    <ul className="space-y-3.5">
      {rows.map(c => (
        <li key={c.category}>
          <div className="flex justify-between text-[13.5px] mb-1.5">
            <span className={c.category === "Total" ? "font-bold" : "text-ink-2 font-medium"}>{c.category}</span>
            <span className="font-bold tabular-nums">{Number(c.times).toFixed(2)}x</span>
          </div>
          <div className="h-2.5 rounded-full bg-raised overflow-hidden">
            <div
              className={`h-full rounded-full animate-grow ${c.category === "Total" ? "brand-gradient" : colour(c.times)}`}
              style={{ width: `${Math.max(3, (Math.log10(1 + c.times) / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Compact meter used on IPO cards
export function SubMeter({ times }) {
  if (times === null || times === undefined) return null;
  const pct = Math.min(100, (Math.log10(1 + times) / Math.log10(101)) * 100);
  const colour = times >= 50 ? "bg-listed" : times >= 10 ? "bg-open" : times >= 1 ? "bg-closed" : "bg-ink-3";
  return (
    <div className="h-1.5 rounded-full bg-raised overflow-hidden">
      <div className={`h-full rounded-full animate-grow ${colour}`} style={{ width: `${Math.max(4, pct)}%` }} />
    </div>
  );
}
