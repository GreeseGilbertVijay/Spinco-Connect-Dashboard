"use client";

import { useLayoutEffect } from "react";
import { storedTheme } from "@/lib/theme";

// Strict Mode's dev remount resets <html> to its JSX attributes, wiping what the
// inline script set. This puts the saved theme back; it is a no-op in production.
export default function ThemeSync() {
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", storedTheme());
  }, []);
  return null;
}
