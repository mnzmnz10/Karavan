# 04 — Kablo Şeması Sekmesi Entegrasyon Planı

> **DOĞRU REPO:** `https://github.com/mnzmnz10/kablosemasi`
> Klon konumu: `Karavan/_external/kablosemasi`
> Önceki yanlış inceleme (`_external/project-kablosemasi`, boş iskelet) GEÇERSİZ — YOK SAYIN/silin.
> Tarih: 2026-06-01

**Gemini'ye devredilen analizler (token tasarrufu):**
- `App.js` + `Editor.jsx` + `Canvas.jsx` + `editorStore.js` → routing/layout/çizim teknolojisi/state.
- `backend/server.py` + `lib/api.js` → API endpoint'leri, Mongo koleksiyonları, PDF export.
- `lib/devices.js` + `wireTypes.js` + `routing.js` + `electricalCheck.js` + 4 panel bileşeni → domain mantığı.
- Küçük config dosyaları (package.json, craco/tailwind config, requirements.txt) ve Karavan entegrasyon noktaları KENDİM Read/Grep ile doğrulandı.

---

## 1) Proje Özeti

**Ne yapıyor:** Karavan elektrik tesisatı için **kablo şeması (wiring diagram) editörü**. Tam olarak Karavan domain'ine özel — generic bir araç değil, doğrudan karavan elektrik sistemleri için tasarlanmış.

**Stack (kablosemasi):**
| Katman | Teknoloji |
|--------|-----------|
| Frontend | **React 19**, **craco** + react-scripts 5.0.1, **Tailwind v3.4**, shadcn/Radix UI, **Yarn** |
| State | **Zustand** (`editorStore.js`) |
| Routing | react-router-dom v7 — tek route `/` → `<Editor />` |
| Backend | **FastAPI** + **motor** (async MongoDB), PDF için **cairosvg** |
| Diğer | react-resizable-panels, lucide-react, axios |

> **Kritik bulgu:** Bu stack Karavan ile NEREDEYSE BİREBİR AYNI (Emergent ile üretilmiş ikisi de). React 19, craco, react-scripts 5, Tailwind v3, shadcn, Yarn, FastAPI+motor. **Sürüm/araç çakışması yok.** Bu, entegrasyonu çok kolaylaştırıyor.

**Çizim teknolojisi:** **Saf SVG** (`<rect>`, `<path>`, `<text>`, `<image>`). Harici çizim kütüphanesi YOK (reactflow/konva/fabric kullanılmıyor). Sürükle-bırak ile cihaz yerleştirme, kablo çizimi, zoom/pan elle implement edilmiş.

**Özellikler:**
- `devices.js`: 30+ ön tanımlı karavan cihazı (güneş paneli, LiFePO4 akü, MPPT, DC-DC şarj, invertör, sigorta kutusu, röle, şalter, buzdolabı, Webasto) — 8 kategori, port tanımlı.
- `wireTypes.js`: NYAF/TTR/LiCY kablo tipleri, kesitler (0.75–90mm²), renk paleti (kırmızı+ / siyah- / mavi N / kahve L).
- `routing.js`: Otomatik kablo yol bulma — hızlı L/Z + grid tabanlı **A\*** algoritması, köprü geçişi tespiti.
- `electricalCheck.js`: Polarite uyumluluk kontrolü + netlist üretimi (CSV export).
- BOM (malzeme listesi) + elektriksel kontrol diyalogları.

**Veri girişi/çıktısı:** Kullanıcı cihazları sürükler, kabloları bağlar → proje JSON olarak Mongo'da `data` alanında saklanır. Çıktı: ekranda SVG + **server-side PDF export** (`POST /api/export/pdf`, cairosvg ile SVG→PDF) + CSV netlist.

**Backend bağımlılığı:** Editör **backend'e bağımlı** — proje kaydet/yükle, görsel yükle, özel cihaz şablonları ve PDF export hep backend üzerinden.

---

## 2) Klon / Build Sonucu

