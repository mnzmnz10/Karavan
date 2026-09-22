// Tema tercihi: 'system' | 'light' | 'dark'. #mobile-root'a .theme-dark class'ı eklenir/çıkarılır.
import { cache } from "./cache";

export const THEME_KEY = "theme";

export function getThemePref() {
  const v = cache.get(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function systemPrefersDark() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function effectiveDark(pref) {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return systemPrefersDark();
}

export function applyTheme(pref) {
  const el = document.getElementById("mobile-root");
  if (el) el.classList.toggle("theme-dark", effectiveDark(pref));
}
