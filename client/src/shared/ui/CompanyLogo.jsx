import { useState } from "react";
import { initials, swatch } from "../lib/ipo.js";

export function CompanyLogo({ name, src, size = 44, className = "" }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (src && !broken) {
    return (
      <span style={style} className={`shrink-0 grid place-items-center rounded-2xl bg-white ring-1 ring-line overflow-hidden ${className}`}>
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="max-w-[82%] max-h-[82%] object-contain" />
      </span>
    );
  }
  return (
    <span
      style={{ ...style, background: swatch(name), fontSize: size * 0.36 }}
      className={`shrink-0 grid place-items-center rounded-2xl text-white font-bold ${className}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
