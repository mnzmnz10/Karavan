// Tema tercihi: 'system' | 'light' | 'dark'. #mobile-root'a .theme-dark class'ı eklenir/çıkarılır.
import { cache } from "./cache";

export const THEME_KEY = "theme";

export function getThemePref() {
  let v = cache.get(THEME_KEY);
  // Eskiden tercih her açılışta "system" diye yazılıyordu; varsayılan açık oldu → bir kez açığa çevir
  if (!cache.get("theme_light_default")) {
    cache.set("theme_light_default", true);
    if (v === "system") { v = "light"; cache.set(THEME_KEY, v); }
  }
  return v === "system" || v === "dark" ? v : "light"; // varsayılan: açık
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