| Adım | Komut | Sonuç |
|------|-------|-------|
| Klon | `git clone https://github.com/mnzmnz10/kablosemasi.git` | ✅ Başarılı |
| Gemini bağlantısı | ping | ✅ Çalışıyor (analizler Gemini'ye devredildi) |
| Install | `yarn install` (frontend) | ✅ Başarılı (60s). Sadece zararsız peer-dep uyarıları (react-day-picker, recharts vb. — Karavan'da da aynı) |
| Build | `yarn build` (craco build) | ✅ **Compiled successfully.** main.js 181.72 kB gzip, css 10.14 kB |

**Sonuç: Proje sorunsuz derleniyor.** Karavan'a dokunulmadı.

---

## 3) Entegrasyon Yaklaşımı — Karar: **(A) Kaynak Portu**

| Seçenek | Değerlendirme |
|---------|---------------|
| **(A) Kaynak portu** — bileşeni Karavan'a `features/wiring/` altına adapte et | ✅ **SEÇİLEN.** Stack birebir aynı (React 19/craco/Tailwind v3/shadcn/Yarn). TS→JS dönüşümü YOK (zaten JS/JSX). Tek ekstra runtime dep: **zustand**. Native görünüm, tek build, tek deploy. |
| (B) iframe gömme | ❌ Ayrı app sunmak gerekir, auth/stil/PDF köprüleme zahmetli, Karavan'ın tek-SPA yapısına aykırı. |
| (C) Ayrı build | ❌ İki deploy, iki domain, gereksiz operasyon yükü. |

**Gerekçe:** İki proje aynı Emergent şablonundan üretildiği için sürüm/araç farkı yok. Bileşenler `@/` alias'ı, shadcn ui ve Tailwind değişkenlerini Karavan ile aynı şekilde kullanıyor. Port etmek en temiz ve native sonucu verir.

> **Mimari not:** kablosemasi tüm app'i `<Editor />` route'una koyuyor. Karavan'da bunu **route değil**, `BatteryTestSection` gibi **TabsContent içinde render edilen tek bir bölüm bileşeni** (`KabloSemasiSection`) haline getireceğiz. Editör kendi içinde react-router'a sıkı bağlı DEĞİL (tek route), bu yüzden router'ı atıp `<Editor>`'ün içeriğini doğrudan section olarak sarmak yeterli.

---

## 4) Adım Adım Entegrasyon Planı

### 4.1 Bağımlılıklar (Karavan/frontend)
Karavan zaten şunlara sahip: react 19, radix-*, tailwind v3, lucide-react, axios, sonner. **Eksik olan tek runtime dep:**
```bash
cd Karavan/frontend
yarn add zustand
# react-resizable-panels editör layout'unda kullanılıyorsa:
yarn add react-resizable-panels
```
> Önce kontrol: `react-resizable-panels` Karavan'da yoksa ekle; PropertiesPanel/Canvas resize için gerekebilir.

### 4.2 Dosyaların kopyalanması
kablosemasi'den Karavan'a taşınacak yapı (`frontend/src/features/wiring/` altında izole et):
```
Karavan/frontend/src/features/wiring/
├── KabloSemasiSection.jsx      # YENİ wrapper (Editor.jsx içeriğinden türet, router'sız)
├── components/
│   ├── Canvas.jsx
│   ├── DeviceLibrary.jsx
│   ├── PropertiesPanel.jsx
│   ├── TemplateEditor.jsx
│   └── Toolbar.jsx
├── lib/
│   ├── devices.js
│   ├── wireTypes.js
│   ├── routing.js
│   ├── electricalCheck.js
│   └── api.js                  # Karavan API desenine uyarlanacak (bkz 4.4)
└── store/
    └── editorStore.js
```
> **ui/ klasörünü kopyalama** — Karavan'ın mevcut `components/ui/*` (shadcn) bileşenleri kullanılacak. Import yollarını `@/components/ui/...` Karavan'ınkine eşitle (zaten aynı alias).

### 4.3 App.js ekleme noktaları (satır referanslı — doğrulandı)

Karavan `frontend/src/App.js`:

**a) Lucide import'una ikon ekle** (satır 13):
```js
// mevcut import satırına ekle: Cable (veya Workflow/Zap)
import { ..., Cable } from 'lucide-react';
```

**b) TabsTrigger — "Akü Test" trigger'ından SONRA** (satır **3560**'tan sonra, `</TabsTrigger>` ardından, satır 3561 `</TabsList>` ÖNCESİ):
```jsx
<TabsTrigger
  value="wiring-diagram"
  className="flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-100 rounded-xl data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
>
  <Cable className="w-4 h-4" />
  <span>Kablo Şeması</span>
</TabsTrigger>
```

