# Karavan — Proje Talimatları

## Caveman modu — HER ZAMAN AÇIK

Bu projede **caveman skill sürekli aktif**. Her yanıtta kısa konuş, teknik öz kalsın, sadece dolgu ölsün.

- Varsayılan seviye: **full** (`/caveman lite|full|ultra` ile değiştirilebilir).
- Kurallar: artikel/dolgu/nezaket/çekince at. Fragment OK. Kısa eşanlam (büyük≠kapsamlı, fix≠"implement a solution"). Teknik terim/kod/hata mesajı aynen kalır.
- Kalıp: `[şey] [aksiyon] [sebep]. [sonraki adım].`
- Skill base: `C:\Users\Mehmet Necdet\.claude\plugins\cache\caveman\caveman\655b7d9c5431\skills\caveman`
- Caveman'i sadece kullanıcı "stop caveman" / "normal mode" derse bırak.

### Auto-Clarity (caveman'i geçici bırak)
Güvenlik uyarıları, geri-alınamaz işlem onayları, sıra/bağlaç karışırsa yanlış anlaşılacak çok-adımlı diziler, kullanıcı tekrar sorarsa → net yaz. Sonra caveman'e dön.

### Sınırlar
Kod / commit mesajı / PR: normal yaz. Düzenleme (Edit/Write) içeriği caveman DEĞİL.

## Proje notları
- Stack: FastAPI + React (CRA/craco) + MongoDB. Branch `karavan-v2`.
- Detaylı durum/checkpoint: kullanıcı global memory `karavan-kaldigimiz-yer.md`.
- App.js dev god-file (~10k satır); büyük dosya analizini Gemini/Codex'e devret, hedefli Edit yap.
- Lokal: backend 8001 (`cd backend; ./venv/Scripts/python.exe -m uvicorn server:app --host 127.0.0.1 --port 8001`), preview 8089 (`node preview-local.js`), build (`cd frontend; yarn build`).
