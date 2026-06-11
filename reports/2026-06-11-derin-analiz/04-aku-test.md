# Akü Test — Derin Analiz (Codex, 2026-06-11)

## Mevcut Durum

BatteryTestSection: her akü için görseller → POST /battery-analysis/extract (SOH/SOC/Voltaj/İç Direnç okuma) → kullanıcı düzeltme paneli → POST /battery-analysis/interpret (rapor). PDF: müşteri/plaka/tarih/çoklu akü/thumbnail → POST /battery-analysis/pdf. İki adımlı akış server.py:~8578; eski tek adımlı /battery-analysis duruyor (server.py:~8523). PDF: _parse_battery_report + _build_battery_report_pdf (server.py:~8720, ~8812).

## Eksiklikler ve Sorunlar

1. **Toplu akış yarım**: "Tüm Görsellerden Değerleri Oku" sadece extract; toplu interpret yok (App.js:225 analyzeAll). Çoklu aküde tek tek "Raporu Oluştur" tıklamak gerekiyor; hangi akülerin hazır olmadığı net görünmüyor.
2. **Akü testleri kalıcı KAYDEDİLMİYOR** — `battery_tests` koleksiyonu yok, müşteri/plaka ilişkisi yok, servis bağlantısı yok. SOH düşüş trendi/geçmiş rapor takip edilemiyor. (En değerli eksik.)
3. **XSS riski**: renderReport `dangerouslySetInnerHTML` kullanıyor (App.js:284, **bold** için). AI çıktısı ham HTML basabilir.
4. **PDF HTML escape yok**: evaluation_text/decision_text doğrudan Paragraph HTML'ine (server.py:8995, 9024) — `<`, `&` render bozabilir.
5. **UI "Gemini 1.5 Flash" diyor, backend GPT-4o mini** (App.js:547 vs server.py:8059) — yanıltıcı.
6. **Kök App.js eski akışı içeriyor** — aktif dosya frontend/src/App.js; bakım riski.
7. **Değer doğrulama zayıf**: BatteryInterpretRequest sadece Optional[float]; SOH/SOC 0-100, voltaj/direnç aralık kontrolü yok (server.py:8647).
8. **Görsel doğrulama MIME header'a güveniyor**; 10 dosya × 25MB bellek riski (frontend 5 sınırı ile tutarsız).
9. **720px küçültme OCR için riskli olabilir** — küçük segment karakterlerde okuma zorlaşabilir (ürün çıkarmada 2200px korunuyor; server.py:8281).
10. **Extract'te güven/kaynak yok** — hangi görselden, emin mi, neden null bilgisi dönmüyor.
11. **Rapor parser format bağımlı** — başlık kalıbından küçük sapma PDF tablosunu boşaltır.
12. **Eski endpoint iki adımlı kalite modelini bypass ediyor.**

## Yeni Özellik Önerileri

1. **Akü Test Geçmişi / Rapor Arşivi** — koleksiyon + liste + trend ("3 ay önce SOH 78, bugün 61"). (M)
2. **Plaka/müşteri/servis kaydı bağlantısı** — müşteri ve servis akışına entegre. (M-L)
3. **Extract güven/kanıt paneli** — value+confidence+source_image+raw_text. (M)
4. **Manuel test girişi modu** — fotoğrafsız değer gir, aynı rapor. (S-M)
5. **Toplu akış**: oku → hepsini gözden geçir → toplu rapor. (M)
6. **PDF'e karar matrisi özeti** — "1. Akü iyi, 2. Akü değişim". (M)
7. **Structured report (JSON)** — parser kırılganlığı azalır. (M)
8. **Servis önerisi + teklif bağlantısı** — "değişim gerekli" → akü ürünleriyle teklif taslağı. (L)

## Hızlı Kazanımlar

- UI metnini düzelt ("Gemini 1.5 Flash" → model bağımsız).
- renderReport'ta dangerouslySetInnerHTML yerine güvenli render.
- PDF'te evaluation/decision metnine HTML escape.
- SOH/SOC 0-100 + voltaj/direnç aralık doğrulaması.
- Frontend 5 / backend 10 görsel sınırı tutarlılığı.
- allReportsReady kullanılmıyor — kaldır ya da "PDF hazır mı?" göstergesi yap.
- Kök App.js'i arşivle/temizle.
- Eski /battery-analysis kullanımını logla, deprecate planla.
