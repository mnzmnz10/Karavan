import requests
import pandas as pd
import io
import json
from datetime import datetime

# ELEKTROZİRVE formatına uygun test verisi oluştur (4 kolon)
test_data = {
    'ÜRÜN ADI': [
        'Solar Panel 300W Monokristalin',
        'Hybrid Invertör 5kW MPPT', 
        'Lithium Batarya 100Ah 12V',
        'PWM Şarj Kontrol Cihazı 30A',
        'DC Kablo Set 6mm²'
    ],
    'LİSTE FİYATI': [1500.00, 3200.00, 800.00, 450.00, 150.00],
    'İNDİRİMLİ FİYAT': [1350.00, 2880.00, 720.00, 405.00, 135.00],
    'PARA BİRİMİ': ['USD', 'USD', 'EUR', 'TRY', 'TRY']
}

# DataFrame oluştur
df = pd.DataFrame(test_data)

# Excel dosyası oluştur (memory'de)
excel_buffer = io.BytesIO()
df.to_excel(excel_buffer, index=False, sheet_name='Ürünler')
excel_buffer.seek(0)

# API endpoint
API_BASE = "https://quotemate-3.preview.emergentagent.com/api"
COMPANY_ID = "fdd84f9d-4276-41aa-afeb-4637879f30c3"  # Test Firma Bağlantı

