# Karavan — Eksiklikler ve Özellik Fikirleri Raporu

> Hazırlayan: Kıdemli Ürün/Yazılım Analizi
> Tarih: 2026-06-01
> Kapsam: `backend/server.py` (7412 satır) + `frontend/src/App.js` (8328 satır) + kök veri dosyaları
> Yöntem: Endpoint/state/fonksiyon taraması (Grep) + hedefli okuma (Read). "Tahmin" olarak işaretli yerler dosya üzerinde doğrulanmamış, sektörel/mantıksal çıkarımdır.

---

## 1. Yönetici Özeti

Karavan, Çorlu Karavan için geliştirilmiş, **tek kullanıcılı bir karavan elektrik sistemi fiyat/teklif yönetim aracıdır**. Ürün kataloğu (443 ürün), kategoriler, paketler, teklif üretimi + kurumsal PDF, döviz servisi (USD/EUR/TRY), akü/batarya analizi ve Excel import işlevleri çalışır durumdadır. Mimari, iki adet "god-file" üzerine kuruludur ve hızlı iterasyonla büyümüş bir iç araç görünümündedir.

**En kritik 5 bulgu:**

1. **Yetkilendirme fiilen yok.** ~80 endpoint'ten yalnızca **1 tanesi** (`market-price-search`, `server.py:7336`) kimlik doğrulaması ister. Ürün silme, teklif silme, fiyat toplu güncelleme, Excel yükleme dahil tüm yıkıcı işlemler **kimlik doğrulaması olmadan** çağrılabilir. Login ekranı yalnızca frontend'i gizler, API'yi korumaz.
2. **Oturumlar bellekte (in-memory).** `AuthService.sessions` bir Python dict'tir (`server.py:826-847`). Backend her yeniden başladığında tüm kullanıcılar düşer; çok-işçili (multi-worker) dağıtımda oturumlar tutarsız olur.
3. **Teklif iş akışı yok.** Teklif durumu yalnızca `active`/`deleted` (`server.py:2306`, `2352`). Gönderildi / Onaylandı / Reddedildi / Süresi Doldu gibi satış hunisi durumları, geçerlilik tarihi, versiyonlama yok. Bu, bir "teklif yönetim" ürününün çekirdek değer eksiğidir.
4. **Müşteri (CRM) modülü yarım.** Backend'de tam CRUD customer endpoint'leri var (`server.py:1879-2068`), ancak **sol menüde Müşteriler sekmesi yok** (sekmeler: Ürünler, Teklifler, Paketler, Firmalar, Kategoriler, Excel Yükle, Akü Test — `App.js:3501-3560`). Ayrıca teklif oluştururken `customer_id` alanı modelde var (`server.py:496`) ama **`quote_doc`'a yazılmıyor** (`server.py:2293-2307`) → müşteri-teklif bağı kayboluyor (gerçek veri bütünlüğü hatası).
5. **Teklifi gönderme yolu yok.** E-posta/WhatsApp gönderimi için hiçbir altyapı yok (`smtplib`, `send_email`, `whatsapp`, `twilio` aramaları boş döndü). Teklif yalnızca PDF olarak indirilebiliyor; müşteriye ulaştırma tamamen manuel.

Genel değerlendirme: Ürün **veri/katalog tarafında olgun**, **satış süreci tarafında zayıf**. En yüksek getiri, teklif yaşam döngüsü + müşteri bağı + güvenlik sertleştirmesinde.

---

## 2. Mevcut Durum Haritası

### 2.1 Frontend Sekme Envanteri (`App.js:3501-3560`)

| Sekme | value | İşlev |
|-------|-------|-------|
| Ürünler | `products` | Katalog listesi, arama, kategori filtresi, favori, stok, satır içi düzenleme |
| Teklifler | `quotes` | Teklif oluşturma (PDF canvas), kayıtlı teklif listesi/arama |
| Paketler | `packages` | Hazır ürün paketleri, sarf malzemesi, kopyalama, pinleme |
| Firmalar | `companies` | Tedarikçi firmalar + Excel yükleme geçmişi |
| Kategoriler | `categories` | Kategori CRUD, renk/görsel, kategori grupları, sıralama |
| Excel Yükle | `upload` | Renk-tabanlı Excel parse, iskonto, para birimi |
| Akü Test | `battery-test` | Görsel tabanlı batarya analizi + PDF raporu |

> **Not:** Müşteriler için sekme yok; müşteri yönetimi yalnızca teklif içi modal (`showCustomerModal`, `showQuickCustomerModal` — `App.js:481,531`) üzerinden kısmen erişilebilir.

