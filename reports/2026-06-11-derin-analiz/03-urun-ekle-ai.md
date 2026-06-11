# Ürün Ekle (AI) — Derin Analiz (Codex, 2026-06-11)

## Mevcut Durum

`ÜRÜN EKLE (AI)` akışı üç kaynakla çalışıyor:

- AI dosya okuma: backend/server.py:6353 `/companies/{company_id}/ai-extract-products` PDF/Excel/görsel alıyor, GPT-4o mini ile `name/brand/list_price/discounted_price/currency/description` çıkarıyor, kaydetmeden frontend'e dönüyor.
- Scraper'lar: backend/server.py:7677 Termosa B2B login+crawl, backend/server.py:7811 Agus public site crawl yapıyor. İkisi de kaydetmeden ürün listesi döndürüyor.
- Önizleme/onay: backend/server.py:6231 import session oluşturuyor, backend/server.py:6262 `/apply` ile kullanıcı onayından sonra ürünleri create/update ediyor.
- Frontend: frontend/src/App.js:1732 `createProductImportSession`, `aiExtractProducts`, `scrapeTermosaProducts`, `scrapeAgusProducts`, `aiConfirmProducts` aynı önizleme tablosuna bağlanmış. Kullanıcı satır düzenleyebiliyor, kategori atayabiliyor, `Ekle/Güncelle/Atla` seçebiliyor.
- Termosa fiyat kontrolü: backend/server.py:6106 `_run_termosa_sync_setting` ürünleri tekrar çekip import session üretir; otomatik uygulama yok, CRM'e yazma yine kullanıcı onayına bağlı.

## Eksiklikler ve Sorunlar

1. **Kritik: Termosa `source_url` tüm ürünlerde aynı, eşleşme filtresini bozuyor.**
   backend/server.py:7672 Termosa scraper her ürüne `source_url: https://bayi.termosa.com/` yazıyor. backend/server.py:6046 `_filter_termosa_products_for_company` ise mevcut ürünlerin `source_url` setinde bu değer varsa gelen tüm Termosa ürünlerini eşleşmiş sayabilir. Sonuç: "sadece mevcut ürünleri fiyat kontrol et" garantisi zayıflıyor; tek Termosa ürünü olan firmada tüm scrape sonucu önizlemeye düşebilir.

2. **Eşleşme mantığı iki aşamada tutarsız.**
   `_filter_termosa_products_for_company` isim/kod/görsel/source ile filtreliyor, ama backend/server.py:5738 `_build_import_session` sadece normalize ürün adına göre `update/create` kararı veriyor. Kod veya görselden eşleşen ama adı değişmiş ürün, önizlemede `create` olarak görünebilir. Fiyat kontrolü için en riskli yer burası.

3. **Otomatik kontrol "interval" mantığını fiilen bypass ediyor.**
   frontend/src/App.js:1217 login sonrası `autoCheckTermosaOnLogin()` çağrılıyor; backend/server.py:6210 `/supplier-sync/termosa/run-all` tüm enabled ayarları hemen çalıştırıyor, `next_run_at` kontrol etmiyor. `interval_hours` kaydediliyor ama login başına scrape tetikleniyor. Küçük işletmede bu, yavaş giriş, gereksiz Termosa trafiği ve çok sayıda önizleme session'ı demek.

4. **Import session modeli fazla gevşek.**
   backend/server.py:528 `rows: List[Dict[str, Any]]`. Satır şeması Pydantic ile doğrulanmıyor. Frontend ile backend arasında `code/source_url/action/category_id/old_price` sözleşmesi örtük. Hatalı frontend payload'ı sessizce skip, yanlış create veya eksik update üretebilir.

5. **AI çıkarım büyük dosyalarda eksik ürün çıkarabilir.**
   backend/server.py:8364 Excel metni `200000` karaktere kırpılıyor. backend/server.py:8417 PDF'te metin varsa sadece metin gönderiliyor; taranmış PDF'te en fazla 8 sayfa görüntüye çevriliyor. Uzun tedarikçi listelerinde kullanıcı "tamamı okundu" sanabilir ama veri kırpılmış olabilir.

