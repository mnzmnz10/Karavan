// Capacitor native shell entegrasyonu. Web'de no-op (isNativePlatform=false).
// index.js başlangıcında initNative() çağrılır.
import { Capacitor } from '@capacitor/core';
import { installMobileDownload } from './mobileDownload';

let initialized = false;

export function isNative() {
  return Capacitor?.isNativePlatform?.() === true;
}

export async function initNative() {
  if (initialized) return;
  initialized = true;

  if (!isNative()) return; // tarayıcıda hiçbir şey yapma

  // <html>'e sınıf ekle -> safe-area / user-select CSS'i devreye girer
  document.documentElement.classList.add('native-app');
  document.documentElement.classList.add(`platform-${Capacitor.getPlatform()}`);

  // Dosya indirme/açma köprüsü (window.open + <a download> yakalar)
  installMobileDownload();

  // Eklentileri dinamik import et (web build'i şişirmesin, hatada app çökmesin)
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark }); // koyu bar + açık ikon
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#059669' }); // marka emerald
    }
  } catch (e) { /* status bar yoksa geç */ }

  // Android donanım geri tuşu: geçmiş varsa geri git, kökteyse app'i arka plana al
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) {
        window.history.back();
      } else {
        App.minimizeApp();
      }
    });
  } catch (e) { /* app plugin yoksa geç */ }

  // Splash'i içerik hazır olunca gizle
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (e) { /* splash yoksa geç */ }
}
