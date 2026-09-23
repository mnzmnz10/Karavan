// Dynamic Type: iOS tercih boyutu → yazı ölçeği (sınırlı), Apple dışı tarayıcıda %100.
import { textScale, applyTextSize, TEXT_MIN, TEXT_MAX } from "../textsize";

test("ölçek: varsayılan 17px → 1, büyük/küçük sınırlanır", () => {
  expect(textScale(17)).toBe(1);
  expect(textScale(19)).toBe(1.12);
  expect(textScale(40)).toBe(TEXT_MAX);
  expect(textScale(10)).toBe(TEXT_MIN);
  expect(textScale(0)).toBe(1);
});

test("Apple dışı tarayıcı (CSS.supports yok/false) → %100", () => {
  window.CSS = { supports: () => false };
  expect(applyTextSize()).toBe(100);
  expect(document.documentElement.style.webkitTextSizeAdjust || document.documentElement.style.textSizeAdjust || "100%").toContain("100");
});

test("iOS büyük metin: -apple-system-body 21px → %124", () => {
  window.CSS = { supports: () => true };
  const orig = window.getComputedStyle;
  window.getComputedStyle = () => ({ fontSize: "21px" });
  try { expect(applyTextSize()).toBe(124); } finally { window.getComputedStyle = orig; }
});
