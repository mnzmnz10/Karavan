# Güvenlik Denetimi — Derin Analiz (Codex, 2026-06-11)

Statik kod taraması; canlı sisteme istek atılmadı. Önceki fix'lerin (bcrypt, global auth middleware, scrape SSRF, atlas traversal, CORS, rate-limit) ÖTESİNDEKİ bulgular.

## Özet Risk Tablosu

| Seviye | Bulgu | Durum |
|---|---|---|
| P0 | Doğrulanmış kritik bypass/RCE | Kesin P0 kanıtı yok |
| P1 | SSRF: wiring-remove-bg, redirect'li /scrape-products, _termosa_scrape | Deploy blocker |
| P1 | $regex kullanıcı girdisi escape'siz (ReDoS/injection) | Deploy blocker |
| P1 | /downloads mount auth kapsamı DIŞINDA | Deploy blocker (deployment'a bağlı) |
| P1 | Upload/parser DoS + content-type spoofing + SVG XSS | Deploy blocker |
| P1 | Rol/yetki modeli yok — her oturum admin gücünde | Deploy blocker |
| P2 | str(e) iç detay sızıntısı | Düzelt |
| P2 | Excel formula injection / ReportLab markup injection | Düzelt |
| P2 | Session hardening eksikleri | Düzelt |
| P2 | Secrets/env operasyonel riskler | Doğrula |

## Bulgular

### 1. /downloads auth dışı statik mount (server.py:292, 7342, 7383)
Auth middleware sadece `/api`'yi koruyor; `app.mount("/downloads", StaticFiles("/app/downloads"))` tamamen dışarıda. /app/downloads'a backup/export konursa oturumsuz okunur. **Fix**: mount'u kaldır ya da auth'a al; Pi'de 8001 dışa kapalı olduğunu doğrula.

### 2. SSRF: wiring-remove-bg (server.py:9573, 9581)
`req.image_url` doğrudan requests.get — _validate_public_http_url YOK. İç ağ taranabilir; hata mesajı detay döndürüyor. **Fix**: aynı SSRF guard + redirect doğrulama + size/content-type limiti; mümkünse sadece image_id kabul.

### 3. SSRF: /scrape-products redirect bypass (server.py:7826, 7859)
İlk URL doğrulanıyor ama requests.get redirect takip ediyor; redirect hedefi doğrulanmıyor. Public domain 302 → 127.0.0.1 olabilir. **Fix**: allow_redirects=False ya da her hop'u doğrula + max redirect + byte limiti.

### 4. SSRF: _termosa_scrape tam URL kabul ediyor (server.py:7554, 7593)
category_urls'te `http...` gelirse host sınırlanmıyor → arbitrary fetch. **Fix**: sadece path kabul et ya da hostname==bayi.termosa.com zorunlu.

### 5. NoSQL regex injection / ReDoS (server.py:2177, 6465, 6530-6545, 6630-6635)
customers.search + products.search girdiyi escape'siz $regex'e koyuyor; `.*` tümünü döndürür, karmaşık payload CPU yer. **Fix**: re.escape + max uzunluk + pagination; mümkünse text index.

### 6. Upload: content-type spoofing + parser DoS (server.py:51, 6353, 8523, 9425, 10475)
MIME header'a güveniliyor; tüm dosya belleğe; wiring-upload magic-byte doğrulamadan base64 kaydediyor. Dev piksel image, zip-bomb xlsx, SVG (stored XSS) riskleri. **Fix**: magic-byte, Image.verify + MAX_IMAGE_PIXELS, raster-only allowlist, zip ratio limiti, timeout; SVG kabul etme.

### 7. str(e) bilgi sızıntısı (server.py:1258, 1535, 2484, 2635-2848, 8046-8049, 9121, 9345, 9587, 9620)
Path/stack/iç URL detayları client'a dönüyor. **Fix**: generic mesaj + server log'a detay + secret redaction.

### 8. PDF/Excel injection (server.py:7084-7096, 10629-10681, 11310, 11430, 11449, 11545)
Excel hücrelerine `=HYPERLINK(...)` formül injection; ReportLab Paragraph'a escape'siz markup. **Fix**: `=+-@` başlangıçlarına `'` prefix; xml.sax.saxutils.escape.

### 9. Yetki modeli yok (server.py:1066, 292-303)
Oturum var/yok kontrolü var, rol yok; request.state.username kullanılmıyor. İkinci kullanıcı = tam admin. **Fix**: role admin/operator/read_only; delete/bulk/import/scraper/settings admin-only.

### 10. Session hardening (server.py:1029-1060, 7395, 7452, 7479)
Login body'de session_token dönüyor (cookie yeter); COOKIE_SECURE default false; logout delete_cookie parametreleri set_cookie ile eşleşmiyor; rate-limit X-Forwarded-For'a doğrudan güveniyor (8001 dışa açıksa spoof). **Fix**: token'ı body'den kaldır; prod'da COOKIE_SECURE=true fail-fast; trusted proxy dışı XFF kabul etme.

### 11. Secrets/env (server.py:54, 1073, 7531, 8055, 8060)
Eksik secret hatasında "backend/.env" bilgisi client'a dönüyor; .env tracked olmadığı doğrulanmalı; sızan sırlar (Mongo/OpenAI/FreeCurrency) hâlâ ROTATE EDİLMEDİ. **Fix**: generic 500; rotate.

## Pi Deploy Öncesi ŞART

1. /downloads mount kaldır/koru; 8001 dışa kapalı.
2. Ortak SSRF guard: remove-bg + termosa + scrape (redirect dahil).
3. Tüm $regex'lerde re.escape + uzunluk + limit.
4. Upload hardening (magic-byte, pixel, zip-bomb, timeout).
5. str(e) → generic mesaj.
6. Excel formül + ReportLab escape.
7. Prod env: COOKIE_SECURE=true, CORS daralt, .env doğrula, secret ROTATE.
8. Admin-only rol modeli (en azından destructive/import/scraper).
