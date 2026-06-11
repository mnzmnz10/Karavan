# Ürünler — Derin Analiz (Codex, 2026-06-11)

## Mevcut Durum

Ürün sekmesi: ürün ekleme, listeleme, kategori/firma filtresi, arama, görsel, favori, teklif seçimi/adet, inline düzenleme, silme, stok ve toplu fiyat/kategori işlemleri tek ekranda.

Backend ürün modeli (server.py:330): name, company_id, category_id, brand, description, list_price, discounted_price, currency, list_price_try, discounted_price_try, is_favorite, stock_quantity. Endpoint'ler: /products, /products/count, PATCH/PUT/DELETE /products/{id}, /products/{id}/stock, /products/bulk-update-price, /products/bulk-update-category.

Frontend: loadProducts (App.js:1337), eski Pi tablo kolonları (App.js:8802): Liste Fiyatı / Para Birimi / TL Fiyat / Stok / Toplu; indirimli kolonlar toggle.

## Eksiklikler ve Sorunlar

1. **Arama count ile liste sonucu tutarsız.** `/products/count` Mongo `$text`, `/products` regex `name/description/brand` — toplam sayı ile görünen satır ayrışabilir (server.py:6444, 6491). Text index kurulu ama liste endpoint'i kullanmıyor (server.py:84).
2. **"Firma ara" yanlış yönlendiriyor.** Placeholder "firma" diyor; backend serbest metinde firma adına bakmıyor (App.js:8502, server.py:6508).
3. **Gerçek sayfalama devre dışı.** Frontend hep `skip_pagination=true`; backend max 5000 ürün. 5000 üstü sessizce kaybolur (App.js:1023/1346, server.py:6564).
4. **Kategori temizleme tekil düzenlemede bozuk.** "Kategorisiz" → `category_id: null`; PATCH `is not None` şartıyla güncelliyor → temizlenmiyor (App.js:3247, server.py:2365).
5. **PATCH vs PUT tutarsız.** PATCH fiyat/kur değişince TL yeniden hesaplıyor; PUT hesaplamıyor → stale TL fiyat (server.py:2338, 2431).
6. **Toplu sabit fiyat artışı para birimi tehlikesi.** UI ₺ gösteriyor; backend ürünün KENDİ para birimine ekliyor — USD ürüne "+50" = +50 USD (App.js:11982, server.py:7147).
7. **Stok modeli zayıf.** Stok sadece favori ürünlerde; favoriden çıkınca stok siliniyor. Hareket geçmişi/min stok yok (server.py:4948, App.js:9050).
8. **Stok input her tuşta API çağırıyor.** onChange → updateProductStock; "125" yazarken 1, 12, 125 istekleri (App.js:9050).
9. **TL fiyat iki kaynak.** Tablo stored `list_price_try`; detay modalı canlı kur + 34/37 fallback → farklı görünebilir (App.js:9036, 11767).
10. **change_upload_currency kırılgan.** Upload ürünlerini `upload_date ± 5 dk` ile buluyor; `upload_id` alanı yok → yanlış batch riski (server.py:6821).
11. **Regex araması kaçışsız.** Arama metni doğrudan `$regex` — özel karakterler sorun (server.py:6530).
12. **formatPrice kuruş yuvarlıyor** — karşılaştırma/maliyet analizinde hassasiyet kaybı (App.js:5040).

## Yeni Özellik Önerileri

- **Tedarikçi karşılaştırma görünümü** — benzer ürünleri firma/fiyat/son güncelleme yan yana. (Yüksek)
- **Fiyat geçmişi + kur etkisi ayrımı** — "tedarikçi zam mı, kur mu?" (Orta-yüksek)
- **Stok hareketleri** — giriş/çıkış, min stok uyarısı, teklif/paket tüketimi. (Orta)
- **Ürün eşleştirme/dedupe** — marka+normalize ad+model kodu ile tedarikçiler arası bağlama. (Yüksek)
- **Toplu kur çevirme preview/undo.** (Orta)
- **Gelişmiş arama** — firma/kategori/marka/kod/favori/stok filtreleri. (Orta)
- **Satın alma listesi** — düşük stok + sık kullanılanlardan tedarikçi bazlı sipariş listesi. (Orta)

## Hızlı Kazanımlar

- /products ile /products/count arama mantığını tek helper'a taşı.
- Placeholder'dan "firma"yı kaldır ya da backend'e firma adı araması ekle.
- skip_pagination kullanımını kaldır, gerçek sayfalama/sonsuz scroll.
- PATCH'te `category_id: null` → kategori temizle ($unset).
- PUT fiyat güncellemesini kaldır ya da PATCH ile aynı TL hesabını yap.
- Toplu sabit artış modalına "ürünün kendi para biriminde" uyarısı.
- Stok input onBlur/debounce.
- Ürünlere upload_id yaz; tarih-aralığı tahminini bırak.