### 2.2 Backend Endpoint Envanteri (özet, `server.py`)

**Auth:** `POST /auth/login` (6303), `POST /auth/logout` (6348), `GET /auth/check` (6365)
**Döviz:** `GET /exchange-rates` (1701), `POST /exchange-rates/update` (1715)
**Firmalar:** `POST/GET /companies` (1830/1847), `DELETE /companies/{id}` (1857), `POST /companies/{id}/upload-excel` (5129), `GET /companies/{id}/upload-history` (5695)
**Müşteriler:** `POST/GET /customers` (1879/1895), `GET/PUT/DELETE /customers/{id}` (1926/1941/1991), `PATCH .../favorite` (2006), `GET .../quotes` (2035)
**Ürünler:** `GET /products` (5414, sayfalama+arama), `GET /products/count` (5367), `POST /products` (5586), `PATCH/PUT/DELETE /products/{id}` (2070/2163/2148), favoriler/stok/kategori atama (4517-4634), `POST /bulk-update-price` (6056), `POST /bulk-update-category` (6115), `GET /products/export` (5950), `GET /products/export/template` (5888)
**Kategoriler & gruplar:** CRUD + reorder (4254-4382, 6147-6263)
**Paketler:** CRUD + ürün/sarf yönetimi + pin/copy + PDF (4101-5118)
**Teklifler:** `POST /quotes` (2220), `GET /quotes` (2318), `GET/PUT/DELETE /quotes/{id}` (2331/2364/2346), `GET /quotes/{id}/pdf` (4219)
**Akü:** `POST /battery-analysis` (6711), `POST /battery-analysis/pdf` (7157)
**Diğer:** `POST /scrape-products` (6387), `POST /market-price-search` (7335), `GET /atlas-downloads` (6265), `POST /refresh-prices` (5641), `POST /upload-history/{id}/change-currency` (5744)

---

## 3. Eksiklikler (kategorize, referanslı)

### 3.1 Güvenlik & Yetkilendirme (KRİTİK)

- **E1 — API koruması yok.** Sadece `server.py:7336` `Depends(get_current_user)` kullanıyor. `DELETE /products/{id}` (2148), `DELETE /quotes/{id}` (2346), `POST /products/bulk-update-price` (6056), `POST /companies/{id}/upload-excel` (5129) gibi yıkıcı uçlar korumasız. **Etki: Yüksek.** Çözüm: `get_current_user` dependency'sini tüm yazma uçlarına ekle (veya router seviyesinde global dependency).
- **E2 — In-memory oturum.** `server.py:826-847`. Restart'ta oturum kaybı + multi-worker tutarsızlığı. Çözüm: oturumları MongoDB/Redis'e taşı veya stateless JWT.
- **E3 — Zayıf parola saklama.** SHA-256 düz hash, salt yok (`server.py:819-820`). Çözüm: `bcrypt`/`argon2`.
- **E4 — Tek sabit kullanıcı + hardcoded parola.** `server.py:867` içinde varsayılan parola kaynak kodda. **Tahmin:** rotasyon/şifre değiştirme uçları yok.
- **E5 — Rol/yetki yok.** Tüm işlemler tek seviye; "sadece görüntüleyen" satış personeli ile yönetici ayrımı imkânsız.
- **E6 — Audit log yok.** Kim hangi ürünü/teklifi/fiyatı ne zaman değiştirdi bilgisi tutulmuyor (created_at dışında değişiklik izi yok).

### 3.2 Veri Bütünlüğü & Validasyon

