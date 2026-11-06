export type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "spinco-theme";

// Runs at the top of <body> before first paint, so a saved light theme never flashes dark.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

const listeners = new Set<() => void>();

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Read from <html>, not storage, so controls stay right when storage is blocked.
export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private windows can block storage: the theme still applies for this visit.
  }
  const swap = () => {
    document.documentElement.setAttribute("data-theme", theme);
    listeners.forEach((listener) => listener());
  };
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.startViewTransition && !calm) document.startViewTransition(swap);
  else swap();
}
