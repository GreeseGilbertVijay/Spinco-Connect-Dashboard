"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, applyTheme, currentTheme, subscribeTheme } from "@/lib/theme";

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => DEFAULT_THEME);
  const next = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;
  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={() => applyTheme(next)}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {next === "light"
          ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
          : <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />}
      </svg>
    </button>
  );
}
