# Karavan — Yönetici Özeti (Gece Analizi)

> Tarih: 2026-06-01 gece. 5 sub-agent + Gemini 2.5 Pro + ana asistan ile hazırlandı. Hiçbir uygulama kodu değiştirilmedi; tüm bulgular `reports/` altında. Yarın buradan başla.

## Raporlar
| # | Konu | Dosya |
|---|------|-------|
| 01 | Fonksiyonel eksiklikler + 15 özellik fikri (**ana ağırlık**) | `01-eksikler-ozellikler.md` |
| 02 | Güvenlik denetimi | `02-guvenlik.md` |
| 03 | Tasarım / UX | `03-tasarim-ux.md` |
| 04 | Kablo Şeması entegrasyon planı | `04-kablo-semasi.md` |
| 05 | Teknik borç / mimari refactor | `05-teknik-borc-mimari.md` |
| 06 | Stabilite (runtime + statik test) | `06-stabilite.md` |
| 07 | Gemini dayanıklılık analizi (server.py) | `07-gemini-dayaniklilik-analizi.md` |

---

## 1. Tek Cümlede Durum
Uygulama **çalışıyor, performanslı ve özellik açısından zengin** (tüm endpoint'ler hızlı, yük altında %0 hata), ancak **iki yapısal zayıflık** var: (a) **kimlik doğrulama fiilen yok** — internete açık tüm yıkıcı uçlar korumasız; (b) iki **god-file** + **üç çakışan renk sistemi** bakım ve marka tutarlılığını bozuyor.

---

## 2. Çapraz-Doğrulanmış Kritik Bulgular
*(Birden fazla bağımsız agent/Gemini aynı sorunu bulduysa güven yüksektir.)*

| Önem | Bulgu | Konum | Doğrulayan raporlar |
|------|-------|-------|---------------------|
| 🔴 P0 | **Auth yok** — ~80 endpoint'ten yalnız 1'i kimlik doğrular; silme/yükleme/bulk-update internete açık | `server.py:7335` (tek korumalı) | 01, 02 |
| 🔴 P0 | **Hardcoded admin parolası** (açık metin, koda yazılmış → yanmış) | `server.py:867` | 02 |
| 🔴 P0 | **Text-index oluşmuyor** — hatalı `create_index` çağrısı `except` ile yutuluyor; arama index'siz | `server.py:78-89` | 06 |
| 🟠 P1 | **`customer_id` teklife yazılmıyor** (somut bug) — müşteri teklifleri hiç dönmez | model `:496`, eksik `:2293-2307` | 01 |
| 🟠 P1 | **Cache middleware bozuk** — stream tüketimi → istemciye boş/eksik gövde riski; ölü/şüpheli kod | `server.py:274-308` | 05, 07 |
| 🟠 P1 | **In-memory oturum** — restart'ta herkes düşer; SHA-256 salt'sız | `server.py:818, 826-847` | 01, 02, 06, 07 |
| 🟠 P1 | **BackgroundScheduler event-loop hatası** — arka plan döviz güncellemesi sessizce çalışmıyor | `server.py:785-805` | 06, 07 |
| 🟠 P1 | **3 çakışan renk sistemi + WYSIWYG kırık** — ekran (emerald) ≠ PDF (lacivert); `tailwind.config` `blue`→terracotta remap | `index.css`/`App.css`/`tailwind.config.js` | 03 |
| 🟡 P2 | **404 → 500 dönüşümü** — geniş `except` kendi HTTPException'ını yutup iç mesaj sızdırıyor | `server.py:2342` | 06 |
| 🟡 P2 | **Excel renk-bazlı import kırılgan** — Office sürümü değişince renk kodu kayar, sessiz başarısızlık | `server.py:988-1550` | 07 |
| 🟡 P2 | **God-file'lar** — `server.py` 7412 satır/77 endpoint, `App.js` 8328 satır/152 hook | — | 05, 03 |
| 🟡 P2 | **Çift `server.py`** (kök vs backend, divergent) — "değişiklik canlıda görünmüyor" kök sebebi | repo kökü | 05 |

---

## 3. Olumlu Yönler (korunmalı)
- **CurrencyService** retry+timeout+çok katmanlı fallback ile ders niteliğinde dayanıklı (06, 07).
- DB indeksleme tasarımı güçlü; Pydantic validation sağlam (eksik/bozuk girdi → düzgün 422).
- Yük altında stabil (40-50 eşzamanlı istek, %0 hata, PDF üretimi <0.3s).
- Teklif ekranındaki canlı A4 WYSIWYG kâğıdı gerçek bir fark — korunmalı, PDF'le eşlenmeli (03).
- Kodda hardcoded API anahtarı yok, secret'lar env'den, `.gitignore` kapsamlı, cookie httpOnly (02).

---

## 4. Kablo Şeması Sekmesi — Entegrasyona Hazır (yarın)
- **Doğru repo:** `github.com/mnzmnz10/kablosemasi` (dolu proje; önceki `project-kablosemasi` boş iskeletti, yoksay).
- **Stack Karavan ile neredeyse birebir aynı** (Emergent): React 19, craco, Tailwind v3, shadcn, Yarn, FastAPI+Mongo → sürüm çakışması yok. `yarn build` ✅ başarılı.
- **Yaklaşım: kaynak portu (A)** — `frontend/src/features/wiring/` altına bileşen olarak. TS dönüşümü yok. Ekstra dep: `zustand` (+ muhtemelen `react-resizable-panels`).
- **Ekleme noktaları (doğrulandı):** App.js TabsTrigger `:3560` sonrası, TabsContent `:7052` sonrası; kalıp `BatteryTestSection (:25)`.
- **Backend:** `/api/wiring-*` namespace ile port (çakışma önleme). **`cairosvg` gerekli** — Windows'ta native cairo sorunu çıkarsa reportlab+svglib fallback (detay 04'te).

---

## 5. Yarın İçin Önerilen Sıra
**Önce (yarım gün, düşük risk yüksek getiri):**
1. Çift `server.py` ikiliğini çöz — tek kaynak (deploy karmaşasının kökü).
2. `text-index` (P0) ve `404→500` (P2) düzeltmeleri — küçük, net, runtime'da doğrulanmış.
3. Kablo Şeması sekmesini `features/wiring/` altında ekle (04 planına göre) — App.js'i şişirmeden temiz hücre.

**Bu hafta:**
4. **Auth'u gerçekten devreye al** (P0) — `get_current_user` zaten var ama kullanılmıyor; endpoint'lere bağla + hardcoded parolayı kaldır + passlib'e geç. (Büyük karar, planlı yapılmalı.)
5. `customer_id` bug'ı + cache middleware temizliği.
6. Marka birleştirme: lacivert (#1B3A5C) birincil, emerald aksan → ekran = PDF = marka.

**Orta vade:** god-file modülerleştirme (05), pytest+CI, in-memory session → Mongo/Redis, Excel import'u başlık-bazlıya çevir.

---

## 6. Özellik Fikirleri (01'den, kısa)
Müşteri/CRM sekmesi (backend hazır, UI yok) · teklif durum/onay akışı + geçerlilik · e-posta/WhatsApp ile teklif gönderme · teklif şablonları + versiyonlama · stok takibi · dashboard/raporlama · mobil/saha modu. Detay ve önceliklendirme `01-eksikler-ozellikler.md`'de.

---
*Not: Tüm "kod değiştirilmedi" — bu gece yalnız analiz yapıldı. Auth gibi büyük değişiklikler senin onayınla, planlı uygulanmalı.*
