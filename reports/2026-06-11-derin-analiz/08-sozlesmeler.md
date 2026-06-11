# Sözleşmeler — Derin Analiz (Codex, 2026-06-11)

## Mevcut Durum

Backend server.py:9853+: Excel yükleme, listeleme, reorder, template, sıfırdan sözleşme, Excel indirme, kopyalama, silme, PDF. `parse_contract_data` (server.py:10197) ilk sheet'ten bölümler/kur/toplam/addons/collections/invoiceDiff/specs/deliveryDate çıkarıyor. Sıfırdan sözleşme katalog veya şablondan seed (server.py:10795). Frontend App.js:2455+/5739+: filtreler, arama, ödeme sınıfı, toplu yükleme, sıra okları, detay önizleme, kalem düzenleme, dnd-kit, Ctrl+Z, kur simülasyonu, finansal panel. PDF lacivert + MSZ KARAVAN imza (server.py:10932).

## Eksiklikler ve Sorunlar

1. **Düzenlenmiş Excel indirme finansal alanları KAYBEDİYOR.** `_contract_data_to_xlsx` (server.py:10613) sadece bölümler+toplam+notlar yazıyor; addons/collections/invoiceDiff/specs/deliveryDate Excel'e geri üretilmiyor → "düzenledim, indirdim" akışında tahsilat/teslim kaybolur.
2. **`data` alanı şemasız.** ContractUpdate.data: Dict[str, Any] (server.py:676) — tutar/tarih/currency/section validate edilmiyor. Pydantic alt modelleri şart.
3. **Parser kırılgan.** Sadece ilk sheet, header ilk 15 satır + "TUTAR"; deliveryDate yan hücredeyse kaçar; addons/collections başlık metnine çok bağlı (server.py:10066).
4. **Backend parser ≠ frontend parseContract.** Frontend fallback (App.js:3035) addons/collections/invoiceDiff/specs/deliveryDate üretmiyor → data eksikse önizleme/PDF/Excel ayrışır.
5. **Kur snapshot tutarsızlığı.** amountEUR snapshot (App.js:2799) PDF'te kullanılıyor (server.py:11399), frontend canlı hesaplıyor → kur değişince PDF ≠ ekran.
6. **Fatura farkı sadece pozitif.** Negatif (indirim/mahsup/iade) işlenemiyor (App.js:6486).
7. **Tahsilat belgesi yok.** PDF'te tahsilat gizli (doğru karar) ama ayrı "Tahsilat Dökümü/Ödeme Planı" çıktısı yok.
8. **Reorder veri bütünlüğü zayıf.** Duplicate/eksik id kontrolü yok (server.py:10539); copy_contract sort_order'ı kopyalıyor → çakışma (server.py:10733); sort_order index'i yok.
9. **Listeleme tamamen client-side** — 1000 kayıt çekiliyor, filtre frontend'de; arşiv büyüyünce sorun.
10. **Excel base64 Mongo'da.** file_b64+sheets+data aynı dokümanda (server.py:10475); upload 25MB ama Mongo belge limiti 16MB — büyük dosyada kayıt patlar.
11. **/contracts/new `stage` set etmiyor** (server.py:10831) — frontend `|| 'proposal'` ile kapatıyor.
12. **Test yok** — parser/PDF/Excel/reorder/template testsiz.

## Yeni Özellik Önerileri

- **Sözleşme Finans Defteri** — immutable ödeme hareketleri: tarih, kur, kanal, makbuz no. (Orta)
- **Teslim Tarihi Takip Panosu** — yaklaşan/geciken/ödeme tamam teslim bekliyor. (Düşük-Orta)
- **Parser güven skoru + inceleme kuyruğu** — çıkarımlara confidence, kullanıcı onayı. (Orta)
- **Sözleşme revizyon geçmişi** — v1/v2 diff, hukuki iz. (Orta-Yüksek)
- **PDF varyantları** — Müşteri PDF / İç Finans PDF / Tahsilat Dökümü. (Orta)
- **Backend taraflı arama/filtre/pagination.** (Orta)

## Hızlı Kazanımlar

- _contract_data_to_xlsx'e deliveryDate/specs/addons/collections/invoiceDiff ekle.
- /contracts/new'e açıkça stage:"proposal" yaz.
- copy_contract'ta sort_order temizle.
- reorder'a duplicate/missing id validasyonu.
- contracts'a sort_order/stage/customer_name/doc_date indexleri.
- parse_contract_data için 8-10 fixture testi.
- Fatura farkına signed amount / type: add|discount.
