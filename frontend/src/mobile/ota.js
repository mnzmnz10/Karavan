// App Store'suz arayüz güncellemesi (OTA). Capgo eklentisi kendi barındırdığımız manuel modda:
// manifest GitHub Releases'tan okunur (ota-beta / ota-prod), yeni paket arka planda indirilir,
// geçiş yalnız güvenli anda yapılır: sonraki açılışta ya da öne gelişte açık form/sheet yokken.
// next() KULLANILMAZ: eklenti arka plana geçerken next paketi koşulsuz kurup webview'i yeniler,
// bu da açık formu kaybettirirdi. Geçişi set() ile biz yaparız.
import { hasOpenOverlay, shouldRefreshOnResume } from "./resume";

export const WEB_VERSION = process.env.REACT_APP_WEB_VERSION || "web-dev";
const REPO_DL = "https://github.com/mnzmnz10/Karavan/releases/download/";
const VERSION_RE = /^web-\d{12}-[0-9a-f]{7}$/;
const CHECK_EVERY_MS = 30 * 60 * 1000;

export const manifestUrl = (channel) => `${REPO_DL}ota-${channel}/manifest.json`;
export const channelOf = (appId) => (String(appId || "").endsWith(".beta") ? "beta" : "prod");

// "1.10" > "1.9"; eksik parça 0 sayılır.
export function cmpNative(a, b) {
  const pa = String(a || "0").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// Manifest'teki paket indirilsin mi? Yalnız daha yeni, bizim depodan ve yerel sürüme uyan paket.
export function shouldDownload(manifest, current, nativeVersion) {
  if (!manifest || !VERSION_RE.test(manifest.version || "")) return false;
  if (typeof manifest.url !== "string" || !manifest.url.startsWith(REPO_DL)) return false;
  if (!VERSION_RE.test(current || "")) return false; // geliştirme paketi: OTA'ya dokunma
  if (manifest.version <= current) return false;
  return cmpNative(nativeVersion, manifest.min_native) >= 0;
}

// Daha önce inmiş, çalışandan yeni paketlerin en yenisi (ağ gerekmez).
const isUsable = (b) => b.status === "success" || b.status === "pending";
export function pickDownloaded(bundles, current) {
  return (bundles || [])
    .filter((b) => isUsable(b) && VERSION_RE.test(b.version || "") && VERSION_RE.test(current || "") && b.version > current)
    .sort((a, b) => (a.version < b.version ? 1 : -1))[0] || null;
}

let updater = null;
let ready = null; // indirilmiş, geçilmeyi bekleyen paket { id, version }
let lastCheck = 0;
let busy = false;

async function apply() {
  if (!ready || hasOpenOverlay()) return;
  const id = ready.id;
  ready = null;
  await updater.set({ id }); // webview yeni paketle yeniden yüklenir
}

async function check(channel) {
  if (busy) return;
  busy = true;
  lastCheck = Date.now();
  try {
    const res = await fetch(`${manifestUrl(channel)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const m = await res.json();
    const { native } = await updater.current();
    if (!shouldDownload(m, WEB_VERSION, native)) return;
    const { bundles = [] } = await updater.list();
    const same = bundles.filter((b) => b.version === m.version);
    if (same.some((b) => b.status === "error")) return; // bu paket önceden çöktü, geri dönülmüştü
    ready = same.find(isUsable) || (await updater.download({ url: m.url, version: m.version, checksum: m.sha256 || undefined }));
  } catch {
    /* ağ yok / manifest yok: sessizce geç */
  } finally {
    busy = false;
  }
}

export async function initOta() {
  try {
    ({ CapacitorUpdater: updater } = await import("@capgo/capacitor-updater"));
    // Her açılışta: çağrılmazsa eklenti paketi bozuk sayar ve önceki pakete geri döner.
    await updater.notifyAppReady();
  } catch {
    return;
  }
  let channel = "prod";
  let hiddenAt = 0;
  try {
    const { App } = await import("@capacitor/app");
    channel = channelOf((await App.getInfo()).id);
    App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) { hiddenAt = Date.now(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      if (ready && shouldRefreshOnResume(away, hasOpenOverlay())) apply().catch(() => {});
      else if (Date.now() - lastCheck >= CHECK_EVERY_MS) check(channel);
    });
  } catch {}
  // Önceki oturumda inmiş paket varsa açılışta hemen geç (henüz form açılmamıştır).
  try {
    ready = pickDownloaded((await updater.list()).bundles, WEB_VERSION);
    if (ready) return await apply();
  } catch {}
  // Bu oturumda yeni inen paket öne gelişe (açık form yoksa) veya sonraki açılışa kalır.
  await check(channel);
}
