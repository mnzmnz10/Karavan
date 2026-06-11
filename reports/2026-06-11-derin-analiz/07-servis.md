# Servis — Derin Analiz (Codex, 2026-06-11)

## Mevcut Durum

ServiceRecord (server.py:609): müşteri/araç, items, base64 photos, collections, garanti, durum. CRUD + history + PDF (server.py:9633/9689/11825; PDFServiceGenerator server.py:11603 — lacivert banner A4 teslim formu, tahsilatlar PDF'e konmuyor). Frontend: liste, detay önizleme, foto galeri, tahsilat paneli, durum filtresi, çekme karavan/plaka ayrımı, tekliften servise (App.js:2190/2243/2404/10421).

## Eksiklikler ve Sorunlar

1. **İş emri numarası sıralı DEĞİL.** Yorum İŞ-0001 diyor (server.py:611) ama `_next_service_order_no` rastgele İŞ-100000..999999 üretiyor (server.py:9662). Telefonda referans/arşiv için zayıf. `order_no` unique index yok → eşzamanlı çakışma riski.
2. **Durum akışı iş kuralı değil.** Backend sadece enum kontrol (server.py:9717); geçiş kuralı yok — doğrudan teslim, teslimden geri dönüş, eksik ödemeyle teslim mümkün. Frontend tek buton ilerletiyor (App.js:2390, 11006) ama backend garanti etmiyor.
3. **advance→collections göçü yarım, ÇİFT SAYIM riski.** Migrate sadece edit açılırsa kalıcı (App.js:2294); hesaplar hâlâ `advance + collections` topluyor (App.js:10753, 10944) — ikisi de doluysa tahsilat 2× sayılır. Backend migration yok.
4. **Çoklu para tahsilat kuru sabitlenmiyor.** rate opsiyonel (server.py:602); boşsa güncel kur (App.js:2235) → geçmiş tahsilatın TL karşılığı kur değiştikçe DEĞİŞİR.
5. **Fotoğraflar Mongo'da base64.** GET /services 1000 kaydı fotoğraflarla döndürüyor (server.py:9645) — performans + belge limiti.
6. **Garanti alanları UI'da görünmüyor.** State+payload+PDF'te var (App.js:602/2352, server.py:11753) ama formda aktif giriş yok.
7. **Geçmiş araç eşleme zayıf.** Plaka birebir regex, çekmede müşteri adı birebir (server.py:9689); telefon/normalize plaka/VIN/müşteri ID yok.
8. **Tekliften servise dönüşüm iz bırakmıyor.** sendQuoteToService form dolduruyor; teklife converted/service_id yazılmıyor (App.js:2404).
9. **Test yok** — CRUD/status/history/PDF/migration testi bulunmuyor.

## Yeni Özellik Önerileri

1. **Sıralı iş emri sayacı** — atomik counter, yıl bazlı İŞ-2026-0001. (Orta)
2. **Servis yaşam döngüsü + zaman çizelgesi** — parça bekliyor/müşteri onayı durumları, status history. (Orta-yüksek)
3. **Randevu/günlük iş panosu** — takvim, geciken işler. (Orta)
4. **Müşteri iletişim günlüğü** — "arandı, onay bekleniyor". (Orta)
5. **Harici foto depolama + thumbnail.** (Orta)
6. **Garanti takip ekranı** — bitiş tarihi, filtre, tekrar gelen arıza. (Düşük-orta)

## Hızlı Kazanımlar

- order_no'yu sıralı yap ya da yorumu düzelt; unique index ekle.
- GET /services'ten full base64 fotoğrafları çıkar (photo_count/ilk thumbnail).
- advance+collections çift sayımını tek helper'da normalize et.
- Döviz tahsilatında kur kayıt anında SABİTLENSİN.
- Garanti + ödeme hesabı alanlarını formda görünür yap.
- Tekliften dönüşümde quote'a converted_to_service_id + converted_at yaz.
- Backend smoke testleri (CRUD/status/history/PDF/migration).