**c) TabsContent — "Akü Test" content'inden SONRA** (satır **7052** `</TabsContent>`'ten sonra, satır 7054 `</div>` ÖNCESİ):
```jsx
{/* Kablo Şeması Tab */}
<TabsContent value="wiring-diagram" className="space-y-6">
  <KabloSemasiSection />
</TabsContent>
```

**d) Section import'u** (dosya başı import bloğu, ~satır 16 civarı):
```js
import KabloSemasiSection from './features/wiring/KabloSemasiSection';
```

> Doğrulanan ankraj noktaları: Akü Test TabsTrigger `App.js:3554-3560`, TabsList kapanış `:3561`, Akü Test TabsContent `:7049-7052`. API deseni `App.js:19-20` (`BACKEND_URL`/`API`). Kalıp bileşen `BatteryTestSection` `App.js:25`.

### 4.4 api.js uyarlaması
kablosemasi `lib/api.js` zaten `process.env.REACT_APP_BACKEND_URL` + `/api` kullanıyor — **Karavan ile birebir aynı desen** (`App.js:19-20`). Sadece endpoint path'lerini Karavan backend'ine eklenecek route'larla eşitle (bkz. Backend bölümü). Auth: Karavan cookie tabanlı auth kullanıyorsa axios `withCredentials: true` ekle.

### 4.5 Layout uyumu
`KabloSemasiSection` tam-genişlik/yükseklik bir editör. Karavan sekme içeriği `space-y-6` + `max-w` container içinde. Editör için bu container'ı genişletmek (örn. `min-h-[80vh] w-full`) veya section'ı kendi tam-ekran sarmalayıcısına almak gerekebilir. Toolbar/DeviceLibrary/Canvas/PropertiesPanel üçlü panel düzeni `react-resizable-panels` ile korunur.

---

## 5) Backend Gereksinimi — **EVET, gerekli**

Editör backend'siz çalışmaz (proje kaydet/yükle, görsel yükle, cihaz şablonu, PDF). kablosemasi backend route'larını Karavan `server.py`'ye **port et** (ayrı servis kurma — tek backend hedefle).

Karavan `server.py` deseni birebir uygun: `api_router = APIRouter(prefix="/api")` (`server.py:209`), `motor` async Mongo. Eklenecek route'lar:

| METHOD | Path | İşlev | Mongo koleksiyonu |
|--------|------|-------|-------------------|
| POST/GET/PUT/DELETE | `/api/wiring-projects` (+`/{id}`) | Şema CRUD | `wiring_projects` |
| POST/GET/PUT/DELETE | `/api/wiring-device-templates` (+`/{id}`) | Özel cihaz şablonları | `wiring_device_templates` |
| POST | `/api/wiring-upload` | Cihaz görseli yükle | `wiring_files` |
| GET | `/api/wiring-files/{file_id}` | Görsel getir | `wiring_files` |
| POST | `/api/wiring-export-pdf` | SVG→PDF | — |

> **Çakışma uyarısı:** kablosemasi'de bunlar `/api/projects`, `/api/device-templates` adında. Karavan'da `/api/projects` BAŞKA bir şeye ait olabilir → **`wiring-` prefix'i ile namespace'le** (yukarıdaki gibi) ve koleksiyon adlarına `wiring_` ekle. Çakışmayı kesinleştirmek için Karavan `server.py`'de mevcut `/projects` ve `/device-templates` route'larını Grep'le kontrol et.

