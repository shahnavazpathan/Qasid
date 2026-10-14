import { useState } from "react";
import { write } from "../lib/storage.js";
import { Icon } from "./Icon.jsx";

const currentTheme = () =>
  document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme);
  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    write("theme", next);
    setTheme(next);
  };
  return (
    <button onClick={toggle} aria-label="Toggle theme" className="size-10 grid place-items-center rounded-xl text-ink-2 hover:text-ink hover:bg-raised">
      <Icon name={theme === "dark" ? "sun" : "moon"} className="size-5" />
    </button>
  );
}
