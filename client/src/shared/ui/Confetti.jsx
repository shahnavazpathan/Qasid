import { useMemo } from "react";

const COLOURS = ["#F97316", "#FB923C", "#FACC15", "#22C55E", "#3B82F6", "#EC4899"];

// Brief celebration when a PAN gets allotted
export function Confetti({ pieces = 80 }) {
  const bits = useMemo(() => Array.from({ length: pieces }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 1.8 + Math.random() * 1.4,
    size: 6 + Math.random() * 6,
    colour: COLOURS[i % COLOURS.length],
    round: Math.random() > 0.5
  })), [pieces]);

  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none z-[70] overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          style={{
            left: `${b.left}%`, top: -20, width: b.size, height: b.size * (b.round ? 1 : 0.45),
            background: b.colour, borderRadius: b.round ? "50%" : 2,
            animation: `confetti-fall ${b.duration}s ${b.delay}s cubic-bezier(.3,.6,.5,1) forwards`
          }}
          className="absolute"
        />
      ))}
    </div>
  );
}
