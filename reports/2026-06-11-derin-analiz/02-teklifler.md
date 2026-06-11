# Teklifler — Derin Analiz (Codex, 2026-06-11)

## Mevcut Durum

Teklif oluşturucu tek ekran: A4 canlı alan, ürün arama/sepet, adet, sürükle-sırala, özel birim fiyat, manuel kalem, indirim %, işçilik, notlar, kayıtlı teklif paneli. Taslak localStorage (App.js:793, 832). Backend /quotes CRUD + soft-delete + /quotes/{id}/pdf (PDFQuoteGenerator, PowerTrail lacivert; server.py:3029, 4561). customer_id quote_doc'a yazılıyor (eski bug düzelmiş, server.py:2616).

## Eksiklikler ve Sorunlar

1. **Teklif yaşam döngüsü yok.** Sadece active/deleted; taslak/gönderildi/onaylandı/reddedildi/süresi doldu/servise dönüştü yok (server.py:579). `sendQuoteToService` teklife converted/service_id yazmıyor (App.js:2404). Teklif→satış dönüşümü ölçülemiyor.
2. **Müşteri entegrasyonu yarım.** customer_name çoğu akışta boş → PDF "Bireysel Müşteri" gösterebilir (App.js:3852, server.py:3200). Teklif yüklerken selectedQuoteCustomer geri set edilmiyor; arama customer_id üzerinden müşteri adına bakmıyor (App.js:9927). Servise aktarımda telefon taşınmıyor.
3. **Maliyet/kâr hesabı güvenilir değil.** Frontend kâr kartı doğru niyetli (App.js:4826) ama backend `total_discounted_price`yi satış liste fiyatına eşitliyor, gerçek geliş toplamı saklanmıyor (server.py:2574, 2764). Kayıtlı tekliflerde marj analizi yanlış/imkânsız.
4. **WYSIWYG iddiası zayıf.** Ekran emerald, PDF lacivert. Kullanıcı notları PDF NOTLAR & ŞARTLAR'a basılmıyor — `_create_notes_section_full` sabit metin (server.py:3375).
5. **Güncelleme davranışı şaşırtıcı.** Ad değişince update yerine YENİ teklif oluşuyor (App.js:3815) → pazarlıkta kopya teklifler. PDF indirme yolunda müşteri bağı kopabilir (App.js:9760).
6. **Ürün sırası + sessiz kalem kaybı.** Create, Mongo `$in` sırasıyla işliyor → sürükle-sırala sırası PDF'te bozulabilir (server.py:2532). Update'te DB'de bulunamayan ürün sessizce düşüyor (server.py:2781).
7. **Validasyon zayıf.** İndirim ≤100, işçilik ≥0, adet >0 backend kısıtları yok (server.py:557). HTTPException genel except'le 500'e sarılabiliyor (server.py:2633).
8. **Performans.** /quotes sınırsız; arama frontend'de tüm liste üzerinden (server.py:2637, App.js:1302). Veri büyüyünce hissedilir.

## Yeni Özellik Önerileri

- **Teklif pipeline'ı**: taslak/gönderildi/onaylandı/reddedildi/dönüştü — dönüşüm takibi. (M)
- **Müşteri 360 ekranı**: teklifler+servisler+tahsilatlar+hızlı yeni teklif. (M)
- **Teklif gönderim takibi**: WhatsApp/e-posta tarihi, görüntülendi/onaylandı. (M/L)
- **Quote snapshot v2**: kur, satış, maliyet, kâr, marj, ürün sırası, geçerlilik ayrı saklansın. (M)
- **Şablonlar + revizyonlar**: hazır paketler, v1/v2 pazarlık geçmişi. (M)
- **Dashboard**: açık teklif tutarı, kazanılan/kaybedilen, en kârlı gruplar. (M)

## Hızlı Kazanımlar

1. PDF müşteri adını customer_id lookup ile bas; yüklerken setSelectedQuoteCustomer ekle.
2. sendQuoteToService sonrası teklifi converted işaretle + service_id bağla.
3. QuoteCreate validasyonları: indirim 0-100, işçilik ≥0, adet >0.
4. total_cost_price / gross_profit / margin_percent / kur snapshot alanları ekle.
5. PDF notlar bölümü quote.notes'u göstersin.
6. /quotes'a status/customer_id/search/limit/offset param'ları; aramayı backend'e taşı.
7. saveQuote güncelleme kararını ada değil loadedQuote.id'ye bağla.
