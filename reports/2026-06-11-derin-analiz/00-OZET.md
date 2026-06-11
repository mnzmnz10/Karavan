# Derin Analiz — Yönetici Özeti (2026-06-11)

10 ajan analizi (tamamı Codex/GPT-5; Gemini MCP trust hatası nedeniyle bu oturumda devre dışıydı). Her bölümün tam raporu kendi dosyasında.

## Dosyalar

| # | Rapor | En kritik bulgu |
|---|---|---|
| 01 | [Ürünler](01-urunler.md) | Sayfalama fiilen kapalı (5000 limit, sessiz kayıp); toplu sabit fiyat artışı para birimi tehlikesi; kategori temizleme bozuk |
| 02 | [Teklifler](02-teklifler.md) | Teklif yaşam döngüsü yok (dönüşüm ölçülemez); kâr hesabı kayıtta güvenilmez; ad değişince kopya teklif |
| 03 | [Ürün Ekle AI](03-urun-ekle-ai.md) | Termosa source_url hep aynı → eşleşme filtresi bozuk; AI kod/SKU çıkarmıyor; login'de interval bypass |
| 04 | [Akü Test](04-aku-test.md) | Testler kalıcı kaydedilmiyor (geçmiş/trend yok); XSS riski (dangerouslySetInnerHTML); UI yanlış model adı |
| 05 | [MPPT](05-mppt.md) | Akım yuvarlama "en yakın 10" → 54A'ya 50A önerebilir (bir üst olmalı); 12V kilidi; isimden parse hatalı eşleşme |
| 06 | [Kablo Şeması](06-kablo-semasi.md) | Elektriksel hesap motoru yok (kesit/sigorta/gerilim düşümü); autosave yok; PDF kırılgan |
| 07 | [Servis](07-servis.md) | İş emri no rastgele (sıralı değil); advance+collections ÇİFT SAYIM riski; tahsilat kuru sabitlenmiyor |
| 08 | [Sözleşmeler](08-sozlesmeler.md) | Düzenlenmiş Excel indirme tahsilat/teslim tarihini KAYBEDİYOR; data şemasız; 25MB upload vs 16MB Mongo limiti |
| 09 | [Güvenlik](09-guvenlik.md) | P1×5: remove-bg SSRF, redirect SSRF, regex injection, /downloads auth dışı, rol modeli yok |
| 10 | [Stabilite](10-stabilite.md) | P0×4: PDF event-loop blokajı, sınırsız to_list, base64 şişmesi, default executor karmaşası |

## Çapraz-modül ortak temalar

1. **Veri kalıcılığı/finans doğruluğu**: tahsilat kuru sabitlenmiyor (servis+sözleşme), kâr snapshot'ı yok (teklif), Excel regenerate veri kaybediyor (sözleşme). → Para hareketi olan her kayıtta kur+tutar+tarih SNAPSHOT.
2. **Yaşam döngüsü eksikliği**: teklif→satış, teklif→servis, akü→servis bağlantıları iz bırakmıyor. → "Dönüşüm" alanları + müşteri 360 görünümü.
3. **Pagination/bellek**: ürünler 5000 sınırı, sözleşmeler 1000, servisler foto dahil 1000 — hepsi client-side filtre. → Server-side arama/sayfalama ortak iş.
4. **Tek dosya riski**: server.py ~12k satır; her ajan aynı god-file'ı işaret etti.
5. **Test yok**: parser/PDF/finans hesapları — en regresyona açık alanlar testsiz.

## Önerilen ilk 5 iş (etki × çaba)

1. **Servis çift sayım + kur sabitleme** (07) — finansal doğruluk, küçük iş.
2. **MPPT akım yuvarlama bir üst değere** (05) — tek satır mantık, yanlış cihaz önerisini keser.
3. **Sözleşme Excel regenerate'e eksik alanları ekle** (08) — veri kaybını durdurur.
4. **Güvenlik P1 paketi** (09) — remove-bg SSRF + regex escape + /downloads (Pi deploy şartı).
5. **PDF executor + import_sessions TTL** (10) — Pi stabilitesinin temeli.
