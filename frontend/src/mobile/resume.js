// Açık sheet / form / lightbox var mı (portallar body'ye düşer, hepsi m-backdrop-enter katmanı taşır)
export const hasOpenOverlay = () => typeof document !== "undefined" && !!document.querySelector(".m-backdrop-enter");
// Öne gelince ekran yenilensin mi: açık katman yoksa ve 1 dk'dan uzun arka planda kalındıysa.
export const RESUME_REFRESH_MS = 60 * 1000;
export const shouldRefreshOnResume = (awayMs, overlayOpen) => !overlayOpen && awayMs >= RESUME_REFRESH_MS;