- **E7 — `customer_id` teklife yazılmıyor.** `QuoteCreate.customer_id` var (`server.py:496`) ama `create_quote` içindeki `quote_doc` (2293-2307) bu alanı kaydetmiyor. Sonuç: `GET /customers/{id}/quotes` (2045, `customer_id` ile filtreliyor) müşterinin tekliflerini **hiç döndüremez**. **Etki: Yüksek, somut hata.**
- **E8 — Fiyat/miktar validasyonu yok.** `list_price`, `quantity`, `discount_percentage`, `labor_cost` için negatif/aşırı değer kontrolü görünmüyor (Pydantic'te `ge=0` yok — `server.py:494-501`). İskonto %100'ü aşabilir, miktar 0/negatif olabilir.
- **E9 — Teklif anlık görüntü (snapshot) tutarlı ama fiyat değişimi izlenmiyor.** Teklif ürünleri `processed_products`'a kopyalanıyor (iyi), fakat sonradan ürün fiyatı değişince teklifin "güncel mi" olduğu belirsiz; geçerlilik tarihi yok.
- **E10 — Soft-delete tutarsızlığı.** Teklif `status: deleted` ile soft-delete (2352), ürünler ve firmalar `delete_one` ile **kalıcı** silinir (`server.py:2148`, `1857`). Silinen firma/ürün, eski tekliflerde "Unknown" olarak görünür (2274). Veri arkeolojisi/geri alma yok.
- **E11 — Cascade eksik.** Firma silinince (`1857`) ona bağlı ürünlerin ne olduğu belirsiz (**tahmin:** öksüz ürünler kalıyor).

### 3.3 Hata Yönetimi

- **E12 — `except Exception` ile 500'e sarma.** `create_quote` (2314), birçok uçta hatalar tek tip 500'e dönüştürülüyor; istemciye anlamlı hata kodu/mesajı dönmüyor. Frontend tarafında çoğu hata `toast.error('... yüklenemedi')` ile genelleştiriliyor (`App.js:1009,1039,1105`) — kullanıcı kök nedeni göremiyor.
- **E13 — Döviz fallback sessiz.** API başarısızsa varsayılan sabit kurlara düşülüyor (`server.py:702-739`) ve kullanıcı **arayüzde uyarılmıyor** (kurun "eski/varsayılan" olduğu belirtilmiyor). Yanlış fiyatlı teklif riski.
- **E14 — Optimistik UI/rollback eksikliği (tahmin).** Toplu güncelleme/silme gibi işlemlerde kısmi başarısızlıkta geri alma akışı belirsiz.

### 3.4 Performans

- **E15 — N+1 sorgu (teklif oluşturma).** `create_quote` döngüsünde her ürün için ayrı `db.companies.find_one` (`server.py:2246`). 50 ürünlük teklifte 50 sorgu. Çözüm: firmaları tek `$in` ile çek, dict'e al.
- **E16 — Tüm ürünleri tek seferde çekme.** Frontend `loadProducts` her zaman `skip_pagination=true` gönderiyor (`App.js:1086`) → 443 ürün şu an sorunsuz ama katalog büyüdükçe (binlerce ürün) ilk yükleme ve render maliyeti doğrusal artar. Sayfalama altyapısı backend'de **var** (`server.py:5419-5421`) ama frontend kullanmıyor.
- **E17 — Regex arama indekssiz.** Ürün araması 6 ayrı `$regex` `$or` ile (`server.py:5451-5469`); `i` opsiyonlu regex indeks kullanamaz → tam tarama. Çözüm: MongoDB text index veya önceden normalize edilmiş arama alanı.
- **E18 — Frontend cache tutarlılığı.** `CacheManager` kategorileri cache'liyor (`App.js:1114-1129`); kategori CRUD sonrası invalidasyon yapılmazsa bayat veri görünür (**tahmin: tam invalidasyon kapsamı doğrulanmadı**).
- **E19 — Teklif listesi sayfalamasız.** `GET /quotes` tüm aktif teklifleri çekiyor (`server.py:2322`); teklif arama tamamen frontend'de (`App.js:1050-1067`) → teklif sayısı arttıkça yavaşlar.

### 3.5 Eksik CRUD / Filtre / Arama / Sıralama

- **E20 — Teklif düzenleme kısıtlı.** `PUT /quotes/{id}` yalnızca `labor_cost`/`discount_percentage` vb. günceller (`server.py:2364-2393`); teklif kalemlerini (ürün ekle/çıkar/miktar) düzenleme yok → değişiklik için teklif baştan oluşturuluyor.
- **E21 — Teklif filtreleme/sıralama yok.** Tarihe, müşteriye, tutara, duruma göre filtre/sırala yok (yalnızca metin araması).
- **E22 — Ürün sıralama seçenekleri sınırlı.** Favori öncelikli sabit sıralama (`server.py:5471`); fiyata/ada/tarihe göre kullanıcı sıralaması yok.
- **E23 — Toplu işlem geri bildirimi.** `bulk-update-price` (6056) sonrası hangi ürünlerin değiştiği özet raporu (**tahmin**) yok.

### 3.6 Mobil / Responsive

- **E24 — Sabit geniş sidebar.** Sol menü `w-72` sabit, mobil için daralma/hamburger menü yok (`App.js:3478`). `isMobileDevice()` (`3360`) tanımlı ama menü kapanışı için kullanılmıyor. **Etki: Orta** (saha satışında telefon/tablet kullanımı muhtemel).
- **E25 — PDF canvas mobil.** Teklif "A4 canvas" iş alanı (`App.js:6016`) küçük ekranda kullanışsız olabilir (**tahmin**).

### 3.7 Çoklu Kullanıcı / İşbirliği

- **E26 — Eşzamanlı düzenleme koruması yok.** İki kullanıcı aynı ürünü/teklifi düzenlerse son yazan kazanır; sürüm/lock yok.
- **E27 — Kullanıcı bazlı görünüm yok.** "Benim tekliflerim", satış temsilcisi ataması yok (tek kullanıcı varsayımı).

---

## 4. Özellik Fikirleri (önceliklendirilmiş)

Efor: S (≤1 gün), M (birkaç gün), L (1+ hafta). Dosya referansları dokunulacak ana yerleri gösterir.

### Yüksek Öncelik

**F1 — Teklif Yaşam Döngüsü / Durum Akışı**
(a) Taslak → Gönderildi → Onaylandı/Reddedildi → Süresi Doldu durumları + `valid_until` tarihi.
(b) Satış hunisi görünürlüğü; "bekleyen teklifler" takibi; kapanma oranı ölçümü. Bir teklif aracının çekirdek değeri.
(c) Efor: **M.** (d) `server.py` Quote modeli (494-530) + `create_quote`/`update_quote` (2220-2393); `App.js` teklif listesi/rozetleri.

**F2 — Müşteri (CRM) Sekmesi + Teklif Bağı Düzeltmesi**
(a) Sol menüye Müşteriler sekmesi; müşteri kartında geçmiş teklifler/iletişim; `customer_id`'nin teklife yazılması (E7 fix).
(b) Tekrar eden müşteriye hızlı teklif; müşteri 360° görünümü. Backend %80 hazır, sadece UI + 1 satır fix.
(c) Efor: **S/M.** (d) `server.py:2293-2307` (customer_id ekle), `App.js:3501-3560` (sekme) + mevcut customer modalleri.

**F3 — Teklif Gönderimi (E-posta / WhatsApp / Link)**
(a) PDF'i e-posta ile gönder; WhatsApp "paylaş" linki; herkese açık görüntüleme linki (token'lı).
(b) Manuel indir-gönder döngüsünü kaldırır; müşteri deneyimini profesyonelleştirir.
(c) Efor: **M** (e-posta SMTP S; herkese açık link M). (d) Yeni `server.py` uçları + `quotes/{id}/pdf` yeniden kullanımı; `App.js` teklif aksiyonları.

