# Karavan — Teknik Borç & Mimari Refactor Raporu

> Hazırlayan: Ana asistan (sub-agent'lara paralel, örtüşmeyen alan).
> Tarih: 2026-06-01. Bu rapor *kod kalitesi / sürdürülebilirlik* odaklıdır; fonksiyonel eksiklikler `01`, güvenlik `02`, tasarım `03`, kablo şeması `04` raporlarında.

## 1. Yönetici Özeti

Proje çalışır ve özellik açısından zengin, ancak **iki "god-file" üzerinde duruyor** ve bu, en büyük teknik borç. Bakım, yeni özellik ekleme ve hata ayıklama bu iki dosyanın boyutu yüzünden giderek pahalılaşıyor. Yeni "Kablo Şeması" sekmesi eklenmeden önce en azından frontend'de modüler bir iskelet kurmak, ileride katlanan maliyeti ciddi düşürür.

| Metrik | Değer | Yorum |
|--------|-------|-------|
| `backend/server.py` | **7.412 satır** | 77 endpoint + 44 Pydantic/servis sınıfı tek dosyada |
| `frontend/src/App.js` | **8.328 satır** | Tek React bileşeni, **152 useState/useEffect** |
| Kök dizinde ad-hoc test | **18 adet `test_*.py`** | Otomatik koşulmuyor, CI yok |
| TODO/FIXME | 0 | İyi ama muhtemelen borç işaretlenmemiş |
| Bileşen ayrımı | 3 (`LazyImage`, `VirtualizedTable`, `ui/`) | Geri kalan her şey App.js içinde |

**En kritik 3 borç:** (1) `App.js` tek bileşen + 152 hook — state izlenemez hale geliyor; (2) `server.py` katmansız — modeller/servisler/router/PDF iç içe; (3) test otomasyonu yok — her değişiklik regresyon riski.

---

## 2. Backend (`server.py`) — Mevcut Yapı

Tek dosyada şu katmanlar iç içe duruyor:

**Pydantic modelleri (~30 sınıf):** Company, Product, Category, CategoryGroup, Customer, Package(+Product/Supply), Quote, ExchangeRate, User/Login, BatteryReport, BulkUpdate*, Scrape* … Üstelik bazıları kod ortasında tanımlı (`ProductUpdate` satır 2059, `BulkUpdatePriceRequest` 6046, `BatteryReportItem` 6761) — model tanımları dağınık.

**Servisler:** `CurrencyService` (555), `BackgroundScheduler` (765), `AuthService` (814), `ColorBasedExcelService` (905), `ExcelService` (1283), `PDFQuoteGenerator` (2515), `PDFPackageGenerator` (3614).

**Endpoint grupları (77 toplam):** products 17 · packages 16 · customers 7 · quotes 6 · companies 5 · category-groups 5 · categories 5 · upload-history 3 · auth 3 · exchange-rates 2 · battery-analysis 2 · atlas-downloads 2 · scrape/refresh/market-price 1'er.

### Önerilen modüler yapı (kademeli, davranışı değiştirmeden)
```
backend/
  app/
    main.py                # FastAPI app, router include, lifespan
    config.py              # env/Settings (pydantic-settings)
    db.py                  # Mongo client + get_db
    models/                # product.py, category.py, package.py, quote.py, customer.py, battery.py, auth.py
    routers/               # products.py, packages.py, quotes.py, categories.py, customers.py,
                           # companies.py, category_groups.py, exchange.py, battery.py, auth.py, uploads.py
    services/
      currency.py          # CurrencyService
      scheduler.py         # BackgroundScheduler
      auth.py              # AuthService
      excel/               # excel_service.py, color_based.py
    pdf/
      base.py              # ortak stiller/font/_format_price/_draw_page_decorations
      quote.py             # PDFQuoteGenerator
      package.py           # PDFPackageGenerator
      battery.py           # _build_battery_report_pdf
```
**Geçiş stratejisi (düşük risk):** Önce modelleri `models/`e taşı (saf veri, yan etkisiz). Sonra `APIRouter`'ları grup grup ayır (products → packages → …). Servisleri en son. Her adımda lokal 8001 + 8089 ile smoke test. **Tek seferde değil, PR-PR.**

### Backend'de gözle görülür borçlar
- **Çift kaynak riski:** kökte `server.py` (7020 satır) + `backend/server.py` (7412) **divergent** kopyalar var. Hangisinin canlıda olduğu netleşmeli; biri silinmeli (bkz. checkpoint notları). Bu, "değişiklik canlıda görünmüyor" sınıfı hataların kaynağı.
- **Ölü/atıl kod:** cache mekanizması ("ölü kod ama zararsız" olarak işaretlenmişti) — ya gerçekten devreye alınmalı ya kaldırılmalı. `invalidate_cache` çağrıları gerçek bir cache'i mi besliyor doğrulanmalı.
- **PDF jeneratörleri:** quote yeni kurumsal tasarıma geçti ama `PDFPackageGenerator` hâlâ eski "modern" stilde — iki ayrı tasarım dili. Ortak `pdf/base.py` ile birleştirilmeli.
- **Eski/atıl quote helper'ları:** `_create_modern_header`, `_create_quote_info_section`, `_create_modern_totals_section`, `_create_footer_notes_box`, `_create_modern_products_table` artık quote akışında kullanılmıyor ama paket hâlâ bazılarını çağırıyor — silmeden önce paket bağımlılığı çözülmeli.
- **Senkron iş kod yolunda:** scraping / market-price / Excel parse gibi ağır işler endpoint içinde senkron çalışıyorsa event loop'u bloklar (doğrulanmalı; varsa `run_in_executor`/arka plan görevi).

---

## 3. Frontend (`App.js`) — Mevcut Yapı

**8.328 satır tek bileşen, 152 useState/useEffect.** Bu, React'te sürdürülebilirlik sınırının çok ötesinde. Belirtiler: aynı state'in birden çok yerde güncellenmesi, prop drilling yokluğu (çünkü her şey aynı scope'ta), bir değişikliğin beklenmedik yeri etkilemesi, yeniden render maliyeti.

### Önerilen ayrıştırma
```
frontend/src/
  App.js                 # yalnız routing/tab kabuğu + global provider'lar (~200 satır hedef)
  context/               # AppDataContext (products, categories, rates) — fetch + cache tek yerde
  hooks/                 # useProducts, useCategories, usePackages, useQuotes, useExchangeRates, useDebounce
  features/
    products/            # ProductsTab, ProductTable, ProductForm, ProductCard
    categories/          # CategoriesTab, CategoryDialog, CategoryImagePicker
    packages/            # PackagesTab, PackageBuilder
    quotes/              # QuotesTab, QuoteBuilder, QuoteList (teklif no rozeti burada)
    battery/             # BatteryAnalysisTab
    wiring/              # ← yeni "Kablo Şeması" sekmesi BURAYA (temiz başlangıç)
  lib/
    api.js               # axios instance + endpoint sarmalayıcıları (tek API katmanı)
    format.js            # formatPrice, quoteNo üretimi (QT-xxxx — şu an inline, tekrarlanıyor)
```
**Hızlı kazanım:** "Kablo Şeması" sekmesini App.js'e gömmek yerine `features/wiring/` altında ayrı bileşen olarak ekleyin — App.js'i daha da şişirmeden temiz bir hücre açar ve modülerleştirmenin ilk taşı olur.

### Frontend'de gözle görülür borçlar
- **Tek API katmanı yok:** `axios.get/post(\`${API}/...\`)` çağrıları bileşene dağılmış. `lib/api.js` ile merkezileştirilirse hata yönetimi/retry/auth header tek yerden yönetilir.
- **Tekrarlı mantık:** Teklif no (`QT-` + id ilk 8 hane) hem PDF (backend) hem liste kartında (frontend) ayrı ayrı üretiliyor — `lib/format.js`'te tek fonksiyon olmalı, ileride format değişirse iki yer.
- **Cache yönetimi:** `CacheManager` + manuel `loadCategories/loadProducts` çağrıları — React Query/SWR ile invalidation otomatikleşir, "kaydettim ama listede görünmüyor" sınıfı hataları azaltır.
- **Performans:** `VirtualizedTable` ve `LazyImage` var (iyi), ama 152 hook'lu tek bileşende gereksiz render'lar muhtemel; `React.memo` + context bölme gerekli.

---

## 4. Test & CI

- Kökte **18 adet `test_*.py`** var ama bunlar ad-hoc script (manuel çalıştırılan, assert yerine print ağırlıklı muhtemel). Otomatik koşulmuyor, CI yok.
- **Öneri:** `backend/tests/` altında `pytest` + `httpx.AsyncClient` ile en kritik akışları (teklif oluşturma → toplam hesaplama → PDF üretimi; döviz çevrimi; Excel import; kategori CRUD + image_url) kapsayan ~15-20 test. Mongo için `mongomock-motor` veya test container.
- Frontend için en azından teklif hesaplama/format yardımcıları için Vitest/RTL birim testleri.
- **Hızlı CI:** GitHub Actions — push'ta `pytest` + `yarn build` (build kırılmasını yakalar; bu oturumda build'i sık manuel aldık, otomatikleşmeli).

---

## 5. Konfigürasyon & Dağıtım Borcu

- **Deploy belirsizliği:** Lokal değişikliklerin canlıya (Raspberry Pi) gitmesi manuel ve hangi `server.py`'nin çalıştığı net değil. Bu yapısal bir sorun: "kategori görsel kaydetmiyor / PDF değişmiyor" şikayetlerinin kök sebebi deploy gecikmesiydi.
- **Öneri:** Pi'de tek kaynak (tercihen `backend/server.py`), `git pull` + servis restart'ı tek script (`deploy.sh`) ya da systemd + webhook ile yarı-otomatik. `start.sh`, `nginx.conf`, `raspberry_pi_setup.md` zaten var — bunlar tek bir "DEPLOY.md" altında toplanmalı.
- `.env` örneği (`/.env.example`) repoya eklenmeli (değerler olmadan) — yeni kurulum için.
- Kökte dağınık `*.json` veri yedekleri, `*.xlsx`, debug script'leri (`debug_*.py`, `fix_*.py`) → `scripts/` ve `samples/` altına toplanmalı; repo kökü çok kalabalık.

---

## 6. Önceliklendirilmiş Refactor Yol Haritası

**Şimdi yapılmalı (Kablo Şeması'ndan ÖNCE, düşük risk yüksek getiri):**
1. Kök vs `backend/server.py` ikiliğini çöz — tek kaynak. *(Yarım gün, kritik)*
2. `frontend/src/lib/api.js` + `lib/format.js` oluştur, teklif-no ve API çağrılarını oraya al. *(Yarım gün)*
3. Yeni "Kablo Şeması" sekmesini `features/wiring/` altında ayrı bileşen olarak ekle (App.js'e gömme). *(Entegrasyonla birlikte)*

**Kısa vade (1-2 hafta):**
4. Backend modelleri `models/`e taşı; router'ları gruplara böl. *(Kademeli)*
5. En kritik 15 akış için pytest + GitHub Actions CI.
6. PDF jeneratörlerini `pdf/base.py` ile birleştir, paket PDF'ini quote ile aynı tasarıma çek.

**Orta vade (1 ay):**
7. App.js'i `features/` mimarisine kademeli böl; React Query'ye geç.
8. Yarı-otomatik deploy (deploy.sh / systemd).
9. Ölü cache kodunu temizle veya gerçekten devreye al.

---

## 7. Özet Tavsiye

Yeni özellik (Kablo Şeması) eklemeden önce **iki küçük ama kritik temizlik**: (a) çift `server.py` ikiliğini bitir, (b) frontend'de minimal `lib/` + `features/` iskeleti kur. Bu ikisi olmadan her yeni sekme god-file'ları biraz daha büyütüp borcu katlar. Büyük refactor'a girişmeden, "yeni kod temiz adada başlasın" prensibi en yüksek getiriyi verir.
