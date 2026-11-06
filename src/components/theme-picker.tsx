"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, applyTheme, currentTheme, subscribeTheme, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function ThemePicker() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => DEFAULT_THEME);
  return (
    <div className="theme-picker" role="group" aria-label="Colour theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          className={`theme-option ${theme === option.value ? "selected" : ""}`}
          onClick={() => applyTheme(option.value)}
        >
          <span className={`theme-sample ${option.value}`} aria-hidden="true">
            <span className="theme-sample-side" />
            <span className="theme-sample-main"><i /><i /><i /></span>
          </span>
          <span className="theme-option-label"><span className="theme-radio" aria-hidden="true" />{option.label}</span>
        </button>
      ))}
    </div>
  );
}
