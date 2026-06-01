# Karavan — Güvenlik Denetim Raporu (Defansif AppSec)

**Tarih:** 2026-06-01
**Kapsam:** `backend/server.py` (~7400 satır), `frontend/src/App.js` (~8300 satır), `nginx.conf`, `cloudflare-worker.js`, `requirements.txt`, `frontend/package.json`, `.env` (sadece anahtar adları incelendi, değerler raporlanmadı).
**Yöntem:** Yalnızca okuma + statik analiz. Kod değiştirilmedi. Sömürü/exploit üretilmedi.

> Not: `.env` içeriği, şifreler ve API anahtarları bu rapora **yazılmamıştır**. Sadece konum ve risk işaretlenmiştir.

---

## ÖZET

En kritik problem: **74 API endpoint'inden yalnızca 1 tanesi kimlik doğrulaması istiyor.** Tüm veri yazma/silme işlemleri (ürün/teklif/firma/paket silme, Excel yükleme, toplu fiyat güncelleme) kimlik doğrulaması olmadan herkese açık. Uygulama `corlukaravan.shop` üzerinden internete açık olduğundan bu, doğrudan ve uzaktan sömürülebilir bir risktir. Bunun yanında zayıf parola hash'i (düz SHA-256), hardcoded admin şifresi, kalıcı olmayan (in-memory) oturum yönetimi ve rate limiting eksikliği öne çıkan diğer bulgulardır.

---

## BULGULAR

### 1. Yazma/silme endpoint'lerinde kimlik doğrulaması YOK (yetkisiz erişim)
- **Önem:** Kritik
- **Konum:** `backend/server.py` — endpoint tanımlarının neredeyse tamamı. Örnekler:
  - `1857: @api_router.delete("/companies/{company_id}")`
  - `1991: @api_router.delete("/customers/{customer_id}")`
  - `2148: @api_router.delete("/products/{product_id}")`
  - `2346: @api_router.delete("/quotes/{quote_id}")`
  - `4989: @api_router.delete("/packages/{package_id}")`
  - `5129: @api_router.post("/companies/{company_id}/upload-excel")`
  - `6056: @api_router.post("/products/bulk-update-price")`
  - `6115: @api_router.post("/products/bulk-update-category")`
- **Kanıt:** Dosyada 74 adet `@api_router.(get|post|put|delete|patch)` var; ancak `Depends(get_current_user)` (zorunlu auth) **yalnızca 1 yerde** kullanılıyor:
  ```python
  # 7335
  @api_router.post("/market-price-search")
  async def market_price_search(request: MarketPriceRequest, current_user: str = Depends(get_current_user)):
  ```
  Geriye kalan tüm silme/yükleme/güncelleme endpoint'lerinde hiçbir auth bağımlılığı yok. `get_current_user` ve `get_current_user_optional` fonksiyonları (satır 879, 891) tanımlanmış ama kullanılmamış.
- **Etki:** İnternetteki herhangi biri `DELETE /api/products/{id}` veya `/api/upload-excel` çağırarak tüm iş verisini silebilir/bozabilir, sahte teklif/ürün ekleyebilir, fiyatları toplu değiştirebilir. Login ekranı yalnızca frontend'de görsel bir engel; API doğrudan erişime açık.
- **Düzeltme önerisi:** Tüm veri-mutasyonu (ve muhtemelen okuma) endpoint'lerine auth zorunlu kılın. Router seviyesinde global bağımlılık eklemek en sağlam çözüm:
  ```python
  api_router = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)])
  # login/logout/check ve genel görüntüleme endpoint'leri için ayrı, korumasız router kullanın.
  ```
  Alternatif: her mutasyon endpoint'ine `current_user: str = Depends(get_current_user)` parametresi ekleyin.

---

### 2. Parola düz SHA-256 ile saklanıyor (salt/iteration yok)
- **Önem:** Yüksek
- **Konum:** `backend/server.py:818-824`
  ```python
  def hash_password(self, password: str) -> str:
      return hashlib.sha256(password.encode()).hexdigest()
  def verify_password(self, password: str, password_hash: str) -> bool:
      return self.hash_password(password) == password_hash
  ```
- **Etki:** SHA-256 tek geçişli ve salt'sız. DB sızarsa parolalar GPU ile çok hızlı kırılır; aynı parolalar aynı hash'i üretir (rainbow table). `passlib` zaten `requirements.txt` içinde mevcut ama kullanılmıyor.
- **Düzeltme önerisi:** `passlib`/bcrypt'e geçin:
  ```python
  from passlib.context import CryptContext
  pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
  def hash_password(self, p): return pwd_context.hash(p)
  def verify_password(self, p, h): return pwd_context.verify(p, h)
  ```
  Ayrıca `verify_password` sabit-zamanlı karşılaştırma sağlamıyor (timing). bcrypt bunu çözer.