**Backend bağımlılık:**
```bash
# Karavan/backend/requirements.txt — EKLE:
cairosvg
# (Karavan'da reportlab var ama PDF export cairosvg.svg2pdf kullanıyor — server.py:10,255-256)
```
> **DİKKAT — repo tutarsızlığı:** kablosemasi `requirements.txt` `reportlab` listeliyor AMA `server.py` `import cairosvg` ile `cairosvg.svg2pdf` kullanıyor. Gerçek PDF kütüphanesi **cairosvg**. Karavan'a `cairosvg` eklenmeli (Windows'ta cairosvg native cairo DLL gerektirir — kurulum sorunlu olursa alternatif: reportlab+svglib `svg2rlg`+`renderPDF`).

---

## 6) Olası Sorunlar & Çözümler

| Sorun | Çözüm |
|-------|-------|
| **cairosvg Windows'ta native cairo bağımlılığı** | Pip wheel'i çoğu zaman çalışır; çalışmazsa `svglib`+`reportlab` (zaten Karavan'da) ile `svg2rlg → renderPDF` alternatifi. PDF export server-side. |
| **Endpoint çakışması** (`/api/projects` her iki projede) | `wiring-` prefix + `wiring_` koleksiyon adları (yukarıda). Karavan mevcut route'larını önce Grep'le. |
| **Zustand store izolasyonu** | `editorStore.js` global singleton; Karavan başka zustand store kullanmıyorsa sorun yok. `features/wiring/store/` altında izole tut. |
| **react-router bağımlılığı** | Editör tek route → router'ı at, `<Editor>` içeriğini `KabloSemasiSection`'a doğrudan taşı. Karavan'ın kendi router'ı varsa karışmasın. |
| **Sekme görünmediğinde editör mount maliyeti** | TabsContent default'ta DOM'da kalabilir; ağır SVG editörü için `value === 'wiring-diagram'` koşuluyla lazy-mount veya `React.lazy` + Suspense. |
| **Layout taşması** (editör tam ekran ister, sekme container dar) | Section'ı tam-genişlik sarmalayıcıya al, `max-w` container'ı bu sekmede gevşet. |
| **Görsel yükleme yolu** (`/api/files/{id}`) | Karavan storage desenine (S3/boto3 — requirements'ta boto3 var) uyumlu; `wiring-files` ile namespace'le. |
| **Auth** | Karavan cookie-auth ise axios `withCredentials` + backend route'larına Karavan auth dependency'sini ekle. |

---

## 7) İyileştirme Önerileri (kısa)

- **README boş** (`# Here are your Instructions`) — entegrasyon sonrası kablo şeması özelliği için Karavan dokümantasyonuna kısa kullanım notu ekle.
- **PDF kütüphanesi tutarsızlığı**: requirements'ta `reportlab` yazıp kodda `cairosvg` kullanmak yanıltıcı — requirements'ı düzelt.
- **Şema ↔ Karavan ürün entegrasyonu**: kablo şemasındaki cihazlar Karavan ürün/stok kataloğuyla eşleştirilebilir → BOM doğrudan Karavan fiyat/stok verisinden beslenebilir (güçlü katma değer).
- **Şema ↔ müşteri/proje bağlama**: Karavan'da müşteri/araç kaydı varsa, wiring-project'i o kayda foreign-key ile bağla (vehicle_name alanı zaten mevcut).
- **electricalCheck genişletme**: Şu an polarite + netlist. Karavan domain'i için sigorta/akım/kesit doğrulaması (kablo kesiti vs. akım yükü) eklenebilir.
- **Mount performansı**: Editör ağır; sekme bazlı lazy-load önerilir.

---

### Özet Karar
Stack birebir aynı olduğu için **(A) kaynak portu** net kazanan. TS→JS dönüşümü yok, Tailwind/araç farkı yok, tek ekstra frontend dep `zustand`. Frontend bileşenleri `features/wiring/` altına izole edilip App.js'e iki ankraj (`:3560` trigger, `:7052` content) ile bağlanır. Backend route'ları `wiring-` namespace'iyle Karavan `server.py`'ye port edilir; `cairosvg` eklenir (Windows'ta sorun olursa reportlab+svglib fallback). Build her iki tarafta da temiz.
