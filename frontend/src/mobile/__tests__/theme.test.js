// Varsayılan tema açık; eski otomatik "system" kaydı bir kez açığa çevrilir, sonra kullanıcının seçimi korunur.
import { getThemePref, THEME_KEY } from "../theme";
import { cache } from "../cache";

beforeEach(() => localStorage.clear());

test("hiç seçim yok → açık", () => {
  expect(getThemePref()).toBe("light");
});
test("eski otomatik 'system' kaydı → bir kez açık", () => {
  cache.set(THEME_KEY, "system");
  expect(getThemePref()).toBe("light");
});
test("geçişten sonra kullanıcı Sistem/Koyu seçerse korunur", () => {
  getThemePref();
  cache.set(THEME_KEY, "system");
  expect(getThemePref()).toBe("system");
  cache.set(THEME_KEY, "dark");
  expect(getThemePref()).toBe("dark");
});