---

### 3. Hardcoded varsayılan admin parolası
- **Önem:** Yüksek
- **Konum:** `backend/server.py:867`
  ```python
  "password_hash": auth_service.hash_password("corlukaravan.5959"),
  ```
  Kullanıcı adı sabit: `karavan_admin` (satır 866).
- **Etki:** Admin parolası kaynak kodda açık metin. Repo'ya/koda erişen herkes (veya kod sızıntısı) doğrudan giriş yapabilir. Domain isminden tahmin edilebilir bir parola.
- **Düzeltme önerisi:** Parolayı koddan çıkarın; ilk kurulumda `os.environ['ADMIN_INITIAL_PASSWORD']`'tan okuyun veya kurulum sırasında rastgele üretip operatöre gösterin. Mevcut parolayı **derhal değiştirin** (koda yazıldığı için artık "yanmış" kabul edilmeli). Parola değiştirme endpoint'i ekleyin.

---

### 4. Oturumlar in-memory; ölçeklenmiyor ve yeniden başlatmada düşüyor
- **Önem:** Orta
- **Konum:** `backend/server.py:816` (`self.sessions = {}`), 826-847
- **Etki:** Oturumlar süreç belleğinde. Sunucu/worker yeniden başlayınca tüm oturumlar düşer. Birden fazla uvicorn worker çalışırsa oturumlar paylaşılmaz (rastgele 401). Süresi dolan oturumlar yalnızca erişildiğinde temizleniyor — bellek birikebilir. Doğrudan güvenlik açığından çok dayanıklılık/DoS riski, ancak oturum kaybı kullanıcıları zayıf çözümlere itebilir.
- **Düzeltme önerisi:** Oturumları MongoDB'de (TTL index ile) veya imzalı JWT (PyJWT zaten kurulu) ile yönetin. Süre dolan oturumlar için periyodik temizlik / TTL.

---

### 5. CORS yapılandırması `allow_credentials=True` ile birlikte env'e bağımlı; yanlış ayarda wildcard riski
- **Önem:** Orta (yapılandırmaya bağlı — **doğrulanmalı**)
- **Konum:** `backend/server.py:212-218`
  ```python
  app.add_middleware(CORSMiddleware,
      allow_credentials=True,
      allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
      allow_methods=["*"], allow_headers=["*"])
  ```
- **Etki:** `CORS_ORIGINS` env değişkeni tanımsız kalırsa varsayılan `'*'` olur. `allow_credentials=True` + `*` kombinasyonu tarayıcılarca reddedilse de, env'e `*` yazılırsa veya birden çok güvensiz origin eklenirse credential'lı CSRF benzeri çapraz-origin istekler mümkün olur. `.env` içinde `CORS_ORIGINS` anahtarı mevcut (değeri raporlanmadı) — **prod değerinin yalnızca `https://corlukaravan.shop` olduğu doğrulanmalı.**
- **Düzeltme önerisi:** Varsayılanı `'*'` yerine boş/güvenli yapın; origin listesini açıkça sabitleyin. `allow_methods`/`allow_headers` için gerçekten gerekli olanları belirtin.

---

### 6. CloudFlare Worker'da `Access-Control-Allow-Origin: *`
- **Önem:** Orta
- **Konum:** `cloudflare-worker.js:39-41` ve `66-68`
  ```js
  newResponse.headers.set('Access-Control-Allow-Origin', '*')
  ...
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  ```
- **Etki:** `/api/exchange-rates` yanıtlarına wildcard CORS ekleniyor. Bu endpoint hassas değil (kur verisi) ama `Authorization` header'ına izin verilmesi ve wildcard kalıbı, genişletilirse risk taşır. Worker yalnızca exchange-rates'e uyguluyor; yine de güvenli origin tercih edilmeli.
- **Düzeltme önerisi:** Wildcard yerine `https://corlukaravan.shop` belirtin. Gerekmiyorsa `Authorization` header'ını CORS izninden çıkarın.

---

### 7. Olası Path Traversal — `/api/atlas-downloads/{filename}`
- **Önem:** Orta (**doğrulanmalı**)
- **Konum:** `backend/server.py:6278-6294`
  ```python
  @api_router.get("/atlas-downloads/{filename}")
  async def download_file(filename: str):
      file_path = f"/app/downloads/{filename}"
      if not os.path.exists(file_path): ...404
      if not filename.endswith('.json'): ...400
      return FileResponse(file_path, ...)
  ```
