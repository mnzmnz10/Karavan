import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'shop.corlukaravan.app',
  appName: 'MSZ Karavan',
  webDir: 'build',
  plugins: {
    // Native HTTP: axios/fetch go through native layer -> no CORS, native cookie
    // jar carries the httpOnly session_token cookie across requests. Backend
    // (corlukaravan.shop) needs zero changes for auth to work on mobile.
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
    SplashScreen: {
      launchShowDuration: 700,
      backgroundColor: '#04284E',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
};

export default config;
