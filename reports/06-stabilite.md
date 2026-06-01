# 06 — Stabilite & Dayanıklılık Raporu (Karavan Backend)

**Tarih:** 2026-06-01
**Hedef:** FastAPI backend `http://127.0.0.1:8001` (canlı MongoDB'ye bağlı)
**Kapsam:** Runtime sağlık testleri + statik dayanıklılık analizi (`backend/server.py`, ~7412 satır, 77 endpoint)
**Yöntem:** `backend/venv` içindeki `requests` ile harness; tüm GET/PDF endpoint'leri, hata/edge senaryoları, eşzamanlılık yükü; ardından kod analizi.

> Tüm yazma testleri `__STABILITY_TEST__` mantığıyla yapıldı; oluşturulan tek kalıcı kayıt (200k karakterlik test kategorisi) **test sonrası silindi**. Sistem test öncesi haline döndürüldü (kategori sayısı: 30, artık veri yok).

---

## 1. Yönetici Özeti

Sistem genel olarak **stabil ve performanslı**. 28 GET/PDF endpoint'inin tamamı 2xx döndü, hiçbiri >1 sn değil (en yavaş 0.27 sn, PDF üretimi). Pydantic validation güçlü çalışıyor: eksik/yanlış tipli/bozuk JSON girdileri düzgün **422** veriyor. 40–50 eşzamanlı istekte hata oranı **%0**, yanıt süreleri tutarlı.

Ancak **dayanıklılık açısından 3 net kusur** var:

1. **Kritik (sessiz):** Text-search index oluşturma çağrısı hatalı (`create_index` opsiyonları positional dict olarak veriliyor) → her başlangıçta `"'session' argument must be a ClientSession"` hatası fırlatıyor ve `except` ile yutuluyor. `products_text_search` index'i **hiç oluşmuyor**.
2. **Yüksek:** BackgroundScheduler thread'i `asyncio.get_event_loop()`'u worker thread içinde çağırıyor → `"no current event loop in thread"` uyarısı; döviz arka-plan güncellemesi sessizce başarısız olabiliyor.
3. **Orta:** `except Exception` blokları kendi fırlattıkları `HTTPException(404)`'ü yakalayıp **500'e çeviriyor** ve iç hata mesajını sızdırıyor (`/quotes/{id}` ve quote PDF'te doğrulandı: 404 yerine **500** döndü).

Çökme (crash) gözlenmedi; bağlantı/havuz tükenmesi gözlenmedi.

---

## 2. Runtime Test Sonuçları — Endpoint Sağlık Tablosu

| Yol | Kod | Süre | Not |
|---|---|---|---|
| `GET /` | 200 | 0.001s | |
| `GET /exchange-rates` | 200 | 0.001s | Cache'li, anında |
| `GET /companies` | 200 | 0.04s | |
| `GET /customers` | 200 | 0.04s | |
| `GET /quotes` | 200 | 0.044s | |
| `GET /categories` | 200 | 0.041s | |
| `GET /category-groups` | 200 | 0.041s | |
| `GET /packages` | 200 | 0.05s | |
| `GET /products?limit=5` | 200 | 0.081s | |
| `GET /products` (full) | 200 | 0.177s | 100 satır (pagination) |
| `GET /products/count` | 200 | 0.05s | count=302 |
| `GET /products/favorites` | 200 | 0.043s | |
| `GET /products/supplies` | 200 | 0.08s | |
| `GET /upload-history` | 200 | 0.046s | |
| `GET /auth/check` | 200 | 0.001s | |
| `GET /products/export/template` | 200 | 0.026s | XLSX (non-JSON, beklenen) |
| `GET /products/export` | 200 | 0.208s | XLSX |
| `GET /customers/{id}` | 200 | 0.041s | |
| `GET /customers/{id}/quotes` | 200 | 0.08s | |
| `GET /quotes/{id}` | 200 | 0.041s | |
| `GET /packages/{id}` | 200 | 0.165s | En ağır JSON yolu (ürün+sarf join) |
| `GET /companies/{id}/upload-history` | 200 | 0.08s | |
| `GET /upload-history/{id}` | 200 | 0.041s | |
| `GET /quotes/{id}/pdf` | 200 | 0.113s | PDF üretimi OK |
| `GET /packages/{id}/pdf-with-prices` | 200 | 0.268s | PDF, en yavaş endpoint |
| `GET /packages/{id}/pdf-without-prices` | 200 | 0.254s | PDF |
| `GET /atlas-downloads` | 404 | 0.001s | Bilinçli mi? (boş klasör → 404) |

**Yavaş (>1sn):** Yok.
**Hata veren GET:** Yok (atlas-downloads 404 — muhtemelen boş klasör).

---

## 3. Hata Yönetimi & Edge Case Bulguları

### 3.1 Validation (POST geçersiz girdi) — GÜÇLÜ
| Senaryo | Kod | Sonuç |
|---|---|---|
| Boş body `{}` (customer/quote/category/product) | **422** | ✅ Pydantic "Field required" |
| Yanlış tip (`name: 12345`, `icon: []`) | **422** | ✅ "Input should be a valid string" |
| Negatif fiyat (`list_price: -99`) | **422** | ⚠️ Eksik alan nedeniyle 422; **negatif fiyat için açık kısıt yok** (gt=0 doğrulaması bulunmuyor) |
| Bozuk JSON (`{bad json`) | **422** | ✅ "JSON decode error" |
| Unicode/emoji query (`ğüşıöç-😀`) | **200** | ✅ Sorunsuz, 0 sonuç |

### 3.2 Sınır / Not-Found — TUTARSIZ
| Senaryo | Beklenen | Gerçek | Not |
|---|---|---|---|
| `GET /quotes/nonexistent` | 404 | **500** ❌ | `{"detail":"Error fetching quote: 404: Quote not found"}` — iç mesaj sızıntısı |
| `GET /quotes/nonexistent/pdf` | 404 | **500** ❌ | `"Error generating PDF: 404: Quote not found"` |
| `GET /customers/nonexistent` | 404 | **404** ✅ | "Müşteri bulunamadı" |
| `GET /packages/nonexistent` | 404 | **404** ✅ | "Paket bulunamadı" |
| `GET /packages/nonexistent/pdf-with-prices` | 404 | **404** ✅ | |
| `GET /upload-history/nonexistent` | 404 | **404** ✅ | |

**Kök neden (server.py:2342-2344):** `except Exception as e:` bloğu, fonksiyonun kendi `raise HTTPException(404)`'ünü yakalayıp 500'e sarıyor:
```python
if not quote:
    raise HTTPException(status_code=404, detail="Quote not found")
return quote
except Exception as e:                       # ← 404'ü de yakalıyor
    raise HTTPException(status_code=500, detail=f"Error fetching quote: {str(e)}")
```
Düzeltme: `except HTTPException: raise` ile yeniden fırlat, sonra `except Exception`.

### 3.3 Çok büyük string — KISIT YOK (Orta risk)
`POST /categories` ile **200.000 karakterlik** `name` gönderildi → **200 OK**, kayıt oluşturuldu (reddedilmedi). Max-length validation yok. *(Test kaydı silindi.)* Saldırgan/yanlışlıkla devasa string'ler DB'ye yazılabilir; PDF/Excel üretiminde bellek/performans riski.

---

## 4. Yük / Eşzamanlılık

| Test | İstek/Worker | Hata | min | mean | median | p95 | max |
|---|---|---|---|---|---|---|---|
| `GET /products?limit=20` | 40 / 10 | **0** | 0.086s | 0.237s | 0.165s | 0.454s | 0.615s |
| `GET /categories` | 50 / 15 | **0** | 0.043s | 0.070s | 0.060s | 0.082s | 0.299s |
| `GET /packages/{id}/pdf-with-prices` | 8 / 4 | **0** | 0.397s | 0.415s | — | — | 0.433s |

**Yorum:** Hata oranı %0. Süreler eşzamanlılıkta lineer ve makul artıyor; bozulma/timeout yok. PDF üretimi 4 paralel istekte bile tutarlı (~0.4s) — bağlantı havuzu ve event loop sağlıklı görünüyor.

---

## 5. Statik Dayanıklılık Bulguları

### 5.1 KRİTİK — Hatalı index oluşturma → text index hiç kurulmuyor (server.py:78-89)
```python
await db.products.create_index([
    ("name", "text"), ("description", "text"), ("brand", "text")
], {                                    # ← positional 2. argüman = session olarak yorumlanıyor
    "weights": {...}, "name": "products_text_search"
})
```
Motor/PyMongo imzası `create_index(keys, session=None, **kwargs)`. Opsiyon dict'i positional verildiği için **session** sanılıyor → `"'session' argument must be a ClientSession"`. Bu çağrı satır 56'daki `try`'ın içinde olduğundan, **bu noktadan sonraki tüm index'ler atlanıyor** (ör. companies, categories, quotes, packages, customers index'lerinin bir kısmı/tamamı). Hata `except` ile yutuluyor (satır 136-139), başlangıç loglarında görülen hata budur.
**Düzeltme:** `..., name="products_text_search", weights={...})` (kwargs olarak).

### 5.2 YÜKSEK — BackgroundScheduler event-loop hatası (server.py:785-805)
```python
def _run_scheduler(self):          # ayrı thread (daemon)
    while self.running:
        asyncio.run_coroutine_threadsafe(
            currency_service.get_exchange_rates(),
            asyncio.get_event_loop()   # ← worker thread'de loop yok → RuntimeError
        )
```
`asyncio.get_event_loop()` async olmayan bir thread'den çağrıldığında Python 3.10+'da `"no current event loop in thread"` fırlatır. Try/except (803) yakalayıp 5 dk bekliyor → arka plan döviz güncellemesi **sessizce çalışmıyor olabilir**. Loglardaki uyarının kaynağı bu.
**Düzeltme:** Lifespan'de `loop = asyncio.get_running_loop()` alıp scheduler'a geçir; ya da `BackgroundScheduler`'ı tamamen `asyncio.create_task` + `asyncio.sleep` döngüsüne çevir (thread gereksiz). Not: `/exchange-rates` endpoint'i lazy-fetch yaptığı için runtime'da rates güncel kalmış (test sırasında `updated_at` = 2026-06-01), yani kullanıcıya yansımıyor ama mekanizma bozuk.

### 5.3 ORTA — `except Exception` → 404'ü 500'e çevirme & iç mesaj sızıntısı
`/quotes/{id}` (2342), quote PDF (4219 civarı) ve benzeri yerlerde geniş `except Exception` HTTPException'ı yutup `str(e)` ile iç detayı (`"404: Quote not found"`) cevaba sızdırıyor. Bölüm 3.2'de runtime'da doğrulandı.
**Düzeltme:** Her handler'da `except HTTPException: raise` öncelikli.

### 5.4 ORTA — Sessiz hata yutma (`except: pass` / bare except)
`backend/server.py`'de en az **9 adet bare `except:`** (266, 1241, 1251, 1382, 1493, 1501, 1637, 1645, 3189) ve birkaç `except Exception:` (1743, 1759, 2779, 2803, 3013, 3151) hatayı log'suz yutuyor. Index hatası (5.1) ve scheduler hatası (5.2) bu yüzden fark edilmeden çalışıyor. Hata ayıklamayı zorlaştırır, sessiz veri kaybı riski.

### 5.5 ORTA — `to_list(None)` ile sınırsız yükleme (24+ kullanım)
`db.products.find().to_list(None)` (5649 refresh-prices, 5965 export), `find().to_list(None)` companies/customers/quotes/categories vb. (706, 1851, 1919, 2045, 4141...). Şu an koleksiyonlar küçük (302 ürün) → sorun yok. Ama **veri büyüdükçe** tüm koleksiyonu RAM'e çekmek bellek baskısı ve yavaşlama yaratır. `/products` listesi pagination kullanıyor (iyi), ama `export`, `refresh-prices`, `bulk-*` ve PDF yolları sınırsız.

### 5.6 DÜŞÜK — Senkron bloklayan çağrılar event loop'ta
- `requests.get(...)` (6400, scrape-products) ve `requests.post(...)` (6676, gemini battery) **async endpoint içinde doğrudan** çağrılıyor → o istek süresince **event loop bloke** (timeout var: 30s/90s, yani en kötü ihtimalle 90 sn boyunca tek worker bloke). Yük altında diğer istekleri geciktirir.
- `urllib.request.urlopen(timeout=12)` (7201, yahoo scrape) — ama bu **doğru şekilde** `run_in_executor` ile sarılmış (7396-7397). ✅
- Battery analysis gemini çağrısı da `run_in_executor` kullanıyor (6740-6741). ✅ Yani `_call_gemini_for_battery_analysis` içindeki `requests.post` executor'da çalışıyor — bu kabul edilebilir.
- **Asıl sorun `/scrape-products` (6400):** `requests.get` executor'a sarılmamış, doğrudan async fonksiyonda → loop bloke.
**Düzeltme:** `await loop.run_in_executor(None, lambda: requests.get(...))` veya `aiohttp` kullan.

### 5.7 DÜŞÜK — `print()` kullanımı (14 yer) ve emoji'li loglar
Üretim kodunda `print(f"🌐 Scraping...")` gibi 14 `print` (örn. 6394, 6403). Windows konsolda (cp1254) emoji `UnicodeEncodeError` riski; structured logging yerine print log gürültüsü.

### 5.8 İYİ YANLAR (dayanıklılık lehine)
- **CurrencyService** (562-660): `max_retries=3`, `retry_delay` exponential backoff, `aiohttp.ClientTimeout(total=30)`, `raise_for_status` — **örnek dış-API dayanıklılığı**. Cache mevcut (DB'den okuyor, 706).
- Döviz endpoint'i runtime'da <2ms (cache hit), harici API'ye senkron bağımlılık yok.
- Index hatası ve diğer başlangıç hataları startup'ı **çökertmiyor** (graceful degrade).
- PDF üretimi eşzamanlılıkta stabil.

---

## 6. Risk Sıralaması

| # | Risk | Seviye | Etki | Konum |
|---|---|---|---|---|
| 1 | Text-search index hiç kurulmuyor (hatalı `create_index` çağrısı, sessiz) | **KRİTİK** | Ürün arama yavaş/eksik; sonraki index'ler de atlanıyor; başlangıç hatası | server.py:78-89 |
| 2 | BackgroundScheduler "no event loop" → arka plan döviz güncellemesi bozuk | **YÜKSEK** | Otomatik kur güncellemesi sessizce çalışmıyor olabilir | server.py:785-805 |
| 3 | 404'ün 500'e dönmesi + iç hata mesajı sızıntısı | **ORTA** | Yanlış HTTP semantiği, bilgi sızıntısı | server.py:2342, quote PDF |
| 4 | String/sayı sınır kontrolü yok (200k name kabul, negatif fiyat kısıtı yok) | **ORTA** | Bellek/performans, kötü veri | categories/products modelleri |
| 5 | Sessiz hata yutma (9+ bare except) | **ORTA** | Hatalar gizleniyor, debug zor | 266,1241,1251,1382,1493,1501,1637,1645,3189 |
| 6 | `to_list(None)` sınırsız yükleme | **ORTA** | Veri büyüdükçe RAM/yavaşlama | export 5965, refresh 5649, vb. |
| 7 | `/scrape-products` senkron `requests.get` event loop'ta | **DÜŞÜK** | Yük altında gecikme | server.py:6400 |
| 8 | Üretimde `print()` + emoji | **DÜŞÜK** | Log gürültüsü, encode hatası | 14 yer |

---

## 7. Önerilen Düzeltmeler (öncelik sırası)

1. **(KRİTİK) Index çağrısını düzelt** — server.py:78:
   ```python
   await db.products.create_index(
       [("name","text"),("description","text"),("brand","text")],
       name="products_text_search",
       weights={"name":10,"brand":5,"description":1},
   )
   ```
   Düzeltince başlangıç hatası kalkar ve atlanan tüm index'ler oluşur.
2. **(YÜKSEK) Scheduler'ı asyncio'ya taşı** — thread + `get_event_loop()` yerine lifespan içinde `asyncio.create_task(periodic_update())` ile `await asyncio.sleep(1800)` döngüsü. Alternatif: thread'e `loop` referansını başlatırken geçir.
3. **(ORTA) HTTPException'ı koru** — tüm handler'lara `except HTTPException: raise` ekle; `str(e)` ile iç detay sızdırma, generic mesaj döndür.
4. **(ORTA) Model kısıtları** — Pydantic alanlarına `max_length` (ör. name ≤ 200), fiyatlara `ge=0`/`gt=0` ekle.
5. **(ORTA) Sessiz except'leri logla** — bare `except:` → `except Exception as e: logger.warning(...)`.
6. **(ORTA) Sınırsız to_list'leri sınırla** — export/refresh/PDF yollarına batch/limit veya streaming.
7. **(DÜŞÜK) `/scrape-products`'taki `requests.get`'i `run_in_executor`'a sar.**
8. **(DÜŞÜK) `print()` → `logger`**, emoji'leri loglardan çıkar.

---

## 8. Test Sonrası Durum Doğrulaması

- Oluşturulan tek kalıcı kayıt (200k-Z test kategorisi, id `68decdfe-...`) **silindi**; kategori sayısı tekrar **30**, artık veri yok.
- 8001 ve 8089 servisleri **durdurulmadı/yeniden başlatılmadı**.
- Geçici test script'leri (`reports/_stab_*.py`) silindi.
- Karavan kaynak kodu **değiştirilmedi**.
