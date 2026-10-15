// Qasid mark: a "Q" drawn as a message bubble (Qasid = messenger) carrying a tick (allotment confirmed).
// Same geometry as /public/logo.svg and the app icons.
export function LogoMark({ size = 36, className = "" }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#0F1638" />
      <g transform="translate(11 6)">
        <path
          d="M377 292.5 A144 144 0 1 0 284.5 385 L399.8 407.8 Z M336 248 A96 96 0 1 0 144 248 A96 96 0 1 0 336 248 Z"
          fill="#FFFFFF" fillRule="evenodd" stroke="#FFFFFF" strokeWidth="8" strokeLinejoin="round"
        />
        <path d="M190 252 L228 290 L294 216" fill="none" stroke="#34D399" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
