import { useState } from "react";
import { write } from "../lib/storage.js";
import { Icon } from "./Icon.jsx";

// Dark is the default look; light only when picked here
const currentTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme);
  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "light" ? "#f5f5f5" : "#000000");
    write("theme", next);
    setTheme(next);
  };
  return (
    <button onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} className="size-10 grid place-items-center rounded-xl text-ink-2 hover:text-ink hover:bg-raised">
      <Icon name={theme === "dark" ? "sun" : "moon"} className="size-5" />
    </button>
  );
}
