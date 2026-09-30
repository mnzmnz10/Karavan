# App Review cevabı (Guideline 2.1 · Information Needed)

Apple'ın istediği: telefonda çekilmiş ekran kaydı + 5 soruya yazılı cevap. Cevabı hem "Reply to App Review" mesajına hem de sürüm sayfasındaki App Review Information › Notes alanına koy.

## Ekran kaydı (iPhone'da, Lordum çeker)

Denetim Merkezi › Ekran Kaydı. Uygulama kapalıyken başlat, 1–2 dakika yeter:

1. Ana ekrandan MSZ Karavan'ı aç (kayıt uygulamanın açılışıyla başlamalı).
2. Kullanıcı adı ve şifreyle giriş yap. Face ID sorarsa göster.
3. Katalog: bir kategoriye gir, bir ürünü aç, ürün detayını göster.
4. Ürünü sepete ekle, sepetten teklif oluştur, teklifi göster.
5. Servis: bir servis kaydını aç (fotoğraflar, işlemler).
6. Sözleşmeler: bir sözleşmeyi aç.
7. Özet ekranındaki MPPT hesaplamayı çalıştır.
8. Sağ üstteki hesap düğmesinden çıkış yap.

Uygulamada hesap açma olmadığı için hesap silme gerekmiyor. Bunu cevapta belirttik.

## Yazılı cevap (İngilizce, olduğu gibi yapıştır)

Hello, and thank you for the review. Please find the requested information below. A screen recording captured on an iPhone is attached.

1. Screen recording
Attached. It starts with launching the app from the home screen and shows sign-in, the dashboard, the product catalog, adding products to the cart and creating a quote, editing a quote, service records with payments and photos, and contracts. The app has no account registration: accounts are created by the business administrator, so there is no in-app account creation or deletion flow. The app has no user-generated content that is shared with other users and no paid content or in-app purchases.

2. Purpose and target audience
MSZ Karavan is the internal management app of MSZ Karavan, a caravan electrical and fit-out workshop in Çorlu, Turkey. It is used only by our own employees (about 10 people). Staff use it to look up products and supplier prices, prepare customer quotes, record vehicles that come in for service (work done, photos, invoices, payments, delivery), manage customer contracts and payment plans, and run workshop tools such as a battery health check and a solar MPPT charge controller calculator. It replaces paper forms and spreadsheets and lets a technician do this on the spot next to the customer's caravan. It is not intended for the general public, and we have also submitted a request for unlisted app distribution.

3. Setup and access
No setup is needed. Sign in with the demo account provided in the App Review Information section. After sign-in, the bottom tab bar gives access to the main features: Özet (summary, with the battery test and MPPT calculator tools), Ürünler (product catalog and prices), Teklifler (quotes, built from the cart), Servis (service records) and Sözleşme (contracts). Face ID sign-in is optional and is offered after the first password sign-in.

4. External services
- Our own backend server (FastAPI) at corlukaravan.shop, which serves the app's data
- MongoDB Atlas, the cloud database behind that server
- OpenAI and Google Gemini APIs, used on the server only to read product and invoice documents and battery test photos when a staff member uploads them
- freecurrencyapi.com for USD/EUR exchange rates used in price conversion
- Our suppliers' public websites, used by the server to look up product details and images

The app has no third-party analytics, advertising, tracking SDKs or payment processors.

5. Regional differences
The app is used only in Turkey and its content is in Turkish. The features and content are the same in every region; the app's availability is limited to Turkey.

6. Regulated industry / third-party material
Not applicable. The app does not operate in a regulated industry. Product information comes from the business's own supplier catalogs and purchase invoices.

Thank you.
