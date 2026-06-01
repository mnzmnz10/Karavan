# Karavan — Tasarım & UX İyileştirme Raporu

> Kapsam: `frontend/src/App.js` (8.328 satır, tek dosya), `frontend/src/components/ui/*` (shadcn/Radix bileşen seti), `index.css`, `App.css`, `tailwind.config.js` ve backend PDF (lacivert #1B3A5C) ile marka tutarlılığı.
> Bağlam: Çorlu Karavan — tedarikçi/ürün/kategori/paket yönetimi + teklif hazırlama + akü test analizi. Saha senaryosu: tablet üzerinden teklif hazırlama.
> Tarih: 2026-06-01

---

## 0. Yönetici Özeti (TL;DR)

Uygulamanın **bilgi mimarisi sağlam** (sol dikey sidebar + 7 sekme), teklif hazırlama ekranı ise gerçek bir **fark yaratan özellik**: ekranda canlı A4 "WYSIWYG" teklif kâğıdı. Bu çok değerli. Ancak görsel katmanda **üç ayrı, çakışan tasarım sistemi** aynı anda yaşıyor ve marka kimliği dağınık:

1. **`index.css`** → koyu orman yeşili primary (`hsl(153 42% 18%)`) + terracotta accent + sıcak krem zemin (olgun, kurumsal bir palet).
2. **`App.css`** → parlak emerald `#10b981`, glassmorphism, Inter fontu, mavi gölgeli "glass-card" (tamamen farklı bir dil).
3. **`tailwind.config.js`** → `blue` aslında terracotta'ya, `indigo` amber'a remap edilmiş (tehlikeli; `blue-600` yazınca turuncu çıkıyor). Ama kodda hâlâ gerçek `blue/purple/pink` bekleniyormuş gibi kullanılıyor.
4. **Backend PDF** → kurumsal lacivert `#1B3A5C`. **Ekrandaki teklif önizlemesi emerald gradient, basılan PDF lacivert** — kullanıcı gördüğüyle aldığı çıktı uyuşmuyor (WYSIWYG sözü bozuk).

En kritik 3 iş: **(1)** tek bir renk paletinde birleş ve PDF ile eşle, **(2)** `window.confirm`/`alert`'leri shadcn `AlertDialog` ile değiştir, **(3)** erişilebilirliği sıfırdan ele al (8.328 satırda yalnızca **2 ARIA** ve **1 focus-visible** var).

---

## 1. Mevcut Tasarım Değerlendirmesi

### 1.1 Güçlü Yönler
- **Modern bileşen altyapısı**: Tam shadcn/ui + Radix seti kurulu (dialog, alert-dialog, sonner, tooltip, command, drawer, sheet vb.). Yani doğru araçlar zaten elimizde — sadece tutarlı kullanılmıyor.
- **Bilgi mimarisi**: Sol dikey sidebar net; logo + "Fiyat Takip Sistemi" alt başlığı kurumsal. Teklifler sekmesinde sepetteki ürün sayısı için amber badge (`selectedProducts.size`) — iyi bir "canlı sepet" sinyali.
- **Teklif hazırlama ekranı (uygulamanın kalbi)**: `lg:grid-cols-4` ile solda **A4 canlı kâğıt** (col-span-3) + sağda kontrol paneli. Başlık, fiyat, adet doğrudan kâğıdın üstünde düzenleniyor (inline edit). Maliyet fiyatlarını göster/gizle (Eye/EyeOff) toggle'ı düşünceli bir detay.
- **Empty state örneği var**: Firmalar sekmesinde ikon + başlık + açıklama + "İlk Firmayı Ekle" CTA — doğru desen (sadece her sekmede tekrarlanmıyor).
- **Sonner toast** her aksiyonda kullanılıyor (`success`/`error`/`warning`) — geri bildirim kültürü mevcut.
- **Tipografi niyeti iyi**: `index.css`'te `Public Sans` (gövde) + `Plus Jakarta Sans` (`.font-display`, başlık) + `.tnum` (tabular-nums, fiyat hizalama) tanımlı. Fiyat ağırlıklı bir uygulama için `tnum` çok doğru bir karar.
- **Performans bilinci**: `LazyImage`, `VirtualizedTable`, `memo`/`useCallback` kullanımı var.

### 1.2 Zayıf Yönler
| # | Sorun | Kanıt |
|---|-------|-------|
| Z1 | **Üç çakışan renk sistemi** (index.css vs App.css vs hardcoded) | `--primary:153 42% 18%` (orman yeşili) ≠ `#10b981` (App.css) ≠ `emerald-600:#1b4332` (config) |
| Z2 | **İki font ailesi çakışıyor** | `index.css` → Public Sans/Plus Jakarta; `App.css` → Google'dan `Inter` import edip `body`'ye basıyor. Hangisi kazanıyor belirsiz. |
| Z3 | **Tailwind renk remap'i tuzaklı** | config'te `blue → terracotta`, `indigo → amber`. Kodda 53× `blue-*`, 30× `purple-*`, `pink-*` var → niyetlenen renk çıkmıyor |
| Z4 | **Palette enflasyonu** | App.js'te en az 14 renk ailesi: emerald, teal, slate, amber, blue, purple, pink, indigo, rose, green, cyan, orange, red, gray |
| Z5 | **Native `window.confirm` (6+ yer)** | Silme onayları tarayıcı diyaloğu — markasız, mobilde kötü, stilize edilemez. Satır 854/1195/1608/1688/2628/3014/6805 |
| Z6 | **Erişilebilirlik neredeyse yok** | 8.328 satırda 2 `aria-*`, 1 `focus-visible`, ikon-only butonlarda çoğunlukla `aria-label` yok |
| Z7 | **WYSIWYG yalanı** | Ekran teklifi emerald gradient (sat. 6023/6029), basılan PDF lacivert #1B3A5C |
| Z8 | **Stil yöntemi karışık** | Tailwind class + inline `style={{borderLeft:...}}` + emoji (💡, ⭐) + ham `<svg>` path'leri yan yana |
| Z9 | **shadcn token'ları bypass ediliyor** | `Button` `bg-primary` kullanıyor ama App.js çoğu butonu `bg-blue-50 text-blue-700`, `from-emerald-600 to-teal-600` ile eziyor → varyant sistemi işlevsiz |
| Z10 | **Bakım/ölçeklenme riski** | Tek dosyada 8.328 satır, yüzlerce `useState`. UX değil ama tasarım iterasyonunu yavaşlatır (yeni "Kablo Şeması" sekmesi geldiğinde katlanarak büyür) |
| Z11 | **Login/loading marka dışı** | Auth loading ekranı `from-blue-50 via-purple-50 to-pink-50` + `border-blue-600` spinner — markayla alakasız (sat. 3399-3402) |
| Z12 | **Glassmorphism aşırı** | `backdrop-blur` + `bg-white/80` her yerde; kontrastı düşürüyor, okunabilirliği ve erişilebilirliği zorluyor |

---

## 2. Tasarım Sistemi Önerisi (tek kaynak)

**İlke:** Backend PDF lacivertini (#1B3A5C) **marka çapası** kabul et. Frontend de aynı laciverte hizalansın; emerald'i **ikincil/aksan** yap. Böylece ekran ↔ PDF ↔ marka birleşir. (Alternatif: emerald'i koru, PDF'i emerald'e çevir — ama PDF zaten "yeni kurumsal lacivert"e geçirildiği için **laciverti baz almak daha az iş**.)

### 2.1 Renk Paleti (öneri — `index.css` `:root` yeniden yazımı)
HSL token'ları tek otorite olsun; App.css'teki renkler **silinsin**, hardcoded `blue/purple/pink` ayıklansın.

```css
:root {
  /* Marka — Lacivert (PDF #1B3A5C ile birebir) */
  --primary: 209 54% 23%;          /* #1B3A5C kurumsal lacivert */
  --primary-foreground: 0 0% 100%;
  --primary-hover: 209 54% 18%;    /* koyu hover */

  /* İkincil aksan — Emerald (CTA, başarı, "canlı" vurgular) */
  --accent: 158 64% 32%;           /* ~#16855c dengeli emerald */
  --accent-foreground: 0 0% 100%;

  /* Nötrler — sıcak gri (krem zemin korunabilir) */
  --background: 210 20% 98%;       /* serin-nötr veya mevcut krem */
  --foreground: 215 25% 15%;
  --card: 0 0% 100%;
  --muted: 210 16% 95%;
  --muted-foreground: 215 14% 42%;
  --border: 214 20% 90%;
  --input: 214 20% 90%;
  --ring: 209 54% 23%;             /* odak halkası = lacivert */

  /* Durum renkleri (tek standart) */
  --success: 158 64% 32%;          /* emerald */
  --warning: 38 92% 50%;           /* amber-500 */
  --destructive: 0 72% 51%;        /* red-600 */
  --info: 209 54% 23%;             /* lacivert */

  --radius: 0.75rem;               /* mevcut korunur */
}
```

**Kural:** Bundan sonra üründe **sadece** şu aileler kullanılır:
`primary` (lacivert) · `accent` (emerald) · `slate` (nötr) · `amber` (uyarı/döviz) · `red` (yıkıcı). Diğer her şey (blue/purple/pink/indigo/cyan/teal/green/orange/rose) **yasak**. `tailwind.config.js`'teki `blue→terracotta`, `indigo→amber` remap'i **kaldırılır** (tehlikeli sürpriz).
**Efor: M** (bul-değiştir + görsel QA).

### 2.2 Tipografi
- **Tek font yığını seç**: `Plus Jakarta Sans` (başlık/marka) + `Public Sans` (gövde) **veya** her şey için `Inter`. İkisini birden tutma. App.css'teki `@import Inter` ya da index.css'teki yığın — birini sil.
- **Ölçek (type scale)** netleştir — şu an `text-[10px]`, `text-[9px]`, `font-black`, `font-extrabold` rastgele. Önerilen 6 kademe:
  - Display/H1: `text-2xl font-bold tracking-tight font-display`
  - H2 (kart başlığı): `text-lg font-semibold`
  - Body: `text-sm`
  - Label/caption: `text-xs font-medium text-muted-foreground uppercase tracking-wide`
  - **Fiyatlar her yerde** `tabular-nums` (`.tnum`) + `font-semibold` — hizalanmış rakam.
- `font-black` (900) kullanımını başlık dışında azalt; UI'da 600-700 yeterli, 900 "bağıran" bir his veriyor.
- **Efor: S–M.**

### 2.3 Bileşen Stilleri (shadcn varyantlarını gerçekten kullan)
shadcn `Button` zaten `bg-primary` tüketiyor. Çözüm: App.js'te butonları **ham renkle ezme**, varyant ekle:

```jsx
// button.jsx — variant'lara ekle
accent:  "bg-accent text-accent-foreground shadow hover:bg-accent/90", // emerald CTA
soft:    "bg-muted text-foreground hover:bg-muted/70",                 // "Geçmiş" gibi ikincil
```
Kullanım:
```jsx
// ÖNCE:  className="bg-blue-50 hover:bg-blue-100 text-blue-700"
// SONRA: <Button variant="soft" size="sm">…</Button>
// ÖNCE:  className="bg-gradient-to-r from-emerald-600 to-teal-600 …"
// SONRA: <Button variant="accent">Kurları Güncelle</Button>
```
- **Gradyanları azalt**: Marka için tek imza gradyanı bırak (örn. teklif başlığı), gerisi düz renk. Şu an `from-emerald-950 via-emerald-800 to-teal-600`, `from-emerald-600 to-teal-600`, `from-blue-50 via-purple-50 to-pink-50` gibi 3+ farklı gradyan var.
- **Gölge sistemi**: 2 kademe yeter — `shadow-sm` (kart), `shadow-lg` (modal/öne çıkan). Glassmorphism (`backdrop-blur` + `bg-white/80`) sadece sticky döviz çubuğu gibi 1-2 yerde kalsın; kartlarda düz beyaz `bg-card` kullan (kontrast + okunabilirlik).
- **İkonografi**: lucide-react'e tam geç; ham inline `<svg path>` (firma "web'den yükle", favori yıldızı) ve emoji (💡⭐) yerine `<Globe/>`, `<Star/>`, `<Lightbulb/>`. Tutarlı 16/20px boyut.
- **Efor: M.**

### 2.4 Tasarım Token Dokümanı (öneri)
`reports/` veya `frontend/src/` altına kısa bir `DESIGN_TOKENS.md` / Storybook benzeri tek sayfa: renk rolleri, type scale, buton varyantları, spacing ritmi (4/8px grid). Yeni "Kablo Şeması" sekmesi gelmeden önce bu sözleşme kurulursa tutarlılık otomatik korunur. **Efor: S.**

---

## 3. UX İyileştirmeleri (akış bazlı)

### 3.1 Teklif Hazırlama (uygulamanın kalbi) — en yüksek getiri
| Fikir | Neden | Efor |
|------|-------|------|
| **PDF önizlemeyi gerçek PDF'e eşle** (lacivert) | WYSIWYG sözü tutulur; satıcı "gördüğümü basıyorum" güvenini kazanır | M |
| **Yapışkan özet/aksiyon çubuğu** (toplam, iskonto, işçilik, "PDF indir") A4'ün yanında veya altında sabit | Uzun teklifte kullanıcı toplamı ve "indir"i sürekli görmek ister; şu an scroll gerekiyor | M |
| **Ürün ekleme sürtünmesini azalt**: kalıcı "hızlı ekle" arama kutusu (zaten `quickAddSearch` var) + klavye ile gez-seç (↑↓, Enter) | Saha senaryosunda hız kritik; her ürün için dialog açmak yavaş | M |
| **Inline edit görünürlüğü**: düzenlenebilir alanların (başlık, fiyat, adet) hover'da kalem ikonu/alt çizgi ile "tıkla-düzenle" sinyali vermesi | Şu an `border-none bg-transparent` — kullanıcı düzenlenebilir olduğunu anlamayabilir | S |
| **Satır içi miktar stepper** (− / +) ve canlı tutar | Tablet dokunuşu için input yazmak yerine | S |
| **Boş teklif empty-state**: "Soldan ürün ekleyin / paket seçin" yönlendirmesi + ilk-kez ipuçları | Boş A4 kafa karıştırır | S |
| **Taslak geri yükleme zaten var** (otomatik), bunu görünür kıl: "Taslak kaydedildi · 14:32" rozeti | Güven verir, var olan özelliği vitrine çıkarır | S |
| **Müşteri seçimi**: hızlı müşteri ekleme modalı var; teklif başında müşteri zorunlu/önerili akış | Teklif kime gidiyor netleşir, PDF kişiselleşir | S |

### 3.2 Onay & Bildirim Akışı
- **`window.confirm` → `AlertDialog`** (shadcn'de hazır, `alert-dialog.jsx`). Yıkıcı butona kırmızı, başlığa silinecek öğenin adını koy. **6+ yer. Efor: M.**
- Toast'larda **geri al (Undo)** aksiyonu: silme sonrası "Ürün silindi · [Geri Al]" — sonner `action` destekliyor. Yanlış silmeyi kurtarır. **Efor: M.**
- **Optimistic UI + yükleniyor durumu** ayrımı: ağır aksiyonlarda buton içi spinner (zaten `Loader2 animate-spin` var) tutarlı uygulansın.

### 3.3 Form & Validasyon
- Alan-bazlı hata gösterimi (shadcn `form.jsx` + `react-hook-form`/zod) — şu an çoğu yer toast ile "İsim zorunlu" diyor; kullanıcı hangi alana bakacağını aramıyor olmalı. Hatalı input'a `aria-invalid` + kırmızı border + altında mesaj. **Efor: M–L.**
- Sayısal alanlar (fiyat, iskonto, adet): `inputMode="decimal"`, min/max, TR ondalık (virgül) toleransı.
- Kategori rengi seçimi ham `<input type="color">` yerine önceden tanımlı marka-uyumlu palet swatch'ları (rastgele renkler markayı bozuyor).

### 3.4 Navigasyon & Bilgi Mimarisi
- Sidebar'da **mantıksal gruplama**: "İş" (Teklifler, Paketler, Akü Test, ileride Kablo Şeması) ve "Veri/Ayar" (Ürünler, Firmalar, Kategoriler, Excel Yükle) başlıkları. 7→8 sekmede gruplar nefes aldırır.
- **Komut paleti** (shadcn `command.jsx` zaten var): `Cmd/Ctrl+K` ile ürün ara, sekmeye atla, yeni teklif. Güç kullanıcısı için büyük hızlanma. **Efor: M.**
- **Breadcrumb** (`breadcrumb.jsx` var) teklif düzenleme gibi derin görünümlerde.

### 3.5 Modülerleştirme (bakım — UX değil ama tasarımı hızlandırır)
8.328 satırlık `App.js` tasarım iterasyonunu yavaşlatıyor. Sekme bazında ayır:
`features/quotes/QuoteBuilder.jsx`, `features/products/ProductsTab.jsx`, `features/battery/BatteryTest.jsx` … + ortak `components/EmptyState.jsx`, `ConfirmDialog.jsx`, `PriceText.jsx` (tnum sarmalı), `StatCard.jsx`. Tekrar eden empty-state/onay/fiyat desenleri tek bileşene iner → tutarlılık ücretsiz gelir. **Efor: L** (kademeli yapılabilir).

---

## 4. Görsel İyileştirmeler

### 4.1 Boş Durumlar (Empty States)
Tek `EmptyState` bileşeni: `<EmptyState icon={Package} title="…" description="…" action={…} />`. Her sekmeye uygula (şu an sadece Firmalar'da iyi örnek var). İllüstrasyon yerine lucide ikon + nötr renk yeterli, marka tutarlı. **Efor: S.**

### 4.2 Yükleniyor Durumları
- Liste/tablo yüklenirken **skeleton** (`skeleton.jsx` var) — `loading-shimmer` CSS'i App.css'te tanımlı ama tutarsız. İçerik-şekilli skeleton (kart/satır iskeleti) "spinner + boş ekran"dan iyidir.
- Auth loading ekranını markaya çek: mavi/mor/pembe gradyan → lacivert/krem, spinner `border-t-primary`. **Efor: S.**

### 4.3 Döviz Çubuğu
İyi bir bileşen ama 3 renk (amber USD, emerald EUR, gradient buton) taşıyor. USD/EUR'u nötr `bg-muted` rozetlerine indir, sadece kur değişim yönü (↑ yeşil / ↓ kırmızı) renk taşısın. "Kurları Güncelle" → `variant="accent"`. **Efor: S.**

### 4.4 Tablolar
Teklif tablosunda 8 sütun + her birinde `border-r` + `font-black` yoğun görünüyor. Hafiflet: dikey çizgileri kaldır, satır hover `bg-muted/40`, başlık `text-xs font-medium uppercase text-muted-foreground`, sayısal sütunlar sağa hizalı `tnum`. Zebra yerine ince alt border. **Efor: S.**

### 4.5 Derinlik & Ritim
4/8px spacing grid'e otur (`gap-2/3/4/6`), kartlarda tek gölge kademesi, `rounded-xl/2xl` karışımını `rounded-xl`'de standardize et. **Efor: S.**

---

## 5. Responsive / Mobil (saha: tabletten teklif)

| # | Sorun/Fikir | Efor |
|---|-------------|------|
| R1 | Sabit `w-72` sidebar mobilde yer kaplar → `lg:` altında `Sheet`/`Drawer`'a (ikisi de mevcut) hamburger ile çek | M |
| R2 | Teklif `lg:grid-cols-4` → mobilde A4 + kontrol paneli üst üste; kontrol panelini **alt yapışkan bar**a al (toplam + PDF indir hep erişilir) | M |
| R3 | **Dokunma hedefleri**: ikon-only butonlar (göz/sil/kalem) min `44×44px`. Şu an `h-8 w-8` (32px) — küçük | S |
| R4 | Geniş tablolar yatay taşıyor → mobilde kart-liste görünümü veya yatay scroll + sticky ilk sütun | M |
| R5 | A4 önizleme telefonda `min-h-[1050px]` çok uzun → mobilde "PDF önizle" butonuyla tam ekran modal | S |
| R6 | `type="color"`, sürükle-bırak sıralama mobilde zayıf → uzun-bas + ok butonları alternatifi | M |

---

## 6. Erişilebilirlik (şu an kritik eksik: 2 ARIA / 1 focus-visible)

| # | Aksiyon | Efor |
|---|---------|------|
| A1 | **İkon-only butonlara `aria-label`** (göz toggle, sil, düzenle, yenile, web yükle) | S |
| A2 | **Görünür odak halkası**: `--ring` lacivert; tüm interaktif öğelerde `focus-visible:ring-2 focus-visible:ring-ring`. Şu an 1 yerde | S |
| A3 | **Kontrast**: `text-slate-400/-500` üzeri nötr zemin WCAG AA'da kalıyor mu kontrol et; glassmorphism (`bg-white/80`) altındaki metni düz zemine al | M |
| A4 | **Toast'lar `aria-live`** (sonner varsayılan destekler — emin ol); kritik hata sadece renge bağlı kalmasın (ikon + metin) | S |
| A5 | **Form `<Label htmlFor>` eşleşmesi** her input'ta (çoğu var, eksikleri tara), hata mesajı `aria-describedby` | M |
| A6 | **Klavye gezinme**: sidebar tab'ları, dialog'larda focus-trap (Radix sağlıyor), `window.confirm` kalkınca AlertDialog ile klavye akışı düzelir | S |
| A7 | **Renk-kör güvenli durum**: USD/EUR yön, başarı/hata sadece renkle değil ikon/şekille de | S |

---

## 7. Marka Kimliği Önerisi (lacivert ↔ emerald uzlaşması)

**Karar: Lacivert birincil marka rengi, emerald enerji/aksan.**
- **Birincil (Lacivert #1B3A5C)**: sidebar aktif sekme, başlıklar, PDF, odak halkası, ana CTA "ciddi" aksiyonlar (Giriş Yap, Kaydet).
- **Aksan (Emerald ~#16855c)**: "üret/onayla/canlı" aksiyonlar (PDF İndir, Kurları Güncelle, başarı toast, sepet vurgusu). Marka "büyüme/temiz enerji" çağrışımıyla (güneş paneli/karavan işine uygun) tutulur ama ikinci planda.
- **Uyarı (Amber)**: döviz, taslak, dikkat.
- **Yıkıcı (Red)**: silme.
- **Nötr (Slate + krem zemin)**: yüzeyler.

Bu hiyerarşi tek bir cümlede: *"Lacivert güven, emerald aksiyon, geri kalan sus."* Ekran teklifi de lacivert başlık bandına geçince **ekran = PDF = marka** üçlüsü kapanır.

---

## 8. Önceliklendirilmiş Aksiyon Listesi

### P0 — Hemen (yüksek etki, makul efor)
1. **Tek renk paleti**: `index.css` token'larını lacivert-merkezli yeniden yaz; App.css renk/gradient/glass kurallarını ve ikinci font import'unu sil. `tailwind.config` `blue→terracotta`/`indigo→amber` remap'ini kaldır. **(M)** → Z1,Z2,Z3,Z4
2. **`window.confirm` → `AlertDialog`** (6+ yer), tek `ConfirmDialog` bileşeni. **(M)** → Z5
3. **PDF önizlemeyi laciverte eşle** (ekran=çıktı). **(M)** → Z7
4. **İkon butonlara `aria-label` + global `focus-visible` halkası**. **(S)** → Z6, A1, A2

### P1 — Kısa vade
5. shadcn `Button` varyantları (`accent`, `soft`) ekle, hardcoded buton renklerini değiştir. **(M)** → Z9
6. Login/loading ekranını markaya çek. **(S)** → Z11
7. Tüm sekmelere ortak `EmptyState` + liste yüklemede `Skeleton`. **(S)**
8. Teklif ekranında **yapışkan özet/aksiyon barı** (toplam + PDF indir). **(M)**
9. Toast'lara **Geri Al (Undo)** aksiyonu. **(M)**

### P2 — Orta vade
10. Mobil: sidebar→Drawer, teklif kontrol paneli alt bar, dokunma hedefleri 44px. **(M)**
11. Form validasyonunu alan-bazlı + `aria-invalid`'e taşı (`form.jsx`/zod). **(M-L)**
12. `Cmd+K` komut paleti (`command.jsx`). **(M)**
13. Tipografi ölçeği + `tnum` fiyat standardizasyonu, gölge/spacing ritmi. **(S-M)**

### P3 — Yapısal (sürekli)
14. `App.js`'i feature klasörlerine böl + ortak bileşenler (EmptyState, ConfirmDialog, PriceText, StatCard). **(L, kademeli)** → Z10
15. `DESIGN_TOKENS.md` tek-sayfa tasarım sözleşmesi — **"Kablo Şeması" sekmesi gelmeden önce**. **(S)**

---

### Ek Notlar
- Mevcut shadcn seti zaten ihtiyacın çoğunu karşılıyor (alert-dialog, command, drawer, sheet, skeleton, form, tooltip) — **yeni kütüphane gerekmez**, var olanı tutarlı kullanmak yeterli.
- En büyük "algılanan kalite" sıçraması: **tek palet + PDF eşleşmesi + native confirm'lerin kalkması.** Bu üçü göreceli düşük eforla uygulamayı "amatör yamalı"dan "kurumsal" hisse taşır.
- Teklif ekranındaki canlı A4 fikri korunmalı ve öne çıkarılmalı; bu, rakiplerden ayrışan asıl değer.