# Excel dosyasını yükle
files = {
    'file': ('test_urunler.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

print("📤 Excel dosyası yükleniyor...")
print(f"🏢 Firma: Test Firma Bağlantı")
print(f"📊 Ürün sayısı: {len(test_data['ÜRÜN ADI'])}")
print("📋 Format: ELEKTROZİRVE (4 kolon)")
print("=" * 50)

try:
    response = requests.post(
        f"{API_BASE}/companies/{COMPANY_ID}/upload-excel",
        files=files,
        timeout=30
    )
    
    print(f"📡 API Response Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print("✅ Upload başarılı!")
        print(f"📋 Mesaj: {result.get('message', 'N/A')}")
        
        if 'summary' in result:
            summary = result['summary']
            print(f"📊 Toplam ürün: {summary.get('total_products', 0)}")
            print(f"🆕 Yeni ürün: {summary.get('new_products', 0)}")
            print(f"🔄 Güncellenmiş ürün: {summary.get('updated_products', 0)}")
            print(f"💰 Fiyat değişimi: {summary.get('price_changes', 0)}")
            
            if 'currency_distribution' in summary:
                print("💱 Para birimi dağılımı:")
                for currency, count in summary['currency_distribution'].items():
                    print(f"   {currency}: {count} ürün")
        
        # Upload geçmişini kontrol et
        print("\n" + "=" * 50)
        print("📚 Upload geçmişi kontrol ediliyor...")
        
        history_response = requests.get(f"{API_BASE}/companies/{COMPANY_ID}/upload-history")
        if history_response.status_code == 200:
            history = history_response.json()
            print(f"📜 Toplam upload: {len(history)}")
            if history:
                latest = history[0]  # En son upload
                print(f"📅 Son upload: {latest['filename']}")
                print(f"🕐 Tarih: {latest['upload_date']}")
                print(f"📊 İstatistikler: {latest['total_products']} toplam, {latest['new_products']} yeni, {latest['updated_products']} güncellenmiş")
                if latest.get('price_changes'):
                    print(f"💰 Fiyat değişiklikleri: {len(latest['price_changes'])} adet")
                    for change in latest['price_changes'][:3]:  # İlk 3 değişiklik
                        print(f"   - {change['product_name']}: {change['old_price']} → {change['new_price']} {change['currency']}")
        else:
            print(f"❌ Upload geçmişi alınamadı: {history_response.status_code}")
            
    else:
        print(f"❌ Upload başarısız: {response.status_code}")
        print(f"🔍 Hata detayı: {response.text}")
        
except Exception as e:
    print(f"❌ Hata oluştu: {str(e)}")

print("=" * 50)
print("🎯 İlk test tamamlandı!")

# İkinci test - Aynı ürünlerin güncellenmiş fiyatlarıyla
print("\n" + "🔄" * 50)
print("🔄 İKİNCİ TEST: FIYAT GÜNCELLEMESİ")
print("🔄" * 50)

# Güncellenmiş fiyatlarla ikinci test
updated_test_data = {
    'ÜRÜN ADI': [
        'Solar Panel 300W Monokristalin',  # Aynı ürün
        'Hybrid Invertör 5kW MPPT',        # Aynı ürün - fiyat artışı 
        'Lithium Batarya 100Ah 12V',      # Aynı ürün - fiyat düşüşü
        'MPPT Şarj Kontrol Cihazı 60A',   # Yeni ürün
        'AC Kablo Set 2.5mm²'             # Yeni ürün
    ],
    'LİSTE FİYATI': [1550.00, 3500.00, 750.00, 650.00, 200.00],  # Güncellenmiş fiyatlar
    'İNDİRİMLİ FİYAT': [1395.00, 3150.00, 675.00, 585.00, 180.00],
    'PARA BİRİMİ': ['USD', 'USD', 'EUR', 'USD', 'TRY']
}

# İkinci DataFrame
df2 = pd.DataFrame(updated_test_data)
excel_buffer2 = io.BytesIO()
df2.to_excel(excel_buffer2, index=False, sheet_name='Güncellenmiş Ürünler')
excel_buffer2.seek(0)

files2 = {
    'file': ('test_guncellenmis_urunler.xlsx', excel_buffer2.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

print(f"📤 Güncellenmiş Excel dosyası yükleniyor...")
print(f"🏢 Firma: Test Firma Bağlantı")
print(f"📊 Ürün sayısı: {len(updated_test_data['ÜRÜN ADI'])}")
print("🔄 Bu testte fiyat değişiklikleri ve yeni ürünler olacak")

try:
    response2 = requests.post(
        f"{API_BASE}/companies/{COMPANY_ID}/upload-excel",
        files=files2,
        timeout=30
    )
    
    print(f"📡 API Response Status: {response2.status_code}")
    
    if response2.status_code == 200:
        result2 = response2.json()
        print("✅ İkinci upload başarılı!")
        print(f"📋 Mesaj: {result2.get('message', 'N/A')}")
        
        if 'summary' in result2:
            summary2 = result2['summary']
            print(f"📊 Toplam ürün: {summary2.get('total_products', 0)}")
            print(f"🆕 Yeni ürün: {summary2.get('new_products', 0)}")
            print(f"🔄 Güncellenmiş ürün: {summary2.get('updated_products', 0)}")
            print(f"💰 Fiyat değişimi: {summary2.get('price_changes', 0)}")
            
        # Final upload geçmişini kontrol et
        print("\n" + "=" * 50)
        print("📚 Final upload geçmişi:")
        
        history_response2 = requests.get(f"{API_BASE}/companies/{COMPANY_ID}/upload-history")
        if history_response2.status_code == 200:
            history2 = history_response2.json()
            print(f"📜 Toplam upload: {len(history2)}")
            for i, upload in enumerate(history2[:2]):  # Son 2 upload
                print(f"\n📄 Upload #{i+1}: {upload['filename']}")
                print(f"   📅 Tarih: {upload['upload_date']}")
                print(f"   📊 {upload['total_products']} toplam, {upload['new_products']} yeni, {upload['updated_products']} güncellenen")
                if upload.get('price_changes'):
                    print(f"   💰 {len(upload['price_changes'])} fiyat değişikliği")
                    
    else:
        print(f"❌ İkinci upload başarısız: {response2.status_code}")
        print(f"🔍 Hata detayı: {response2.text}")
        
except Exception as e:
    print(f"❌ İkinci test hatası: {str(e)}")

print("=" * 50) 
print("🎉 TÜM TESTLER TAMAMLANDI!")