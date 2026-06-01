# Kablo Şeması (Wiring) Editörü — Derinlemesine İnceleme: Eksikler ve Olması Gerekenler

> Rapor No: 08 · Tarih: 2026-06-02 · Kapsam: `frontend/src/features/wiring/` + `backend/server.py` (WIRING modülü) + `_external/kablosemasi/` referans repo
>
> **Not — Gemini delegasyonu:** Gemini MCP (`ask-gemini`) doğrulandı (`ok` yanıtı alındı) ancak ortamdaki Gemini CLI *ajan modunda* çalışıyor; analiz isteklerine içerik yerine "task complete / I have updated..." gibi meta-yanıtlar döndürdü (örn. Canvas analizi yerine `fitToContent` düzenleme cevabı). Bu nedenle güvenilirlik için tüm mantık dosyaları (Canvas, editorStore, routing, electricalCheck, Toolbar, PropertiesPanel, devices, TemplateEditor, DeviceLibrary, backend WIRING bloğu) **doğrudan hedefli Read ile** incelendi. Küçük config dosyaları (wireTypes, api, KabloSemasiSection) zaten kısa. Token açısından maliyetli olsa da analiz doğruluğu korundu.

---

## 1. Yönetici Özeti

Editör, beklenenin üzerinde olgun bir **çizim/şematik aracı** olarak gelmiş: A* tabanlı çakışmasız ortogonal routing, sürükle-bırak cihaz kütüphanesi (33 yerleşik + sınırsız özel cihaz), undo/redo, çoklu seçim, grid snap, hizalama kılavuzları, kablo segment renkleri, köprü (bridge) geçişleri, manuel kablo nokta düzenleme, JSON içe/dışa aktarma, MongoDB kalıcılık ve svglib tabanlı PDF export. Bu **CAD/çizim katmanı güçlü.**

Asıl boşluk **mühendislik/domain katmanında**: araç bir "karavan elektrik tesisatı" aracı olarak konumlanmış olmasına rağmen şu an **hiçbir elektriksel hesap yapmıyor**. `electricalCheck.js` yalnızca (a) port adına dayalı *polarite uyumsuzluğu* (kırmızı-siyah karıştırma) ve (b) topolojik *netlist* üretiyor. **Akım, gerilim düşümü, kablo kesiti yeterliliği, sigorta değeri, akü kapasitesi/yük dengesi — hiçbiri yok.** wireTypes.js'te kesit (mm²) verisi *var* ama hiçbir yerde akım taşıma kapasitesiyle karşılaştırılmıyor; salt görsel kalınlık olarak kullanılıyor. Karavan elektrikçisi için en kritik kontroller (yanlış kesit = yangın riski) eksik.

İkinci boşluk **Karavan ana ürünüyle sıfır entegrasyon**: BOM (malzeme listesi) üretiliyor ama Karavan stok/fiyat kataloğuna bağlı değil; şema müşteri/teklif kaydına iliştirilemiyor. Bu, özelliğin asıl katma değerinin (teklif → şema → fatura) kaçırıldığı yer.

Üçüncü grup: **kalıcılık ve güvenlik boşlukları** — autosave yok (kapatınca kaybolma riski yüksek, sadece "Yeni"de uyarı var), backend route'larında **kimlik doğrulama/yetkilendirme yok** (tüm projeler herkese açık liste), PDF export'ta `<image>` gömülü base64'lerin svglib ile render riski.

**Öncelik sırası:** (1) Elektriksel doğrulama motoru — domain kritik, (2) Autosave + kayıp koruması, (3) Karavan entegrasyonu (BOM→fiyat→teklif), (4) Backend auth, (5) PDF kalite/lejant iyileştirmeleri.

---

## 2. Mevcut Yetenekler (editör ne yapabiliyor)