- **Etki:** `filename` doğrudan path'e gömülüyor; sanitize edilmiyor. `.json` ile bitme zorunluluğu saldırı yüzeyini daraltsa da, `../../<bir dizin>/<dosya>.json` biçiminde `.json` uzantılı dosyalar `/app/downloads` dışından okunabilir. FastAPI path param'ı tek path segmenti olarak yakalar ama URL-encoded `%2f` ile bypass denenebilir. Endpoint ayrıca **auth'suz** (Bulgu 1).
- **Düzeltme önerisi:** Dosya adını whitelist'le veya `os.path.basename(filename)` uygulayıp çözülen yolun `/app/downloads` altında kaldığını doğrulayın:
  ```python
  base = Path("/app/downloads").resolve()
  target = (base / filename).resolve()
  if base not in target.parents or not target.name.endswith(".json"):
      raise HTTPException(400)
  ```

---

### 8. SSRF — `/api/scrape-products` kullanıcı URL'sini sunucudan çekiyor
- **Önem:** Orta
- **Konum:** `backend/server.py:6387-6401`
  ```python
  @api_router.post("/scrape-products")
  async def scrape_products(request: ScrapeRequest):
      response = requests.get(request.url, headers=headers, timeout=30)
  ```
- **Etki:** Kullanıcının verdiği `request.url` sunucu tarafından çağrılıyor; doğrulama yok. Saldırgan `http://169.254.169.254/...` (cloud metadata), `http://127.0.0.1:8001/...` veya iç ağ adreslerini hedefleyebilir (SSRF). Endpoint **auth'suz**. Raspberry Pi'de metadata servisi olmasa da iç ağ taraması/iç servis erişimi mümkün.
- **Düzeltme önerisi:** URL şemasını `http/https` ile sınırlayın; çözülen IP'nin özel/loopback/link-local aralıkta olmadığını kontrol edin; mümkünse domain whitelist. Ayrıca endpoint'i auth arkasına alın.

---

### 9. Rate limiting / brute-force koruması yok
- **Önem:** Orta
- **Konum:** Tüm uygulama; özellikle `backend/server.py:6303 /auth/login`. `requirements.txt` içinde `slowapi`/limiter yok; kodda hiçbir rate-limit referansı bulunamadı (0 eşleşme).
- **Etki:** Login endpoint'ine sınırsız deneme yapılabilir → parola brute-force. Zayıf hash (Bulgu 2) ve tahmin edilebilir parola (Bulgu 3) ile birlikte ciddi. Ağır endpoint'ler (Excel parse, PDF üretimi, scrape, Gemini) auth'suz olduğundan kaynak tüketimi/DoS'a da açık.
- **Düzeltme önerisi:** `slowapi` ile login'e IP başına limit (örn. 5/dak). Başarısız denemelerde gecikme/geçici kilit. Pahalı endpoint'lere ayrı limit.

---

### 10. Session cookie `secure=False`
- **Önem:** Orta (**deploy bağlamında doğrulanmalı**)
- **Konum:** `backend/server.py:6336`
  ```python
  response.set_cookie(..., httponly=True, secure=False, samesite="lax")
  ```
- **Etki:** `secure=False` olduğundan cookie HTTP üzerinden de gönderilebilir. Site CloudFlare arkasında HTTPS olsa bile, origin'e HTTP erişimi varsa cookie açık ağ üzerinden sızabilir. Kod yorumu da "Set True in production" diyor. `httponly=True` ve `samesite="lax"` iyi seçimler.
- **Düzeltme önerisi:** Prod'da `secure=True` yapın. CSRF açısından `samesite="strict"` değerlendirilebilir (UX'e göre).

---

### 11. `$regex` aramalarında ham kullanıcı girdisi (ReDoS)
- **Önem:** Düşük/Orta
- **Konum:** `backend/server.py:1909, 5388-5389, 5453-5468, 5553-5558`
  ```python
  search_regex = {"$regex": search, "$options": "i"}
  {"name": {"$regex": f"^{search}", "$options": "i"}}
  ```
- **Etki:** Kullanıcı arama metni doğrudan regex olarak Mongo'ya gönderiliyor. Klasik NoSQL operatör injection değil (alanlar tipli string), ancak kötü niyetli regex (örn. çok sayıda `*`, geri-izleme tetikleyen kalıp) DB üzerinde pahalı tarama / ReDoS'a yol açabilir. Pydantic alanları `$ne`/`$gt` gibi operatör dict'i kabul etmediğinden operatör injection riski düşük.
- **Düzeltme önerisi:** Aramadan önce `re.escape(search)` uygulayın; arama uzunluğunu sınırlayın; mümkünse Mongo text index kullanın.

