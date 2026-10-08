/// <reference types="@capacitor/keyboard" />
/// <reference types="@capacitor/splash-screen" />
/// <reference types="@capacitor/status-bar" />
import type { CapacitorConfig } from '@capacitor/cli';
import type { KeyboardResize } from '@capacitor/keyboard';

/**
 * Kontrol Merkezi (LKM) iOS kabuğu.
 *
 * Uygulama kendi arayüzünü taşımaz: masaüstündeki LKM'nin Tailscale üzerinden
 * yayınladığı telefon arayüzünü (server.url) WKWebView içinde açar.
 * Sunucuya ulaşılamazsa (Tailscale kapalı, bilgisayar kapalı, LKM kapalı)
 * Capacitor, uygulama içine gömülü www/offline.html sayfasını gösterir
 * (server.errorPath; iOS'ta capacitor://localhost/offline.html olarak yüklenir).
 */
const LKM_HOST = 'mnz-home.silverside-elnath.ts.net';

const config: CapacitorConfig = {
  appId: 'com.mnzmnz10.lkm',
  appName: 'Kontrol Merkezi',
  webDir: 'www',
  server: {
    url: `https://${LKM_HOST}`,
    errorPath: 'offline.html',
    allowNavigation: [LKM_HOST],
  },
  ios: {
    // Güvenli alanları web sayfası env(safe-area-inset-*) ile kendisi yönetiyor.
    contentInset: 'never',
    backgroundColor: '#eef1f7',
    // Telefon arayüzü 100dvh + overflow:hidden kabuk; kaydırmayı iç kaplar yapıyor.
    // Dış UIScrollView kapalı olunca sayfa bütün olarak esneyip kaymıyor.
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 400,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: '#eef1f7',
      showSpinner: false,
    },
    Keyboard: {
      // 'native': klavye açılınca WKWebView'in kendisi küçülür; böylece 100dvh ve
      // position:fixed alttaki sohbet yazma alanı klavyenin hemen üstünde kalır.
      // Ayrıntı README'de.
      resize: 'native' as KeyboardResize,
      // Klavye açılırken arkada kalan şerit uygulama zemin rengiyle (#eef1f7) boyansın.
      autoBackdropColor: 'auto',
    },
    StatusBar: {
      // Açık zemin üzerinde koyu yazı ('LIGHT' = açık arka plan için koyu içerik).
      style: 'LIGHT',
      overlaysWebView: true,
    },
  },
};

export default config;
