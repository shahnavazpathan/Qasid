import { write } from "../lib/storage.js";

export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const now = root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = now === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    write("theme", next);
  };
  return (
    <button onClick={toggle} aria-label="Toggle theme" className="size-9 grid place-items-center rounded-full text-ink-3 hover:text-ink hover:bg-raised">
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
      </svg>
    </button>
  );
}
