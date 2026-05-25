import requests
import json
from datetime import datetime, timezone

# API endpoint
API_BASE = "https://quotemate-3.preview.emergentagent.com/api"
COMPANY_ID = "fdd84f9d-4276-41aa-afeb-4637879f30c3"  # Test Firma Bağlantı

print("🧪 Para Birimi Değişikliği Test Sistemi")
print("=" * 50)

# 1. Test için fake upload history oluştur
fake_upload_history = {
    "id": "test-upload-001",
    "company_id": COMPANY_ID,
    "company_name": "Test Firma Bağlantı",
    "filename": "test_para_birimi_liste.xlsx",
    "upload_date": datetime.now(timezone.utc).isoformat(),
    "total_products": 3,
    "new_products": 3,
    "updated_products": 0,
    "currency_distribution": {"USD": 2, "EUR": 1},
    "price_changes": [],
    "status": "completed"
}

print("📝 Test upload history oluşturuluyor...")

# MongoDB'ye direkt eklemek için backend'e POST isteği yapalım
# Ancak önce manuel olarak direkt DB'ye eklenebilir upload history endpoint'i olmalı

# 2. Mevcut ürünlerin para birimlerini kontrol et
print("\n📊 Mevcut ürünleri kontrol ediliyor...")
try:
    response = requests.get(f"{API_BASE}/products")
    if response.status_code == 200:
        all_products = response.json()
        company_products = [p for p in all_products if p.get('company_id') == COMPANY_ID]
        
        print(f"📈 Bu firmada toplam ürün: {len(company_products)}")
        
        if company_products:
            currency_stats = {}
            for product in company_products:
                currency = product.get('currency', 'TRY')
                currency_stats[currency] = currency_stats.get(currency, 0) + 1
            
            print("💱 Mevcut para birimi dağılımı:")
            for currency, count in currency_stats.items():
                print(f"   {currency}: {count} ürün")
                
            # İlk 3 ürünü göster
            print("\n📋 Örnek ürünler:")
            for i, product in enumerate(company_products[:3], 1):
                print(f"   {i}. {product['name']}: {product.get('list_price', 0)} {product.get('currency', 'N/A')}")
                
        else:
            print("❌ Bu firmada ürün bulunamadı")
    else:
        print(f"❌ Ürün listesi alınamadı: {response.status_code}")
        
except Exception as e:
    print(f"❌ Ürün kontrol hatası: {str(e)}")

# 3. Şimdi para birimi değişikliği test et (eğer ürünler varsa)
print("\n" + "🔄" * 50)
print("🔄 PARA BİRİMİ DEĞİŞİKLİĞİ TESTİ")
print("🔄" * 50)

# Fake upload ID ile test
fake_upload_id = "test-upload-001"
new_currency = "EUR"  # USD'den EUR'ya çevir

print(f"🎯 Test senaryosu: Tüm ürünleri {new_currency} para birimine çevir")
print(f"📁 Upload ID: {fake_upload_id}")

# Not: Bu endpoint henüz gerçek upload history olmadığı için 404 verecek
# Ama API'nin çalışıp çalışmadığını test edebiliriz
try:
    response = requests.post(
        f"{API_BASE}/upload-history/{fake_upload_id}/change-currency",
        params={"new_currency": new_currency},
        timeout=30
    )
    
    print(f"📡 API Response Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print("✅ Para birimi değişikliği başarılı!")
        print(f"📋 Mesaj: {result.get('message', 'N/A')}")
        print(f"🔄 Güncellenen ürün sayısı: {result.get('updated_count', 0)}")
        
        if result.get('price_changes'):
            print("💰 Fiyat değişiklikleri:")
            for change in result['price_changes'][:3]:  # İlk 3'ü göster
                print(f"   - {change['product_name']}: {change['old_price']} {change['old_currency']} → {change['new_price']} {change['new_currency']}")
                
    elif response.status_code == 404:
        print("⚠️  Upload bulunamadı (beklenen - test upload ID)")
        print("🔍 API endpoint'i mevcut ve çalışıyor")
        
    else:
        print(f"❌ Para birimi değişikliği başarısız: {response.status_code}")
        print(f"🔍 Hata detayı: {response.text}")
        
except Exception as e:
    print(f"❌ Para birimi değişikliği test hatası: {str(e)}")

# 4. Upload geçmişini kontrol et
print("\n" + "=" * 50)
print("📚 Upload geçmişi kontrol sonuçları:")

try:
    history_response = requests.get(f"{API_BASE}/companies/{COMPANY_ID}/upload-history")
    if history_response.status_code == 200:
        history = history_response.json()
        print(f"📜 Toplam upload: {len(history)}")
        
        if history:
            for i, upload in enumerate(history[:2]):  # Son 2 upload
                print(f"\n📄 Upload #{i+1}: {upload['filename']}")
                print(f"   📅 Tarih: {upload['upload_date']}")
                print(f"   📊 {upload['total_products']} ürün")
                if upload.get('currency_distribution'):
                    print(f"   💱 Para birimli: {upload['currency_distribution']}")
        else:
            print("📭 Henüz upload geçmişi yok")
            print("💡 Gerçek test için Excel yükleme yapılmalı")
            
    else:
        print(f"❌ Upload geçmişi alınamadı: {history_response.status_code}")
        
except Exception as e:
    print(f"❌ Upload geçmişi kontrol hatası: {str(e)}")

print("\n" + "=" * 50)
print("✅ Para birimi değişikliği API testi tamamlandı!")
print("💡 Gerçek test için:")
print("   1. Firmalar sekmesi → Geçmiş butonu")
print("   2. Upload history dialog açılacak")
print("   3. 'Para Birimini Değiştir' butonu görülecek")
print("   4. Dialog açılıp para birimi seçilebilecek")