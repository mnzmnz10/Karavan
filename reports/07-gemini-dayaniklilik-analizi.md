# Karavan — Gemini Dayanıklılık Analizi (server.py)

> Kaynak: Google Gemini 2.5 Pro (1M context) ile `backend/server.py` (7412 satır) tam-dosya statik analizi. Token tasarrufu için ana asistan dosyayı okumadan Gemini'ye devretti.
> Tarih: 2026-06-01. Runtime/test bulguları için `06-stabilite.md`'ye bakın (tamamlayıcı).

## Genel Değerlendirme (Gemini)

Kod, production zorluklarına karşı **düşünceli yazılmış**; veritabanı performansı, dış servis iletişimi ve hata yönetiminde sağlam. En belirgin riskler: **in-memory oturum yönetimi** ve **Excel renk-bazlı yorumlama kırılganlığı**.

---

## ✅ Güçlü Yönler (korunmalı)

1. **Gelişmiş DB indeksleme (~54–163):** compound + weighted text search + sparse indeksler. Veri büyüse de sorgular hızlı kalır.
2. **Dayanıklı döviz servisi (`CurrencyService`, ~646–856):** retry (`max_retries`) + timeout (`api_timeout`) + çok katmanlı fallback (API → DB'deki son kurlar → koda gömülü `default_rates`). Döviz API'si çökse bile fiyat hesaplama çalışır. **Ders niteliğinde.**
3. **Sağlam lifespan yönetimi (~177–200):** başlangıçta index + varsayılan kategori, kapanışta `background_scheduler.stop()` ile temiz sonlanma.
4. **Bloklamayan arka plan görevleri (`BackgroundScheduler`, ~859–895):** döviz güncelleme ayrı thread'de, event loop'u bloklamıyor (Raspberry Pi için kritik).
5. **Kapsamlı hata yönetimi:** neredeyse tüm endpoint'ler `try/except` + anlamlı `HTTPException`; Pydantic ile girdi doğrulama.

---

## ⚠️ Riskler ve İyileştirmeler

### 1. In-Memory Oturum Yönetimi (~901–933) — ORTA/YÜKSEK
`AuthService` oturumları `self.sessions` sözlüğünde (RAM) tutuyor. Sunucu restart/çökme/elektrik kesintisinde **tüm oturumlar düşer**, herkes yeniden giriş yapar. Multi-worker'da tutarsız.
**Öneri:** Oturumları Redis veya MongoDB `sessions` koleksiyonunda kalıcı sakla. *(Bu bulgu 01, 02 ve 06 raporlarında da bağımsız doğrulandı.)*

### 2. Kırılgan Excel Renk-Bazlı Yorumlama (~988–1550) — YÜKSEK
`ColorBasedExcelService` hücre arka plan rengine (`'FFFF0000'`, `theme == 2`) göre veri yorumluyor. Kullanıcı dosyayı farklı Office sürümünde kaydederse renk RGB/tema kodu değişir (`FFFF0000` → `FF0101` olabilir) → yorumlayıcı sessizce başarısız olur. **Uygulamanın en kırılgan noktalarından biri.**
**Öneri:** Birincil yöntem sütun başlığı metni (`'Ürün Adı'`, `'Liste Fiyatı'`) olsun; renk sadece fallback. Bu, import güvenilirliğini ciddi artırır.

### 3. Güvensiz Cache Middleware (~274–308) — POTANSİYEL HATA (önemli)
`cache_middleware`, yanıtı önbelleğe alırken `response.body`'i okuyor. Starlette'de `response.body` **bir kez okunabilen stream**'dir. Kod body'yi okuyup cache'e atıyor ama orijinal `response`'u istemciye gönderiyor → stream tüketilmiş olabileceğinden **istemciye boş/eksik gövde gidebilir** (özellikle cache'e ilk yazımda). Koddaki `hasattr` + `try/except pass` blokları, geliştiricinin bu sorunla boğuştuğunu ama tam çözemediğini düşündürüyor.
**Öneri:** Elle yazılmış cache middleware'i kaldır; `fastapi-cache2` gibi test edilmiş kütüphane kullan. *(Not: 05 raporundaki "ölü/şüpheli cache kodu" ile örtüşüyor — bu cache mekanizması ya düzgün kurulmalı ya tamamen kaldırılmalı.)*

### 4. Büyük Excel'de Yüksek Bellek Kullanımı (~1205, ~1374) — ORTA
Hem `ExcelService` hem `ColorBasedExcelService` dosyayı `BytesIO` + `pandas.read_excel`/`openpyxl.load_workbook` ile **tamamen RAM'e** yüklüyor. 100MB+ dosya, Raspberry Pi'nin sınırlı belleğinde sunucuyu çökertebilir.
**Öneri:** `openpyxl` `read_only=True` modu veya satır-satır streaming; ayrıca upload boyut limiti (bkz. 02-güvenlik raporu, upload doğrulama).

---

## Çapraz Doğrulama Notu

Bu Gemini analizi, diğer agent raporlarıyla bağımsız olarak şu noktalarda **örtüştü** (güven artırıcı):
- In-memory oturum riski → `01`, `02`, `06`
- Cache mekanizmasının sorunlu/atıl olması → `05` (teknik borç)
- Upload doğrulama eksikliği → `02` (güvenlik)

**Not:** Gemini güvenlik tarafında auth eksikliğini bu çağrıda vurgulamadı (odak dayanıklılıktı); auth için `02-guvenlik.md` esastır.
