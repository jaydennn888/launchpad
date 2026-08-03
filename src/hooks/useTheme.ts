import { useEffect } from "react";

export type ThemePref = "system" | "light" | "dark";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

/**
 * Applies the theme by toggling `.dark` on <html>.
 * - "system": follows the OS color scheme and keeps listening for changes.
 * - "light" / "dark": forces the theme.
 */
export function useSystemTheme(pref: ThemePref = "system"): void {
  useEffect(() => {
    const apply = () => {
      document.documentElement.classList.toggle("dark", resolve(pref) === "dark");
    };
    apply();

    if (pref === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [pref]);
}
