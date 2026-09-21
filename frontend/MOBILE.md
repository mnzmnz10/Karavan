# Karavan — Mobil Uygulama (Capacitor)

React web app'i **Capacitor** ile native Android/iOS kabuğuna sarıldı. Kod %100
yeniden kullanılıyor; backend **https://corlukaravan.shop** (değişiklik yok).

## Mimari kararlar

- **CapacitorHttp açık** (`capacitor.config.ts`): axios/fetch native katmandan
  gider → CORS yok, native cookie jar `session_token` (httpOnly) cookie'sini
  taşır. Login/session backend'e dokunmadan çalışır.
- **Backend URL** build-time env ile veriliyor: `REACT_APP_BACKEND_URL`
  (`build:mobile` script'i `https://corlukaravan.shop` set eder). Web build'i
  aynen kalır (boş = same-origin).
- **Dosya indirme** (`src/lib/mobileDownload.js`): `window.open(...pdf)` ve
  `<a download>` çağrıları global yakalanıp CapacitorHttp+Filesystem+Share ile
  native indirilip açılır. App.js'e dokunulmadı.
- **Native UX** (`src/lib/native.js`): safe-area (çentik), StatusBar (emerald),
  Android donanım geri tuşu, splash gizleme.

## Build (kullanıcı makinesinde)

> ⚠️ APK derleme Claude'un tool ortamından ÇALIŞMAZ: bu exec-context java.exe
> için AF_UNIX self-pipe'ı blokluyor (`Selector.open` fail). Kendi terminalinde
> veya Android Studio'da sorunsuz derlenir.

### Web bundle + native sync (her kod değişikliğinden sonra)
```
cd frontend
yarn build:mobile      # env ile prod build
npx cap sync           # build/ -> android & ios
```

### Android APK — yöntem A: Android Studio (önerilen)
```
cd frontend
npx cap open android
```
Android Studio açılınca: **Run ▶** (bağlı cihaz/emülatör) veya
**Build > Build APK(s)**. Çıktı: `android/app/build/outputs/apk/debug/app-debug.apk`

### Android APK — yöntem B: terminal (kendi shell'inde)
```
cd frontend/android
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
gradlew.bat assembleDebug
```

### iOS
`npx cap open ios` → Mac + Xcode gerekir (Windows'ta derlenmez).

## Sürüm / imzalama
- appId: `shop.corlukaravan.app`, appName: `Karavan`
- Play Store için release build + keystore imzalama gerekir (ayrı adım).
