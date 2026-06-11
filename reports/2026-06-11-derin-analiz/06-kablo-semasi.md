# Kablo Şeması — Derin Analiz (Codex, 2026-06-11)

## Mevcut Durum

İzole React/SVG editör: KabloSemasiSection.jsx (DeviceLibrary/Canvas/PropertiesPanel/Toolbar, .wiring-root koyu tema). Zustand editorStore (proje meta, cihazlar, kablolar, zoom/pan, grid, routing, history). 30+ statik cihaz (devices.js:24). Kablo presetleri kesit bilgisi taşıyor ama görsel/etiket amaçlı (wireTypes.js:4). Canvas: sürükle-bırak, porttan porta kablo, A*/hızlı L-Z routing (routing.js:198/154), manuel noktalar, crossing (routing.js:373). BOM/Kontrol diyaloğu (Toolbar.jsx:268): cihaz adetleri, kablo metre, açık portlar, polarite uyarıları, netlist, CSV. electricalCheck.js:38/62. Backend wiring bloğu server.py:9349+: proje CRUD, template CRUD, Mongo base64 görsel, remove-bg, PDF (svglib+reportlab, server.py:9606).

## Eksiklikler ve Sorunlar

1. **KRİTİK: elektriksel hesap yetersiz.** Kontrol sadece port adından polarite tahmini (electricalCheck.js:3). Akım/güç/voltaj/kesit yeterliliği/sigorta değeri-konumu/gerilim düşümü/hat uzunluğu hesabı YOK. WIRE_PRESETS.section ampacity ile kullanılmıyor; ratingValue/ratingUnit serbest metin.
2. **KRİTİK: sigorta + yük zinciri analizi yok.** "Bu hatta kaç amper, hangi sigorta korur, kesit uygun mu?" — netlist port gruplar ama koruma cihazı upstream/downstream ilişkisi, yük toplamı, sigorta-kablo koordinasyonu çıkmıyor. Şema görsel iyi ama mühendislik onayı üretmiyor.
3. **KRİTİK: autosave yok.** Sadece toolbar onSave (Toolbar.jsx:67); beforeunload yalnız cihaz varsa. Dirty state/debounce/"son kaydedildi"/draft/çakışma kontrolü yok.
4. **Yüksek: undo/history güvenilmez.** pushHistory tutarsız çağrılıyor (editorStore.js:49); property panel düzenlemeleri history'ye girmiyor.
5. **Yüksek: PDF kırılgan.** SVG re-serialize (Toolbar.jsx:425) → svglib (server.py:9606); CSS/font/image/clipPath desteği sınırlı; paper/orientation/author parametreleri dönüşümde kullanılmıyor.
6. **Yüksek: performans.** Her değişimde TÜM kablolar yeniden route (Canvas.jsx:87); crossing O(n²) (Canvas.jsx:143); A* 200k iterasyon; mouse preview'da da A*. 80-150 kabloda gecikme.
7. **Orta: BOM ürün kataloğuna bağlı değil** — stok kodu, fiyat, fire payı, konnektör/pabuç/klemens yok.
8. **Orta: /wiring-projects 500 projeyi data DAHİL döndürüyor** (server.py:9464) — ağır payload.
9. **Orta: base64 görsel + güvenlik** — 10MB upload Mongo belge limitine yaklaşır; orphan görsel temizliği yok; remove-bg dış URL SSRF/size kontrolü gevşek.

## Yeni Özellik Önerileri

- **Elektrik hesap motoru**: cihazlara voltage/powerW/currentA/fuseA/deviceRole; kablolara lengthM/sectionMm2; gerilim düşümü + sigorta-kablo uyumu. (Yüksek — ürün değerinin merkezi)
- **Kural tabanlı tesisat denetimi**: ters polarite, AC/DC karışımı, korumasız hat, inverter ana hat kesiti. (Orta-Yüksek)
- **Profesyonel PDF raporu**: kapak, revizyon, müşteri/araç, şema+BOM+netlist+uyarılar+imza; gerekirse HTML-to-PDF. (Orta)
- **Autosave + revizyon geçmişi**. (Orta)
- **BOM↔ürün kataloğu eşleme + teklife aktarım**. (Orta)
- **Performans modu**: route cache, etkilenen-kablo-yalnız hesap, spatial index, A* web worker. (Orta-Yüksek)

## Hızlı Kazanımlar

- dirty state + debounce autosave + kaydetme durumu.
- BOM kablo metresine fire % + CSV.
- WIRE_PRESETS'e maxCurrentA + resistanceOhmPerM → ilk gerilim düşümü uyarıları.
- Proje listesi için data'sız hafif endpoint.
- PDF'e BOM/netlist ikinci sayfa.
- A* preview throttle; çok kabloda crossing/bridge otomatik kapatma.
- Property panel için commit-on-blur history.
- remove-bg URL allow-list + boyut + content-type sıkılaştır.
