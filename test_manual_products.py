import requests
import json

# API endpoint
API_BASE = "https://quotemate-3.preview.emergentagent.com/api"
COMPANY_ID = "fdd84f9d-4276-41aa-afeb-4637879f30c3"  # Test Firma Bağlantı

# Test ürünleri manuel olarak ekle
test_products = [
    {
        "name": "Solar Panel 300W Monokristalin",
        "company_id": COMPANY_ID,
        "list_price": 1500.00,
        "discounted_price": 1350.00,
        "currency": "USD"
    },
    {
        "name": "Hybrid Invertör 5kW MPPT",
        "company_id": COMPANY_ID,
        "list_price": 3200.00,
        "discounted_price": 2880.00,
        "currency": "USD"
    },
    {
        "name": "Lithium Batarya 100Ah 12V",
        "company_id": COMPANY_ID,
        "list_price": 800.00,
        "discounted_price": 720.00,
        "currency": "EUR"
    }
]

print("📤 Manuel ürün ekleme testi başlatılıyor...")
print(f"🏢 Firma: Test Firma Bağlantı")
print(f"📊 Ürün sayısı: {len(test_products)}")
print("=" * 50)

# İlk olarak mevcut ürünleri kontrol et
print("📋 Mevcut ürünleri kontrol ediliyor...")
try:
    response = requests.get(f"{API_BASE}/products")
    if response.status_code == 200:
        existing_products = response.json()
        company_products = [p for p in existing_products if p.get('company_id') == COMPANY_ID]
        print(f"📊 Bu firmada mevcut ürün sayısı: {len(company_products)}")
        for product in company_products[:3]:  # İlk 3'ü göster
            print(f"   - {product['name']}: {product['list_price']} {product['currency']}")
    else:
        print(f"❌ Ürün listesi alınamadı: {response.status_code}")
except Exception as e:
    print(f"❌ Ürün kontrol hatası: {str(e)}")

print("\n" + "+" * 50)
print("📤 Yeni ürünler ekleniyor...")

# Ürünleri tek tek ekle
for i, product in enumerate(test_products, 1):
    try:
        response = requests.post(
            f"{API_BASE}/products",
            json=product,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Ürün {i}: {product['name']} başarıyla eklendi")
        else:
            print(f"❌ Ürün {i} eklenemedi: {response.status_code}")
            print(f"   Hata: {response.text}")
            
    except Exception as e:
        print(f"❌ Ürün {i} hata: {str(e)}")

print("\n" + "=" * 50)
print("🔄 Şimdi aynı ürünleri güncellenmiş fiyatlarla tekrar ekleyeceğiz...")

# Güncellenmiş fiyatlarla aynı ürünleri ekle
updated_products = [
    {
        "name": "Solar Panel 300W Monokristalin",  # Aynı isim
        "company_id": COMPANY_ID,
        "list_price": 1550.00,  # +50 artış
        "discounted_price": 1395.00,
        "currency": "USD"
    },
    {
        "name": "Hybrid Invertör 5kW MPPT",  # Aynı isim
        "company_id": COMPANY_ID,
        "list_price": 3500.00,  # +300 artış
        "discounted_price": 3150.00,
        "currency": "USD"
    },
    {
        "name": "Lithium Batarya 100Ah 12V",  # Aynı isim
        "company_id": COMPANY_ID,
        "list_price": 750.00,  # -50 düşüş
        "discounted_price": 675.00,
        "currency": "EUR"
    }
]

# Manuel olarak fake upload history oluştur
fake_upload_history = {
    "company_id": COMPANY_ID,
    "company_name": "Test Firma Bağlantı",
    "filename": "test_manual_upload.xlsx",
    "total_products": len(updated_products),
    "new_products": 0,
    "updated_products": len(updated_products),
    "currency_distribution": {"USD": 2, "EUR": 1},
    "price_changes": [
        {
            "product_name": "Solar Panel 300W Monokristalin",
            "old_price": 1500.00,
            "new_price": 1550.00,
            "change_amount": 50.00,
            "change_percent": 3.33,
            "currency": "USD",
            "change_type": "increase"
        },
        {
            "product_name": "Hybrid Invertör 5kW MPPT",
            "old_price": 3200.00,
            "new_price": 3500.00,
            "change_amount": 300.00,
            "change_percent": 9.38,
            "currency": "USD",
            "change_type": "increase"
        },
        {
            "product_name": "Lithium Batarya 100Ah 12V",
            "old_price": 800.00,
            "new_price": 750.00,
            "change_amount": -50.00,
            "change_percent": -6.25,
            "currency": "EUR",
            "change_type": "decrease"
        }
    ],
    "status": "completed"
}

print("🔄 Güncellenmiş ürünler ekleniyor...")

# Güncellenmiş ürünleri ekle (yeni ürün gibi ekleyeceğiz)
for i, product in enumerate(updated_products, 1):
    try:
        # Önce mevcut ürünü sil (simulated update için)
        existing_response = requests.get(f"{API_BASE}/products")
        if existing_response.status_code == 200:
            all_products = existing_response.json()
            for existing_product in all_products:
                if (existing_product.get('name') == product['name'] and 
                    existing_product.get('company_id') == COMPANY_ID):
                    # Mevcut ürünü güncelle
                    update_response = requests.put(
                        f"{API_BASE}/products/{existing_product['id']}",
                        json=product
                    )
                    if update_response.status_code == 200:
                        print(f"🔄 Ürün güncellendi: {product['name']} ({product['list_price']} {product['currency']})")
                    break
            
    except Exception as e:
        print(f"❌ Ürün güncelleme hatası: {str(e)}")

print("\n" + "=" * 50)
print("📚 Upload geçmişi test sonuçları:")

# Upload geçmişini kontrol et
try:
    history_response = requests.get(f"{API_BASE}/companies/{COMPANY_ID}/upload-history")
    if history_response.status_code == 200:
        history = history_response.json()
        print(f"📜 Toplam upload: {len(history)}")
        if history:
            for i, upload in enumerate(history[:2]):  # Son 2 upload
                print(f"\n📄 Upload #{i+1}: {upload['filename']}")
                print(f"   📅 Tarih: {upload['upload_date']}")
                print(f"   📊 {upload['total_products']} toplam, {upload['new_products']} yeni, {upload['updated_products']} güncellenen")
                if upload.get('price_changes'):
                    print(f"   💰 {len(upload['price_changes'])} fiyat değişikliği")
        else:
            print("📭 Henüz upload geçmişi yok")
    else:
        print(f"❌ Upload geçmişi alınamadı: {history_response.status_code}")
except Exception as e:
    print(f"❌ Upload geçmişi kontrol hatası: {str(e)}")

print("\n" + "=" * 50)
print("🎯 Manuel test tamamlandı!")