6. **AI çıkarım ürün kodu/SKU çıkarmıyor.**
   Prompt ve normalize çıktıda `code` yok. Oysa fiyat takibinde ürün kodu en güvenilir anahtar. PDF/Excel fiyat listelerinde kod varsa kaybediliyor; sonraki güncellemeler isim eşleşmesine mahkum kalıyor.

7. **Fiyat değişim takibi var ama günlük operasyon için zayıf.**
   `upload_history.price_changes` kaydediliyor, frontend geçmişte gösteriyor; ancak "bugün ne değişti?", "hangi tedarikçide zam geldi?", "onay bekleyen fiyat değişimleri" gibi bir iş kuyruğu yok. Küçük işletme için kritik akış da tam bu.

8. **Termosa özel akış firma adına bağımlı.**
   backend/server.py:6326 `/supplier-sync/termosa/check-auto` adı "Termosa" geçen firmayı otomatik buluyor. Pratik ama kırılgan: firma adı farklıysa çalışmaz, birden fazla Termosa benzeri firma varsa belirsizdir.

9. **Scraper dayanıklılığı sınırlı.**
   Termosa CSS selector'ları ve login token formu değişirse akış kırılır. Agus Ticimax selector'ları da site temasına bağlı. Hata mesajları kullanıcıya "sayfa yapısı değişmiş olabilir" der ama hangi kategori/kaçıncı sayfa/kaç ürün alındı gibi tanı koyduracak bilgi yok.

10. **Önizleme tablosunda karar desteği eksik.**
    frontend/src/App.js:8034 özet kartları var; satırda eski fiyat ve yüzde değişim gösteriliyor. Ama filtreler yok: sadece zamlananlar, sadece yeni ürünler, sadece eşleşmeyenler, yüzde > X gibi günlük kontrol ekranı için şart olan kesitler yok.

## Yeni Özellik Önerileri

1. **Sağlam ürün eşleştirme motoru** — `supplier`, `supplier_product_id`, `supplier_sku`, `product_url`, normalize isim ve görsel URL ayrı alanlar; import session `matched_by: code/name/image/manual` göstermeli. (Orta-yüksek)
2. **Fiyat Değişim Inbox ekranı** — her sabah "hangi ürün zamlandı/ucuzladı?" görünümü; pending import sessions listesi, filtre, toplu onay/atla, yüzde eşiği. (Orta)
3. **Termosa sync gerçek zamanlayıcı mantığı** — login'de hepsini çalıştırmak yerine `next_run_at` dikkate alınmalı; due-only endpoint veya backend scheduler. (Orta)
4. **AI çıkarımda SKU/kod/kategori adayı çıkarma** — kod alınırsa sonraki listeler güvenilir eşleşir; AI kategori önerisi manuel seçimi azaltır. (Orta)
5. **Uzun dosya parçalama ve eksiklik uyarısı** — 200k karakter/8 sayfa sınırı kullanıcıya görünmeli; parçalı AI çıkarım + birleştirme + duplicate temizleme. (Orta-yüksek)
6. **Tedarikçi bazlı ayar sayfası** — her tedarikçi için kategori URL'leri, son çalışma, hata, bekleyen oturumlar, eşleşme kalitesi. (Orta)

## Hızlı Kazanımlar

- Termosa `source_url` değerini ürün detay URL'si yap; sabit `https://bayi.termosa.com/` kullanma.
- `_build_import_session` içinde sadece isim değil `code`, `image_url`, `source_url` ile de mevcut ürünü bul; satıra `matched_by` ekle.
- `/supplier-sync/termosa/run-all` içinde `next_run_at <= now` filtresi kullan veya frontend login çağrısını kaldır.
- AI prompt'a ve normalize çıktıya `code` alanı ekle.
- Önizleme tablosuna "Sadece fiyat değişenler", "Sadece yeni ürünler", "Sadece zamlananlar" filtreleri ekle.
- Import session apply öncesi `create` satırlarında aynı `code` veya aynı isim tekrarını backend'de engelle.
- Kullanıcıya AI dosya sınırını açık göster: "İlk 8 taranmış PDF sayfası / büyük Excel kırpılabilir."
- Termosa kontrol toast'ında session linki veya doğrudan "önizlemeye git" davranışı ver.
