// Small stroke icon set (24px grid, currentColor) so the bundle needs no icon library
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  check: "M9 12.5 11 14.5 15.5 10M12 3l2.4 1.8 3 .1.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3 .1L12 21l-2.4-1.8-3-.1-.9-2.9L3.3 14.4l.9-2.9-.9-2.9 2.4-1.8.9-2.9 3-.1z",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21a8 8 0 0 1 16 0",
  users: "M17 20a5 5 0 0 0-10 0M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20a4 4 0 0 0-3-3.9M18 4.2a3.5 3.5 0 0 1 0 6.6M3 20a4 4 0 0 1 3-3.9M6 4.2a3.5 3.5 0 0 0 0 6.6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-3.5-3.5",
  close: "M6 6l12 12M18 6 6 18",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  bell: "M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4",
  bellOff: "M18 11a6 6 0 0 0-9.3-5M6 11v5l-2 2h14M10 21h4M3 3l18 18",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8",
  refresh: "M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M21 4v5h-5M3 20v-5h5",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowUpRight: "M7 17 17 7M8 7h9v9",
  trendUp: "M3 17l6-6 4 4 8-8M15 7h6v6",
  trendDown: "M3 7l6 6 4-4 8 8M15 17h6v-6",
  calendar: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  fire: "M12 22c4 0 7-2.7 7-7 0-3.5-2.5-6.5-4-8-.5 2-1.5 3-3 3 0-3-1-6-4-8 0 4-5 7-5 13 0 4.3 4 7 9 7",
  gift: "M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  shield: "M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01",
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 6 6 6-6 6",
  calculator: "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2M8 6h8v4H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01",
  layers: "m12 2 10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5",
  sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 2l.6 1.4L7 4l-1.4.6L5 6l-.6-1.4L3 4l1.4-.6z"
};

export function Icon({ name, className = "size-5", filled = false, strokeWidth = 1.8, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