---

### 12. Dosya upload doğrulaması zayıf (boyut limiti ve içerik doğrulama eksik)
- **Önem:** Düşük/Orta
- **Konum:**
  - `backend/server.py:5139` — `if not file.filename.endswith(('.xlsx', '.xls'))` (yalnızca uzantı kontrolü, içerik/MIME değil; boyut sınırı yok, `await file.read()` tüm dosyayı belleğe alıyor — satır 5143).
  - `backend/server.py:6725` — battery-analysis `content_type.startswith('image/')` kontrol ediyor ama `content_type` istemci tarafından kolayca sahtelenebilir; boyut limiti yok (10 dosyaya kadar, satır 6719).
- **Etki:** Büyük dosya yükleyerek bellek/DoS. Uzantı/MIME kolay atlatılır. nginx `client_max_body_size 50M` global bir tampon sağlıyor ama uygulama seviyesinde kontrol yok. Excel parse (openpyxl) büyük/kötü biçimli dosyada zip-bomb benzeri kaynak tüketimine açık olabilir.
- **Düzeltme önerisi:** Yükleme öncesi boyut kontrolü (örn. 10-20MB), MIME magic-byte doğrulaması, `openpyxl` için `read_only=True`. Bu endpoint'ler auth arkasına alınmalı (Bulgu 1).

---

### 13. IDOR — kaynak ID'leri ile erişim, sahiplik kontrolü yok
- **Önem:** Düşük (mevcut tek-tenant modelde; **iş modeli doğrulanmalı**)
- **Konum:** Teklif/paket/PDF endpoint'leri, örn. `4220 download_quote_pdf(quote_id)`, `2346 delete quote`.
- **Etki:** Kaynaklar `uuid4` ile üretiliyor (tahmin zor, satır 865 vb.), ancak hiçbir endpoint kullanıcı/sahiplik kontrolü yapmıyor. Uygulama tek admin kullanıcılı olduğundan klasik IDOR sınırlı; fakat Bulgu 1 ile birleşince auth olmadan herkes herhangi bir quote_id PDF'ini indirebilir. UUID sızması (URL paylaşımı, loglar) erişim verir.
- **Düzeltme önerisi:** Önce auth zorunlu kılın (Bulgu 1). Çok kullanıcılı modele geçilirse kayıt sahipliğini kontrol edin.

---

### 14. Frontend `dangerouslySetInnerHTML` kullanımı
- **Önem:** Düşük
- **Konum:** `frontend/src/App.js:228, 233`
  ```jsx
  <span dangerouslySetInnerHTML={{ __html: trimmed.slice(2).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
  ```
- **Etki:** Gemini AI yanıt metnini render ediyor. Regex yalnızca `**...**` → `<b>` dönüşümü yapıyor; ham `<script>` gibi girdiler de `__html` ile aynen DOM'a yazılır. Kaynak AI çıktısı olduğundan ve girdi görsellerden türediğinden risk düşük, ancak prensip olarak güvenli değil. Diğer hassas alanlarda kullanılmıyor.
- **Düzeltme önerisi:** Markdown'ı güvenli bir kütüphane (örn. `react-markdown` + sanitize) veya DOMPurify ile işleyin; ya da düz metin + manuel `<b>` segmentasyonu yapın (HTML enjekte etmeden).

---

### 15. Bağımlılıklar — `react-scripts 5.0.1` ve eski transitive paketler
- **Önem:** Düşük (çoğunlukla build/dev zamanı)
- **Konum:** `frontend/package.json` (`react-scripts ^5.0.1`), `backend/requirements.txt`.
- **Etki:** `react-scripts 5.0.1`, bilinen uyarılı transitive bağımlılıklar (nth-check, postcss, webpack-dev-server vb.) içerir; bunlar genelde build/dev zamanı, prod runtime'da değil. Backend tarafında `pymongo 4.5.0`, `fastapi 0.110.1`, `starlette 0.37.2`, `Pillow 10.1.0` gibi paketler güncel değil; `Pillow` ve `lxml`/`beautifulsoup4` parse eden paketlerde geçmişte CVE'ler olmuştur. **Tam CVE eşlemesi için `npm audit` / `pip-audit` çalıştırılmalı (doğrulanmalı).**
- **Düzeltme önerisi:** `pip-audit` ve `yarn audit`/`npm audit` çalıştırıp kritik/yüksek olanları güncelleyin. Özellikle `Pillow`'u güncel tutun (görsel parse eder).