**Çizim & manipülasyon** (`Canvas.jsx`)
- Sürükle-bırak cihaz ekleme (kütüphaneden, `onDrop` L303), drop noktasında merkezleme.
- Cihaz taşıma (snap-to-grid'li, L206-224), 4 köşeden resize (L181-204, L348-356), 90° rotasyon (PropertiesPanel L240-250).
- Port'tan port'a kablo çizme; canlı önizleme A* ile (L316-327).
- Çoklu seçim: Shift+boş alandan marquee (L141-142, L245-253) ve Shift+cihaz tıkla (L340-343); çoklu taşıma (L169-179).
- Pan (boş alandan sürükle L143-147, L163-167), zoom (wheel, imleç merkezli L263-277; min 0.2 / max 4).
- Hizalama kılavuzları (4px tolerans, kenar/kenar snap L213-221), "İçeriğe Sığdır" (`fitToContent` L44-60 — *yalnızca cihazları* hesaba katar, kabloları değil).
- Manuel kablo nokta sürükleme + ara nokta ekleme (L225-236, L434-444), etiket konumu sürükleme (L237-241).

**State & geçmiş** (`editorStore.js`)
- Undo/redo: snapshot tabanlı, son 60 adım (L49-67). Klavye: Ctrl+Z/Y/Shift+Z (Canvas L284-285).
- Kopyala/yapıştır: **yalnızca tek cihaz** (L280-296) — kablolar ve çoklu seçim kopyalanmıyor.
- Grid göster/snap/etiket/köprü toggle'ları, grid boyutu 10-50px.
- "Otomatik Hizala" = cihazları en yakın 4×grid'e yuvarlama (L266-277).
- Z-order: öne/arkaya (tek adım, L163-176).

**Cihaz kütüphanesi** (`devices.js`, `DeviceLibrary.jsx`, `TemplateEditor.jsx`)
- 33 yerleşik cihaz, 8 kategori. Arama (ada göre), kategori gruplama.
- Özel cihaz oluştur/düzenle/sil — MongoDB'de kalıcı, görsel yükleme, marka/model/teknik değer.

**Elektriksel/liste** (`electricalCheck.js`, Toolbar `BomDialog`)
- Polarite uyumsuzluğu uyarısı (+/- , AC L/N, PE karıştırma — L29-57).
- Netlist (her elektriksel düğüm = bir net, BFS bağlı bileşen, L62-118), CSV export.
- BOM diyaloğu: cihaz sayımı, kablo özeti (tip+renk başına toplam metre), açıkta kalan portlar.

**Kalıcılık & çıktı** (`api.js`, backend)
- Proje CRUD (MongoDB), JSON import/export, PDF export (svglib+reportlab), görsel upload (base64, maks 10MB).
- PDF'te başlık (proje adı), logo, kablo/cihaz/port render.

---

## 3. Eksiklikler (kategorize, dosya:satır referanslı, önem dereceli)

Önem: 🔴 Kritik · 🟠 Yüksek · 🟡 Orta · ⚪ Düşük

### 3.1 Elektriksel / Domain (en kritik grup)

| # | Eksik | Önem | Referans / Açıklama |
|---|-------|------|---------------------|
| E1 | **Akım/yük hesabı yok** | 🔴 | `electricalCheck.js` tümü — hiçbir cihazın çektiği/verdiği akım (A) modellenmiyor. `ratingValue` serbest metin (PropertiesPanel L329), parse edilmiyor. Yük analizi imkânsız. |
| E2 | **Kablo kesiti ↔ akım yeterliliği doğrulaması yok** | 🔴 | `wireTypes.js` kesit (mm²) tutuyor (L6-23) ama bir netten geçen akımla karşılaştırılmıyor. Yanlış kesit = aşırı ısınma/yangın; aracın asıl var oluş sebebi bu kontrol. |
| E3 | **Gerilim düşümü (voltage drop) hesabı yok** | 🔴 | Karavanda uzun mesafe + düşük voltaj (12V) → %3 kuralı kritik. `lengthM` (kablo uzunluğu, store L232) ve kesit *mevcut* — formül (`Vdrop = 2·L·I·ρ/A`) için tüm girdi var ama hesap yok. |
| E4 | **Sigorta değeri hesabı/önerisi yok** | 🟠 | Sigorta cihazları sadece görsel kutu (`devices.js` L137-178); bağlı yükün akımına göre A değeri önerilmiyor, kesite uyumu kontrol edilmiyor. |
| E5 | **Akü kapasitesi ↔ toplam yük dengesi yok** | 🟠 | LiFePO4 Ah + güneş paneli W + tüketici toplamı arasında enerji dengesi (günlük tüketim, otonomi saati) hesaplanmıyor. Karavan satışında en sorulan soru. |
| E6 | **Kısa devre / aşırı yük / port fan-out uyarısı yok** | 🟡 | Bir porta sınırsız kablo bağlanabilir; bara dışı cihazda çoklu bağlantı uyarısı yok. Aynı net'te +/- köprüleme (kısa devre topolojisi) tespiti yok. |
| E7 | **Polarite kontrolü ad-tabanlı ve kırılgan** | 🟡 | `portPolarity` (L16-27) sabit ad kümeleriyle çalışıyor; özel cihaz portu "L+" gibi adlanırsa yanlış sınıflar. Sinyal/güç ayrımı zayıf (`'A'`,`'B'` hem sinyal hem belirsiz). |
| E8 | **DC/AC gerilim seviyesi (12V/24V/230V) cihaz/net düzeyinde yok** | 🟠 | 12V cihazı 24V hattına bağlama gibi uyumsuzluk yakalanamıyor; sistem voltajı hiç tanımlanmıyor. |
| E9 | **Topraklama/şase bütünlüğü kontrolü yok** | 🟡 | `ground`/`chassis` cihazları var (L305-318) ama tüm negatif/PE'nin tek şase netine bağlı olup olmadığı doğrulanmıyor. |

### 3.2 Fonksiyonel (editör işlevleri)

| # | Eksik | Önem | Referans |
|---|-------|------|----------|
| F1 | **Kopyala/yapıştır yalnız tek cihaz** | 🟠 | `editorStore.js` `copySelection` L280-286 sadece `selectedType==='device'`. Çoklu seçim, kablo, grup kopyalanamıyor; yapıştırma offset sabit +30 (üst üste yığılır). |
| F2 | **Çoklu seçimde toplu işlem yok** | 🟡 | Çoklu seçili cihaz silinemiyor (Delete sadece `selectedId`, Canvas L288-290), kopyalanamıyor, hizalanamıyor (sol/üst/dağıt). |
| F3 | **Hizalama araçları yok** | 🟡 | "Otomatik Hizala" sadece grid yuvarlama (L266-277). Sola/sağa/ortala, eşit dağıt (distribute) yok. |
| F4 | **Katman (layer) yönetimi yok** | ⚪ | Z-order tek adımlı öne/arkaya (L163-176); "en öne/en arkaya", isimli katman/grup yok. |
| F5 | **Cihaz/kablo grup (group) kavramı yok** | 🟡 | Tekrar eden alt-sistemleri (örn. tek bir "güneş bloğu") grup olarak çoğaltma imkânı yok. |
| F6 | **Kablo otomatik yönlendirmede çakışma tam çözülmüyor** | 🟡 | A* ardışık (`ctx` paylaşımlı L88-89) ama global optimizasyon değil; sıraya bağlı. `fitToContent` kabloları kapsamaz (L44-60). |
| F7 | **Arama yalnız cihaz adında** | ⚪ | `DeviceLibrary` L48-49 marka/model/kategoride aramıyor. Canvas üzerinde cihaz arama/git yok. |
| F8 | **Kablo etiketi otomatik içerik üretmiyor** | 🟡 | Etiket boşsa preset adı gösteriliyor (Canvas L8-12) ama "kesit + polarite + uzunluk" gibi standart şematik etiketi otomatik üretilmiyor. |
| F9 | **Cihaz hizalama/snap yalnız kendi kenarına** | ⚪ | Port-port hizası, merkez-merkez snap yok (L213-221 sadece x/y kenar). |

### 3.3 Veri / Kalıcılık

| # | Eksik | Önem | Referans |
|---|-------|------|----------|
| D1 | **Autosave yok** | 🔴 | Hiçbir yerde periyodik/değişiklikte kaydetme yok. Sadece manuel "Kaydet" (Toolbar L67-78). Sekme/araç kapanırsa kayıp. `beforeunload` uyarısı da yok. |
| D2 | **Sürüm/versiyon geçmişi yok** | 🟡 | Backend `update_one` üzerine yazıyor (server.py L7538); önceki sürüm saklanmıyor. Yanlış kaydet = geri dönüş yok (undo session'a bağlı, sayfa yenilenince sıfırlanır). |
| D3 | **`projectName`/meta export'ta var, ama `vehicleName` JSON import'ta yükleniyor — yine de proje silme/yeniden adlandırma UI'da kısıtlı** | 🟡 | LoadDialog (Toolbar L225-266) sadece açma yapıyor; silme/yeniden adlandırma UI yok (backend DELETE var ama frontend çağırmıyor). |
| D4 | **Şablon kütüphanesi kapsam boşlukları** | 🟡 | `devices.js` 33 cihaz iyi ama eksikler: **Shunt/akım sensörü, BMS (ayrı), Battery monitor (Victron BMV/SmartShunt), busbar/Lynx, Anderson/SB konnektör, akü ayırıcı (battery isolator), ana şalter (battery switch), şönt, Wi-Fi/GX cihaz, 230V kombi pano, jeneratör, şehir şebekesi girişi (shore power), TV/anten, USB priz, dimmer.** Sadece tek "Akü" + "LiFePO4"; kurşun-asit/jel ayrımı yok. |
| D5 | **Import validation zayıf** | 🟠 | `onImportJson` (Toolbar L91-113) sadece `JSON.parse` try/catch; şema/sürüm/alan doğrulaması yok. Bozuk `data.devices` (örn. port'suz) editörü çökertebilir (Canvas `d.ports.map` L553). |
| D6 | **Kayıt sonrası `projectId` set ediliyor ama çakışma/eşzamanlılık yok** | ⚪ | İki sekmede aynı proje → son yazan kazanır; updated_at kontrolü yok. |

### 3.4 PDF / Çıktı

| # | Eksik | Önem | Referans |
|---|-------|------|----------|
| P1 | **BOM PDF'e dahil DEĞİL** | 🟠 | `serializeCanvasSvg` (Toolbar L425-565) yalnız şemayı çiziyor; cihaz listesi, kablo metrajı, netlist PDF'e girmiyor. Profesyonel teslimde malzeme listesi şart. |
| P2 | **Teknik lejant/başlık bloğu eksik** | 🟠 | `design_guidelines.json` "sağ alt köşede title block + logo + proje metadata" istiyor; gerçekte sadece **üstte proje adı + logo** var (L484-491). Hazırlayan/araç/tarih/açıklama backend'e gönderiliyor (L127-136) ama **SVG'ye yazılmıyor**, dolayısıyla PDF'te görünmüyor. Ölçek/pafta çerçevesi yok. |
| P3 | **svglib render riskleri** | 🟠 | svglib `pattern`, `foreignObject`, gradient, bazı `Q` arc ve gömülü base64 `<image>` desteğinde sınırlı. Cihaz fotoğrafları (L537-541) ve logo (L488) data-URL olarak gömülüyor; svglib bunları atlayabilir veya hata verebilir. Hata yönetimi backend'de var (L7599-7601) ama sessiz görsel kaybı kullanıcıya bildirilmez. |
| P4 | **Baskı ölçeği/DPI kontrolü yok** | 🟡 | viewBox içeriğe sığdırılıyor (L431-442), sabit ölçek (1:n) seçimi yok; A2 destekleniyor (backend `PAPER_PT` L419-423) ama frontend select sadece A4/A3/A2 — paper-pt çarpanları 2x sabit, gerçek mm ölçeği garantisi yok. |
| P5 | **Yalnız cihaz varken min/maxX hesabı; sadece kablo olan boş alanlar taşabilir** | ⚪ | L431-436 bbox yalnız cihaz; serbest manuel kablo noktaları PDF dışında kalabilir. |

### 3.5 UX / Kullanılabilirlik

| # | Eksik | Önem | Referans |
|---|-------|------|----------|
| U1 | **Boş durum / onboarding yok** | 🟠 | İlk açılışta boş canvas; ipucu sadece PropertiesPanel altında küçük metin (L191-193). Yeni kullanıcı nereden başlayacağını bilmez. Örnek/şablon proje yok. |
| U2 | **Klavye kısayolları kısıtlı ve belgelenmemiş** | 🟡 | Canvas L280-296: undo/redo/copy/paste/delete/esc/zoom var; ama **duplicate (Ctrl+D), select-all, tool kısayolları (V/W/H), grup, kaydet (Ctrl+S) yok.** Kısayol listesi/yardım paneli yok. |
| U3 | **`confirm()`/`alert()` native kullanımı** | 🟡 | "Yeni proje" (Toolbar L169), silme onayları (DeviceLibrary L33). Tarayıcı native dialog — tasarım diline aykırı, mobilde kötü, test edilemez. |
| U4 | **Mobil/tablet desteği yok** | 🟡 | Tüm etkileşim `onMouseDown/Move/Up` (Canvas) — **touch event yok.** Tablet'te sürükleme/çizim çalışmaz. `pinch-zoom` yok. |
| U5 | **Çok cihazlı performans riski** | 🟠 | `wirePaths` her `devices`/`wires` değişiminde **tüm kabloları yeniden route ediyor** (Canvas L87-104; A* iterLimit 200k). `crossings` O(n²) çift döngü (L107-119). Cihaz sürüklerken her mouse-move tüm A*'ı tetikler → 30+ kabloda gözle görülür takılma. Memoization var ama bağımlılık `devices` olduğu için tek cihaz hareketi tümünü invalide eder. |
| U6 | **Hata mesajları genel** | ⚪ | "Kayıt başarısız" (L76) — neden? (ağ/validation/auth) ayrımı yok. PDF hatası mesajı ham exception sızdırıyor (L146). |
| U7 | **Geri al/ileri al butonu durumu (disabled) yok** | ⚪ | Toolbar L186-187 her zaman aktif görünür; geçmiş sınırında geri bildirim yok. |
| U8 | **Wheel zoom sayfa scroll'unu engelliyor ama `passive` listener uyarısı riski** | ⚪ | `onWheel` `preventDefault` (L264) React sentetik event'te bazı tarayıcılarda çalışmaz; native non-passive gerekebilir. |

### 3.6 Karavan Entegrasyonu (şu an YOK — bkz. §5)

| # | Eksik | Önem |
|---|-------|------|
| K1 | Cihazların Karavan ürün/stok kataloğuyla eşleşmemesi | 🟠 |
| K2 | BOM'un Karavan fiyatlarıyla beslenmemesi | 🟠 |
| K3 | Şemanın müşteri/teklif/sipariş kaydına bağlanmaması | 🟠 |

### 3.7 Kod Kalitesi / Hata Yönetimi

| # | Bulgu | Önem | Referans |
|---|-------|------|----------|
| C1 | **Backend WIRING route'larında auth/yetki YOK** | 🔴 | server.py L7512-7546: `wiring_list_projects` herkesin tüm projelerini döndürür; sahiplik (`owner_id`) yok. Karavan'ın geri kalanında auth varsa bu modül açık kapı. Silme/güncelleme kimlik kontrolsüz. |
| C2 | **`previewWire` strokeWidth ifadesi anlamsız** | ⚪ | Canvas L460 `2.4 / zoom * zoom` = sabit 2.4 (zoom iptal oluyor); muhtemelen hata. |
| C3 | **`routeWire` boş/null dönebilir, tüketiciler kontrol etmiyor her yerde** | 🟡 | `tryRoute` (routing L106-116) `best` null kalabilir; `pathToSvgD` boş diziyle korunuyor ama `findPathCrossings` undefined points'te patlayabilir. |
| C4 | **Drag sırasında `pushHistory` çağrılmıyor** | 🟡 | `moveDevice`/`updateDevice` (store L148-153) history'ye yazmıyor; sürükleme bittiğinde de yazılmıyor → **bir cihazı taşımak undo edilemiyor** (sadece ekle/sil/kablo undo'lanır). UX'te ciddi tutarsızlık. |
| C5 | **`addToMulti` ile başlatılan çoklu seçimde ilk cihaz dahil değil** | 🟡 | Shift+cihaz `addToMulti` (Canvas L341) ama o an `selectedId`'deki cihaz multi'ye taşınmıyor → mantık boşluğu. |
| C6 | **Görsel base64 MongoDB'de — doküman boyutu/16MB limiti riski** | 🟠 | server.py L7496 her görsel base64 olarak `wiring_files` dokümanında; çok sayıda/büyük görselde 16MB BSON limiti ve `listProjects` payload şişmesi. GridFS yerine inline. |
| C7 | **`alert`/`confirm` ve `process.env.REACT_APP_BACKEND_URL` tanımsızsa** | ⚪ | api.js L3 — env yoksa `undefined/api` ile sessiz 404. |
| C8 | **Import edilen JSON `data` doğrudan store'a** | 🟠 | (D5 ile aynı kök) — `loadProject` (store L71-89) gelen `devices/wires` şeklini doğrulamıyor; kötü niyetli/bozuk dosya render katmanını çökertir. |
| C9 | **PDF `<text>` XML-escape var ama `<image href>` data-URL escape edilmiyor** | 🟡 | L488/541 — data-URL'de `&` vb. varsa XML bozulur (genelde base64 güvenli, yine de riskli). |

---

## 4. Olması Gerekenler & Özellik Önerileri (önceliklendirilmiş, efor S/M/L)

### Faz 1 — Domain doğruluğu (ürünü "gerçek" yapan) 🔴
1. **Elektriksel hesap motoru** (L). `electricalCheck.js`'i genişlet:
   - Cihaz modeline `current` (A) / `power` (W) / `voltage` (V) alanları ekle (template + instance). `ratingValue`'yu yapısal hale getir.
   - Net bazında akım toplamı → kesit yeterliliği (NYAF mm² → güvenli akım tablosu, 12V/24V ortam sıcaklığı faktörlü).
   - Gerilim düşümü: `Vdrop = 2·L·I·1.724e-2 / A`, %3 eşik uyarısı (girdiler hazır: `lengthM`, kesit, net akımı).
   - Sigorta önerisi: yük akımı × 1.25 → en yakın standart değer; kesit-sigorta uyumu.
   - Sonuçları BOM diyaloğunda yeni "ELEKTRİKSEL ANALİZ" sekmesinde göster.
2. **Sistem voltajı + AC/DC seviye uyumsuzluk kontrolü** (M). Proje meta'sına `systemVoltage` (12/24/48), netlere voltaj türet, uyumsuzluğu uyar.
3. **Akü/güneş/yük enerji dengesi paneli** (M). Günlük Wh tüketim, panel üretimi, otonomi saati özeti.

### Faz 2 — Kayıp koruması & güven 🔴
4. **Autosave** (S). Debounce'lu (örn. 3 sn) otomatik kaydetme + `beforeunload` uyarısı + "son kayıt: X" göstergesi.
5. **Cihaz taşımayı undo'ya dahil et** (S). Drag bittiğinde `pushHistory` (C4 düzeltmesi).
6. **Import şema doğrulaması** (S). `loadProject` öncesi devices/wires/ports şekil kontrolü, hatalı dosyada güvenli ret (D5/C8).
7. **Backend auth** (M). WIRING route'larına Karavan oturum/`owner_id` ekle, projeleri sahibe göre filtrele (C1).

### Faz 3 — Karavan entegrasyonu (katma değer) 🟠 — bkz. §5
8. **Ürün eşleştirme + fiyatlı BOM** (L), **şema↔teklif bağlama** (M).

### Faz 4 — UX & çıktı 🟠/🟡
9. **PDF lejant/title-block + BOM tablosu** (M). `serializeCanvasSvg`'a sağ-alt title block (hazırlayan/araç/tarih/açıklama — zaten gönderiliyor) + ikinci sayfa BOM (P1/P2).
10. **Boş durum + örnek şablon projeler** (S). "Basit 12V kurulum" gibi 2-3 hazır şema (U1).
11. **Kütüphane genişletme** (S). D4'teki eksik cihazlar (shunt, BMS, battery switch, shore power, busbar, jeneratör...).
12. **Performans** (M). Cihaz sürükleme sırasında yalnız etkilenen kabloları yeniden route et; `crossings`'i sürükleme bitince hesapla; A*'ı web worker'a taşı (U5).
13. **Touch desteği** (M). Pointer event'lere geçiş, pinch-zoom (U4).
14. **Çoklu seçim toplu işlemleri + hizalama araçları** (M). Toplu sil/kopyala/hizala/dağıt (F1-F3).
15. **Kısayol paneli + Ctrl+S/Ctrl+D/Select-all + native confirm→tasarım dialog** (S) (U2/U3).

### Faz 5 — İnce ayar ⚪
16. Proje silme/yeniden adlandırma UI (D3), versiyon geçmişi (D2), `fitToContent` kabloları kapsasın (F6), `previewWire` strokeWidth düzelt (C2), GridFS'e görsel taşıma (C6).

---

## 5. Karavan ile Entegrasyon Fırsatları

Şu an wiring modülü **tamamen izole** (kendi `wiring_*` koleksiyonları, kendi cihaz kütüphanesi). En yüksek ticari katma değer burada:

1. **Cihaz ↔ Karavan ürün/stok eşleştirme** (🟠, L)
   - `TemplateEditor`'a "Karavan ürünü bağla" alanı: özel cihaz şablonunu bir stok SKU'suna iliştir.
   - Şemaya cihaz eklendiğinde gerçek ürün (marka/model/fiyat) otomatik gelsin.

2. **Fiyatlı BOM** (🟠, M)
   - `BomDialog` cihaz/kablo özetini Karavan fiyat listesiyle çarp → toplam maliyet.
   - Kablo metrajı (`lengthM` toplamı zaten var, Toolbar L282-286) × birim fiyat.
   - "Teklif olarak dışa aktar" → Karavan teklif modülüne push.

3. **Şema ↔ müşteri/teklif/sipariş bağlama** (🟠, M)
   - `WiringProject`'e `customer_id` / `quote_id` alanı (backend L7428-7436).
   - Müşteri kaydından "elektrik şemasını aç/oluştur"; teslimde PDF + BOM otomatik ekli.

4. **Stok düşümü / üretim entegrasyonu** (🟡, L)
   - Onaylı şemadaki BOM → iş emri/malzeme rezervasyonu.

5. **Tek görsel kimlik** (⚪, S)
   - Logo zaten yükleniyor; Karavan firma logosu/başlık bilgisini PDF title-block'a otomatik doldur.

---

## 6. Önerilen Yol Haritası

| Sprint | Odak | İçerik | Çıktı |
|--------|------|--------|-------|
| **S1** | Güven & kayıp koruması | Autosave + beforeunload (4), drag-undo (5), import validation (6), `previewWire`/küçük buglar (C2) | Kullanıcı verisini kaybetmez; undo tutarlı |
| **S2** | Elektriksel motor v1 | Cihaz akım/voltaj modeli + kesit yeterliliği + gerilim düşümü + sigorta önerisi (1) | "Gerçek" mühendislik aracı; yanlış kesit/sigorta uyarısı |
| **S3** | Elektriksel v2 + güvenlik | Sistem voltajı/AC-DC uyum (2), enerji dengesi paneli (3), backend auth (7) | Karavan satışında "yeterli mi?" sorusuna yanıt; veri izolasyonu |
| **S4** | Karavan entegrasyonu | Ürün eşleştirme + fiyatlı BOM (§5.1-5.2), şema↔teklif (§5.3) | Teklif→şema→fatura akışı; ticari katma değer |
| **S5** | Çıktı & UX | PDF title-block + BOM tablosu (9), boş durum/şablonlar (10), kütüphane genişletme (11), kısayollar (15) | Profesyonel teslim çıktısı |
| **S6** | Performans & platform | Akıllı re-routing + worker (12), touch/pinch (13), toplu seçim işlemleri (14) | Büyük şema + tablet desteği |

---

### Ek: İncelenen dosyalar
- Frontend: `Canvas.jsx` (710), `editorStore.js` (310), `routing.js` (362), `electricalCheck.js` (128), `Toolbar.jsx` (565), `PropertiesPanel.jsx` (473), `devices.js` (323), `wireTypes.js` (42), `TemplateEditor.jsx` (250), `DeviceLibrary.jsx` (184), `api.js` (71), `KabloSemasiSection.jsx` (24).
- Backend: `server.py` L7406-7607 (WIRING modülü).
- Referans: `_external/kablosemasi/` — `design_guidelines.json` (tasarım hedefi: title-block, orthogonal routing, port sistemi), `test_result.md` (boş şablon), `test_reports/iteration_*.json` (özel cihaz kütüphanesi akışlarının test geçmişi). Orijinal repo'da da elektriksel hesap testi/planı **yoktu** — yani bu eksik baştan beri var, port sırasında oluşmadı.

> **Gemini delegasyon notu (tekrar):** Gemini ajan-modu içerik döndürmediği için analiz hedefli Read ile yapıldı; bulgular birinci elden kod okumasına dayanır (varsayım/özet değil).
