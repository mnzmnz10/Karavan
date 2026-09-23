// iPhone "Metin Boyutu" (Dynamic Type) desteği: iOS, kullanıcının tercih ettiği gövde yazı boyutunu
// `font: -apple-system-body` ile bildirir (varsayılan 17px). Oranı -webkit-text-size-adjust ile tüm yazılara
// uygularız (Capacitor TextZoom eklentisinin yöntemi). Sabit yükseklikli alanlar taşmasın diye oran sınırlı.
export const TEXT_MIN = 0.88;
export const TEXT_MAX = 1.35;

export function textScale(preferredPx, basePx = 17) {
  const r = preferredPx / basePx;
  if (!(r > 0)) return 1;
  return Math.round(Math.min(TEXT_MAX, Math.max(TEXT_MIN, r)) * 100) / 100;
}

function preferredBodyPx() {
  try {
    if (!window.CSS?.supports?.("font", "-apple-system-body")) return null; // Apple dışı tarayıcı
    const el = document.createElement("span");
    el.style.font = "-apple-system-body";
    el.style.position = "absolute";
    el.style.visibility = "hidden";
    document.body.appendChild(el);
    const px = parseFloat(getComputedStyle(el).fontSize);
    el.remove();
    return px > 0 ? px : null;
  } catch { return null; }
}

// Uygula; ayar arka planda değişmiş olabilir → uygulama öne gelince tekrar çağrılır
export function applyTextSize() {
  const px = preferredBodyPx();
  const pct = px ? Math.round(textScale(px) * 100) : 100;
  const s = document.documentElement.style;
  s.webkitTextSizeAdjust = `${pct}%`;
  s.textSizeAdjust = `${pct}%`;
  return pct;
}

let started = false;
export function startTextSize() {
  applyTextSize();
  if (started) return;
  started = true;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") applyTextSize(); });
}