---

### 16. Hata/log yönetimi ve bilgi sızıntısı
- **Önem:** Düşük
- **Konum:** Yaygın `print(...)` ve `logger.error(f"...: {e}")` kullanımı (örn. 6394, 6403, 6556; login hatası 6345). Frontend'de login akışında bol `console.log` (App.js:901-937) — istek/yanıt header'larını logluyor.
- **Etki:** Sunucu loglarına stack/iç detay yazılması saldırgana ipucu verebilir (düşük). Frontend console.log'ları üretimde gereksiz; header dökümü hassas olmasa da temizlenmeli.
- **Düzeltme önerisi:** Üretimde debug log'ları kaldırın; istemciye genel hata mesajı dönün (zaten çoğunlukla yapılıyor). Frontend `console.log`'larını üretim build'inde temizleyin.

---

## OLUMLU NOTLAR (doğru yapılanlar)
- Secret'lar koddan `os.environ` ile okunuyor (FREECURRENCY, GEMINI, MONGO) — **kodda hardcoded API anahtarı bulunamadı** (tek istisna: admin parolası, Bulgu 3).
- `.gitignore` `.env` ve secret içeren dosyaları kapsamlı şekilde dışlıyor.
- Oturum token'ı `secrets.token_urlsafe(32)` ile kriptografik olarak güçlü üretiliyor (satır 828).
- Cookie `httponly=True` + `samesite="lax"` (yalnızca `secure` eksik, Bulgu 10).
- Frontend token'ı localStorage'da tutmuyor; oturum httpOnly cookie ile yönetiliyor (App.js:911 `credentials: 'include'`). localStorage yalnızca teklif taslağı (hassas değil) için kullanılıyor.
- Login response sabit/genel mesaj veriyor ("Geçersiz kullanıcı adı veya şifre") — kullanıcı sayımı sızdırmıyor (satır 6310/6314).
- Pydantic modelleri tipli string alanlar kullanıyor → klasik NoSQL operatör injection yüzeyi dar.
- nginx temel güvenlik başlıkları ekliyor (X-Frame-Options, X-Content-Type-Options).

---

## ÖNCELİKLİ DÜZELTME LİSTESİ (Top 10)

| # | Bulgu | Önem | Aksiyon |
|---|-------|------|---------|
| 1 | Endpoint'lerde auth yok (Bulgu 1) | Kritik | Router'a global `Depends(get_current_user)` ekle; login/check hariç tüm mutasyonları koru |
| 2 | Hardcoded admin parolası (Bulgu 3) | Yüksek | Parolayı koddan çıkar, hemen değiştir, env/kurulumdan üret |
| 3 | Düz SHA-256 parola hash (Bulgu 2) | Yüksek | bcrypt/passlib'e geç, sabit-zamanlı doğrulama |
| 4 | Rate limiting yok (Bulgu 9) | Orta | Login + pahalı endpoint'lere slowapi limiti |
| 5 | SSRF /scrape-products (Bulgu 8) | Orta | URL şema+IP doğrulaması, iç ağ engeli, auth |
| 6 | Path traversal /atlas-downloads (Bulgu 7) | Orta | `basename` + base-dir doğrulaması, auth |
| 7 | CORS varsayılan `*` (Bulgu 5) | Orta | Prod origin'i sabitle, varsayılanı güvenli yap; CF worker wildcard'ı kaldır (Bulgu 6) |
| 8 | Cookie `secure=False` (Bulgu 10) | Orta | Prod'da `secure=True` |
| 9 | Upload doğrulaması + boyut (Bulgu 12) | Orta | Boyut limiti, magic-byte/MIME doğrulaması, read-only parse |
| 10 | In-memory oturum (Bulgu 4) | Orta | DB/TTL veya JWT tabanlı oturum |

---

## DOĞRULANMASI GEREKENLER
- `CORS_ORIGINS` prod env değeri gerçekten tek/güvenli origin mi? (Bulgu 5)
- `/atlas-downloads/{filename}` URL-encoded `%2f` ile traversal'a açık mı? (canlı test, Bulgu 7)
- Bağımlılıkların tam CVE durumu: `pip-audit` + `yarn audit` çıktısı (Bulgu 15).
- Uygulamanın çok kullanıcılı olma planı var mı? Varsa IDOR/sahiplik kontrolü zorunlu (Bulgu 13).