**F4 — API Yetkilendirme Sertleştirmesi**
(a) Tüm yazma uçlarına `Depends(get_current_user)`; oturumları DB/Redis'e taşı; bcrypt.
(b) Veri kaybı/kötüye kullanım riskini kapatır (E1-E3).
(c) Efor: **S/M.** (d) `server.py` router tanımı + `get_current_user` (879).

**F5 — Dashboard / Raporlama**
(a) Aylık teklif sayısı/tutarı, kazanılan/kaybedilen, en çok teklif edilen ürünler, döviz etkisi.
(b) Yönetim kararları için görünürlük; satış performansı.
(c) Efor: **M.** (d) Yeni `server.py` agregasyon uçları; `App.js` yeni sekme.

### Orta Öncelik

**F6 — Teklif Şablonları & Versiyonlama**
(a) "Standart 200Ah sistem" gibi hazır teklif şablonları; aynı teklifin v1/v2 revizyonları.
(b) Tekrar eden işte hız; pazarlık turlarının izlenmesi.
(c) Efor: **M.** (d) Quote modeli + yeni `revision_of` alanı; paket altyapısı (4645+) örnek alınabilir.

**F7 — Stok Takibi Genişletme**
(a) Mevcut `/products/{id}/stock` (4604) üzerine stok hareketi, düşük stok uyarısı, teklif onayında stok düşümü.
(b) Sipariş/satın alma planlaması.
(c) Efor: **M.** (d) `server.py` stok uçları + teklif onay akışı (F1 ile bağlı).

**F8 — Döviz Geliştirmeleri & Uyarı**
(a) Fallback kullanılıyorsa UI'da "kur güncel değil" rozeti (E13); kur geçmişi grafiği; teklif başına kur kilidi.
(b) Yanlış fiyatlama riskini düşürür; pazarlıkta kur şeffaflığı.
(c) Efor: **S/M.** (d) `server.py:702-739` + exchange-rates uçları; `App.js:3582-3595` döviz çubuğu.

