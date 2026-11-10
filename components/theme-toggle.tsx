"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.setAttribute("data-color-mode", theme); // used by the markdown editor
  window.dispatchEvent(new Event("themechange"));
}

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem("theme");
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

// Reads the theme currently applied to <html> and re-renders when it changes.
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    read();
    window.addEventListener("themechange", read);
    return () => window.removeEventListener("themechange", read);
  }, []);
  return theme;
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();

  // Until the user picks a theme, follow the system setting, including live changes.
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!readStored()) applyTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private browsing: the choice just won't be remembered.
    }
    applyTheme(next);
  }

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  if (compact) {
    return (
      <button className="ghost icon" onClick={toggle} aria-label={label} title={label}>
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    );
  }

  return (
    <button className="ghost" onClick={toggle} aria-label={label} style={{ justifyContent: "flex-start" }}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      {theme === "dark" ? "Light theme" : "Dark theme"}
    </button>
  );
}
