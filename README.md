# Kontrol Merkezi — iOS kabuğu

LKM'nin telefon arayüzünü iPhone'da uygulama olarak açan Capacitor 8 kabuğu. Uygulamanın içinde arayüz yok: açılınca `https://mnz-home.silverside-elnath.ts.net` adresini yükler. Bu adres yalnızca telefon Tailscale ağındayken açılır. Ulaşılamazsa uygulamaya gömülü `www/offline.html` gösterilir.

| Ayar | Değer |
|---|---|
| Bundle ID | `com.mnzmnz10.lkm` |
| Görünen ad | Kontrol Merkezi |
| Sürüm | 1.0.0 (build no = GitHub `run_number`) |
| Sunucu | `server.url` + `server.errorPath: offline.html` |
| Derleme | GitHub Actions `macos-latest`, `.github/workflows/ios-testflight.yml` |

Mac gerekmiyor. İmzalama ve yükleme Karavan'daki akışın aynısı: App Store Connect API anahtarıyla `xcodebuild -allowProvisioningUpdates`.

## Sabah yapılacaklar

### a) App Store Connect'te uygulama kaydı

1. Bundle ID'yi elle kaydetmeye gerek yok. İş akışı `com.mnzmnz10.lkm` kayıtlı değilse API ile kaydediyor ("Verify API key + bundle ID + app record" adımı). İstersen önceden developer.apple.com → Identifiers → + ile de açabilirsin.
2. Uygulama kaydını ise API açamıyor, bir kez elle açman gerekiyor. https://appstoreconnect.apple.com → Uygulamalar → **+** → Yeni Uygulama:
   - Platform: iOS
   - Ad: **Kontrol Merkezi** (ad başka bir geliştiricide kayıtlıysa "Kontrol Merkezi LKM" gibi bir ad seç; telefondaki ad Info.plist'ten gelir, değişmez)
   - Birincil dil: Türkçe
   - Paket Kimliği: `com.mnzmnz10.lkm` (listede yoksa önce iş akışını bir kez çalıştır: bundle ID'yi kaydeder, sonra "uygulama kaydı yok" hatasıyla durur. Kaydı açıp yeniden çalıştır.)
   - SKU: `lkm-ios`
   - Kullanıcı erişimi: Tam erişim

### b) Özel GitHub deposu ve push

```powershell
cd "C:\Users\Mehmet Necdet\Documents\ChatGPT\lkm-ios"
gh repo create lkm-ios --private --source . --remote origin --push
```

### c) Secret'lar (Karavan deposundakilerle aynı değerler)

Her komut değeri sorar, yapıştırıp Enter'a bas. `ASC_KEY_P8` için dosyadan okutmak daha güvenli:

```powershell
gh secret set APPLE_TEAM_ID
gh secret set ASC_KEY_ID
gh secret set ASC_ISSUER_ID
Get-Content -Raw "C:\yol\AuthKey_XXXXXXXXXX.p8" | gh secret set ASC_KEY_P8
```

Kontrol: `gh secret list` dört adı göstermeli.

### d) Derlemeyi başlat

```powershell
git tag ios-1
git push origin ios-1
```

Ya da `gh workflow run "iOS TestFlight"`. İzlemek için `gh run watch`. Süre yaklaşık 10–15 dakika, sonra Apple'ın işlemesi 5–15 dakika daha sürer. Sonraki sürümlerde `ios-2`, `ios-3` ... etiketlerini kullan. Build numarası otomatik artar.

### e) TestFlight

App Store Connect → Kontrol Merkezi → TestFlight → **Dahili Test** → grup oluştur (ör. "Ben") → kendini ekle → build'e erişim ver. Bunu otomatik yapan iş akışı da var: `gh workflow run "TestFlight internal group"` (App Store Connect kullanıcılarını "Ben" iç grubuna ekler). iPhone'da TestFlight uygulamasından kur.

## Neden bu ayarlar

- **`Keyboard.resize: "native"`**: Telefon arayüzünün kabuğu `height: 100dvh; overflow: hidden`, sohbet yazma alanı da `position: fixed` ile altta. `native` modunda klavye açılınca WKWebView'in çerçevesi klavyenin üstüne kadar küçülür. Görünür alan, `100dvh` ve sabit konumlu öğeler birlikte küçülür; yazma alanı klavyenin hemen üstünde kalır, sayfaya JS eklemek gerekmez. `body` modu yalnızca `<body>` yüksekliğini değiştirir. Viewport'a bağlı `position: fixed` öğeler ve `100dvh` bunu görmez, yazma alanı klavyenin altında kalır. `none` modunda iOS sayfayı yukarı iter, sabit öğeler kayar. `autoBackdropColor: "auto"` klavye animasyonu sırasında arkada siyah şerit yerine `#eef1f7` gösterir.
- **`ios.scrollEnabled: false`**: Arayüz kendi iç kaplarını (`.main-surface`, sohbet listesi) kaydırıyor. Dış kaydırma kapalı olduğu için sayfa bütün olarak esnemiyor. İç `overflow: auto` kaplar etkilenmiyor.
- **`contentInset: "never"` + `StatusBar.overlaysWebView: true`**: Sayfa ekranın tamamını kullanır, çentik ve ana ekran çizgisi boşluklarını CSS `env(safe-area-inset-*)` ile kendisi bırakır. Durum çubuğu stili `LIGHT`: açık zemin üzerinde koyu yazı.
- **`allowNavigation`**: Yalnız LKM adresi uygulama içinde açılır, diğer bağlantılar Safari'ye gider.
- **`www/index.html`**: `server.url` varken yüklenmez, `cap sync` webDir içinde index.html istediği için duruyor.
- `ITSAppUsesNonExemptEncryption = false`: TestFlight her build'de ihracat uyumluluğu sormaz.

## Sorun giderme

- **"Bilgisayara ulaşılamıyor" ekranı**: Telefonda Tailscale kapalı, bilgisayar uykuda, LKM kapalı ya da LKM'de Ayarlar → Telefon erişimi kapalı olabilir. Sayfa 8 saniyede bir sunucuyu yokluyor ve ulaşınca kendiliğinden açılıyor; "Tekrar dene" hemen dener. Tailscale açık ama bilgisayar kapalıysa sayfanın gelmesi WKWebView zaman aşımı yüzünden bir dakikayı bulabilir.
- **İlk açılışta eşleştirme kodu**: Telefon ilk bağlandığında LKM eşleştirme kodu ister. Kodu bilgisayarda LKM → Ayarlar → Telefon bölümünden al.
- **Service worker / PWA önbelleği**: Uygulama içi WKWebView'de service worker çalışmaz (App-Bound Domains gerekir). Arayüz zaten her açılışta sunucudan geldiği için bu beklenen bir durum. Sayfa `navigator.serviceWorker` kaydı başarısız olsa da çalışmalı.
- **İş akışı hataları**: "API key rejected" çıkarsa secret değerlerini ve anahtarın Admin rolünde olduğunu kontrol et. "uygulama kaydı yok" çıkarsa (a) adımını yap. İmza hatasında Karavan'da çalışan anahtarın aynısının girildiğinden emin ol.

## Yerelde (Windows)

```powershell
npm install
npm run typecheck   # capacitor.config.ts tip denetimi
npx cap sync ios    # www → ios/App/App/public + capacitor.config.json
npx cap doctor
```

`ios/` klasörü Windows'ta `npx cap add ios` ile üretildi (Capacitor 8, Swift Package Manager; CocoaPods yok). Elle yapılan değişiklikler: Info.plist'e `ITSAppUsesNonExemptEncryption=false`, `UIStatusBarStyle`, `CFBundleDevelopmentRegion=tr`; `MARKETING_VERSION = 1.0.0`; uygulama simgesi (LKM PWA simgesinden 1024 px, opak) ve düz `#eef1f7` açılış görseli.