**F9 — PDF Özelleştirme**
(a) Şablon seçimi, kapak/şartlar sayfası, müşteri logosu, ödeme koşulları/garanti metni.
(b) Marka esnekliği; farklı müşteri segmentleri.
(c) Efor: **M.** (d) PDF üretim bölümü (`server.py:4219+`, reportlab).

**F10 — Teklif Kalemi Düzenleme (E20 fix)**
(a) Kayıtlı teklifte ürün ekle/çıkar/miktar/fiyat güncelleme.
(b) Baştan oluşturma sürtünmesini kaldırır.
(c) Efor: **M.** (d) `server.py:2364` `update_quote` genişletme; `App.js` teklif editörü.

### Düşük Öncelik

**F11 — Audit Log & Aktivite Akışı** — Değişiklik izi (E6). Efor: M. `server.py` ortak middleware + yeni koleksiyon.
**F12 — Rol Tabanlı Erişim** — Yönetici/satış/görüntüleyici (E5). Efor: M. Auth katmanı.
**F13 — Mobil/PWA İyileştirme** — Hamburger menü + responsive PDF (E24-25). Efor: M. `App.js:3478,6016`.
**F14 — Müşteri Self-Servis Portalı** — Müşteri tekliflerini link ile onaylar. Efor: L. F3 link altyapısı üzerine.
**F15 — Çoklu Para Birimi Gösterimi** — Teklifte TRY yanında USD/EUR karşılığı. Efor: S. PDF + teklif görünümü.

---

## 5. Önceliklendirme Matrisi (Etki × Efor)

| | Düşük Efor (S) | Orta Efor (M) | Yüksek Efor (L) |
|---|---|---|---|
| **Yüksek Etki** | F2 (CRM bağı/E7), F4 (auth), F8 (kur uyarısı) | F1 (durum akışı), F3 (gönderim), F5 (dashboard), F10 (kalem düzenleme) | F14 (portal) |
| **Orta Etki** | F15 (çoklu para) | F6 (şablon/versiyon), F7 (stok), F9 (PDF) | — |
| **Düşük Etki** | — | F11 (audit), F12 (rol), F13 (mobil) | — |

**Hızlı kazanımlar (önce yap):** E7 fix + F2, F4, F8 — düşük efor, yüksek etki.

---

## 6. Önerilen Yol Haritası

### Kısa Vade (1-2 hafta) — "Doğru ve güvenli temel"
1. **E7 düzeltmesi:** `customer_id`'yi `quote_doc`'a yaz (`server.py:2306` civarı). Müşteri-teklif bağını onar.
2. **F4:** Yazma uçlarına auth ekle, oturumları DB'ye taşı, bcrypt'e geç (E1-E3).
3. **E8:** Pydantic validasyonları (`ge=0`, iskonto ≤100).
4. **E15:** Teklif oluşturmada N+1'i `$in` ile gider.
5. **F8 (kısmi):** Fallback kur kullanılınca UI uyarısı (E13).

### Orta Vade (1-2 ay) — "Satış süreci ürünü"
6. **F2:** Müşteriler sekmesi + müşteri 360°.
7. **F1:** Teklif durum akışı + geçerlilik tarihi.
8. **F3:** E-posta ile teklif gönderimi (SMTP) → ardından paylaşım linki.
9. **F10:** Teklif kalemi düzenleme.
10. **F5:** Temel dashboard (teklif sayısı/tutarı/durum dağılımı).

### Uzun Vade (3+ ay) — "Ölçeklenme ve farklılaşma"
11. **F6/F7:** Şablon+versiyon, stok-teklif entegrasyonu.
12. **F9:** PDF özelleştirme/şablonları.
13. **E16/E17/E19:** Katalog/teklif büyüdükçe sayfalama + arama indeksi.
14. **F13/F12/F11/F14:** Mobil/PWA, roller, audit, müşteri portalı.

---

## Ek Notlar (yöntem & sınırlar)
- Endpoint sayımı Grep ile çıkarıldı; iç içe/duplicate uçlar olabilir (örn. `/products/favorites` iki kez: 4634 ve 5119; `/packages/{id}` PUT iki kez: 4682 ve 4853 — **olası ölü/çakışan route, doğrulanmalı**).
- "Tahmin" işaretli maddeler kod üzerinde satır bazında doğrulanmadı; uygulama öncesi teyit önerilir.
- Veri büyüklüğü: 443 ürün, 43 teklif, müşteri JSON yedeği kökte yok (müşteri verisi yalnızca DB'de — **tahmin**).
- Kod değiştirilmedi; bu rapor yalnızca `reports/` altına yazıldı.
