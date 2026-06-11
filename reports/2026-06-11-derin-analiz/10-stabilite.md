# Stabilite Analizi (Codex, 2026-06-11)

Statik analiz; tek uvicorn instance + Raspberry Pi hedefi.

## Özet Risk Tablosu

| Seviye | Risk | Etki |
|---|---|---|
| P0 | PDF/Excel/AI/scrape ağır işleri async endpoint içinde senkron / default executor'da | Pi'de istek donması, RAM sıçraması, 504 |
| P0 | Büyük listeler RAM'de: to_list(None), skip_pagination, rows, base64 | 1-2GB Pi'de OOM/swap |
| P1 | Scraper süre + eşzamanlılık kontrolü yok | 180 sayfa crawl + 2. scrape + scheduler çakışması |
| P1 | Mongo retention yok: upload_history, import_sessions, wiring_files, contracts.file_b64 | Disk/RAM, sorgular zamanla yavaşlar |
| P1 | Frontend 5000 ürünü tek seferde çekip render ediyor | Tarayıcı bellek + render gecikmesi |
| P2 | Regex aramalar text index'i baypas ediyor | CPU artışı |
| P2 | createObjectURL akü preview'larında unmount temizliği yok | Uzun oturumda bellek artışı |

## Bulgular

1. **P0 — PDF üretimi event loop'u bloke ediyor** (server.py:3029, 3984, 9108, 11867): ReportLab doğrudan endpoint içinde. Aynı anda 2-3 PDF → tek loop gecikir. **Fix**: sınırlı ThreadPoolExecutor(1-2) + semaphore + timeout.
2. **P0 — Global thread pool tanımlı ama kullanılmıyor** (server.py:319): her şey `run_in_executor(None,...)` default havuza. **Fix**: io_executor=2, cpu_executor=1, ai_executor=1 + Semaphore.
3. **P0 — Sınırsız RAM yüklemeleri**: to_list(None) (server.py:2535, 6575, 6726, 6814, 7042); kur yenileme tüm koleksiyonu çekiyor. **Fix**: cursor streaming, batch_size(500), zorunlu limit.
4. **P0 — Base64 saklama** (App.js:2255 servis foto, server.py:10512 contracts file_b64, 9441 wiring): %33 şişme + decode'da ikinci kopya. **Fix**: filesystem/GridFS'e geç; en azından TTL + toplam boyut limiti.
5. **P1 — Scraper süreleri** (server.py:7600 Termosa 180 sayfa, 6118 auto-sync 4000, 7732 Agus 60 sayfa): sayfa başına 30 sn timeout → kötü ağda dakikalar. **Fix**: job kilidi, toplam deadline, server-side clamp, aynı anda max 1 scrape.
6. **P1 — BackgroundScheduler kırılgan** (server.py:927, 961): scheduler uzun scrape'i ana loop'a gönderiyor, manuel scrape ile yarışır; lock yok. **Fix**: asyncio.Lock / lock koleksiyonu; sync'i ayrı systemd timer'a almak daha stabil.
7. **P1 — Mongo retention** (server.py:150 sadece sessions TTL; 165 import_sessions TTL'siz; 6814 upload_history sınırsız). **Fix**: import_sessions TTL 7-30 gün; upload_history sayfalama+retention; price_changes ilk N.
8. **P1 — Frontend skip_pagination** (App.js:1345, render 8813; VirtualizedTable.js:5 VAR ama KULLANILMIYOR). **Fix**: gerçek pagination, server-side arama, VirtualizedTable kullan ya da kaldır.
9. **P2 — AI retry/circuit breaker yok** (server.py:8079 timeout 120): kullanıcı tekrar tıklarsa paralel iş. **Fix**: AI semaphore=1, job status, 429/5xx için backoff.
10. **P2 — Regex arama text index kullanmıyor** (server.py:84 index var, 6527 regex). **Fix**: 3+ karakterde $text, normalize search_name alanı.

## Pi Deploy Öncesi ŞART

1. PDF/PIL/Excel/scrape/AI için ayrı sınırlı executor + semaphore.
2. to_list(None) + skip_pagination ana akışlardan kalkmalı.
3. Scraper tekil job kilidi + toplam timeout + server-side sınırlar.
4. import_sessions/upload_history/wiring_files/sözleşme dosyaları retention.
5. Ürün ekranı sanallaştırma ya da sayfalama.
6. systemd: MemoryMax, Restart=on-failure, log rotation; nginx upload limiti MAX_UPLOAD_MB ile uyumlu.
