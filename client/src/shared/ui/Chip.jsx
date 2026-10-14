import { STAGES } from "../lib/ipo.js";

const TONES = {
  neutral: "bg-raised text-ink-2",
  brand: "bg-brand-soft text-brand",
  open: "bg-open-soft text-open",
  upcoming: "bg-upcoming-soft text-upcoming",
  closed: "bg-closed-soft text-closed",
  listed: "bg-listed-soft text-listed",
  sme: "bg-sme-soft text-sme",
  gain: "bg-gain-soft text-gain",
  loss: "bg-loss-soft text-loss"
};

export function Chip({ tone = "neutral", className = "", children, dot = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}>
      {dot && <span className="size-1.5 rounded-full bg-current animate-live" />}
      {children}
    </span>
  );
}

export function StageChip({ status }) {
  const stage = STAGES[status];
  if (!stage) return null;
  return <Chip tone={status} dot={status === "open"}>{stage.label}</Chip>;
}

export function TypeChip({ type }) {
  return type === "SME" ? <Chip tone="sme">SME</Chip> : <Chip tone="brand">Mainboard</Chip>;
}

// Subscription colour scale: <1x grey, 1–10x amber, 10–50x green, 50x+ violet
export function subTone(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "neutral";
  if (x >= 50) return "listed";
  if (x >= 10) return "open";
  if (x >= 1) return "closed";
  return "neutral";
}

export function SubChip({ times }) {
  if (times === null || times === undefined) return null;
  return <Chip tone={subTone(times)}>{Number(times).toFixed(2)}x</Chip>;
}

export function GainChip({ value, suffix = "%" }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return <Chip>—</Chip>;
  const v = Number(value);
  return <Chip tone={v > 0 ? "gain" : v < 0 ? "loss" : "neutral"}>{v > 0 ? "▲ " : v < 0 ? "▼ " : ""}{Math.abs(v).toFixed(1)}{suffix}</Chip>;
}
