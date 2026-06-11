# MPPT Hesapla — Derin Analiz (Codex, 2026-06-11)

## Mevcut Durum

POST /mppt/recommend (server.py:~8103): panel watt/voc/vmp/isc/imp + series/parallel/battery_voltage/min_temp_c. Frontend series=1, parallel=adet, 12V sabit. Şarj akımı = toplam W/12; standart akım en yakın 10A. Voltaj sınıfı: seri bağlama varsayımı + soğuk Voc (0.0035/°C) + %5 emniyet → 100/150/250V; AI sonrası server-side override. GET/PUT /mppt/panel-specs/{id} panel değer kaydı. Frontend: Monokristal dropdown, isimden V+A parse + fiyat gösterimli "Sistemdeki Uygun MPPT" listesi.

## Eksiklikler ve Sorunlar

1. **KRİTİK: akım yuvarlama "en yakın 10"** — 54A hesap → 50A önerilebilir; "bir üst standart değer" olmalı (51A→60A). Düşük akım cihaz yakmaz ama üretim kırpar = eksik boyutlandırma.
2. **12V kilidi**: backend 24/48V destekler gibi, UI kullandırmıyor. 800W: 12V'de 66.7A, 24V'de 33.3A — 24V sistemlerde gereksiz pahalı öneri.
3. **Seri/paralel kullanıcıya sorulmuyor** — voltaj sınıfı "hepsi seri" varsayımıyla; 4 panelde gerçek tasarım 2S2P iken 4S'e göre 250V'a atlayabilir → fazla konservatif, stoktaki 150V cihaz "yok" görünür.
4. **Sıcaklık katsayısı sabit %0.35/°C** — panel bazında -0.28..-0.36 değişir; panel spec'e `voc_temp_coeff` alanı eklenmeli.
5. **_est_voc kaba**: watt→Voc tahmini half-cut panellerde yanılır; "tahmin" karar mekanizmasında gerçek veri gibi kullanılıyor.
6. **MPPT giriş akımı (Isc) kontrolü yok** — isc_arr hesaplanıyor ama cihaz max PV Isc ile karşılaştırılmıyor; paralel string artınca aşılabilir.
7. **Max PV güç limiti kontrol edilmiyor** — bazı cihazlarda "MAX PV GÜÇ 390W(12V)/780W(24V)" açıklamada var; sistem sadece V+A seçiyor.
8. **İsimden parse yetersiz**: V/A bilgisi açıklamada olan cihazlar listelenmiyor; "Akıllı İnverter MPPT" gibi inverter'lar yanlışlıkla listeye giriyor; `150VDC`, `PV40-500VDC` formatları ilk `\d+V`'yi yanlış yakalar.
9. **AI bağımlılığı zorunlu** — OpenAI yoksa hesaplayıcı tamamen çalışmaz; temel öneri deterministik olmalı, AI sadece açıklama.

## Yeni Özellik Önerileri

1. **12/24/48V sistem voltajı seçimi** (düşük) — akım hesabını doğrudan düzeltir.
2. **Seri/paralel topoloji seçici** + "otomatik topoloji öner" (orta).
3. **Deterministik MPPT motoru** — saf hesap; AI yalnız açıklama (orta).
4. **MPPT ürün spec modeli**: max_pv_voltage, rated_current, supported_battery_voltages, max_pv_power_by_voltage, max_pv_isc, voltage_range (orta-yüksek).
5. **Panel spec genişletme**: voc_temp_coeff, cell_count, panel_type, datasheet_url (düşük-orta).
6. **Uygun cihaz sıralama/filtre**: en yakın yeterli, stokta, en ucuz, bluetooth/ekran (orta).

## Hızlı Kazanımlar

- Akım yuvarlamayı bir üst standart değere çevir (51A→60A).
- Frontend'e 12/24/48V seçimi ekle (backend hazır).
- Ürün parse'ında name + description birlikte kullan.
- İnverter/PWM/AC şarj cihazlarını MPPT listesinden ayır.
- Voc tahminiyle hesaplanınca büyük uyarı göster: "datasheet ile doğrulayın".
- AI hatasında deterministik fallback yanıt dön.
- "Voltaj sınıfı seri varsayımıyla güvenli seçildi" açıklaması göster (kısmen var).
