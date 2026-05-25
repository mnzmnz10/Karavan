#!/usr/bin/env python3
"""
Simple Excel Discount Test - Debug version
"""

import requests
import pandas as pd
from io import BytesIO
import json

# Test configuration
BASE_URL = "https://quotemate-3.preview.emergentagent.com/api"

def create_test_company():
    """Create a test company"""
    response = requests.post(
        f"{BASE_URL}/companies",
        json={"name": "Discount Test Company Simple"},
        timeout=30
    )
    
    if response.status_code == 200:
        company_data = response.json()
        company_id = company_data.get('id')
        print(f"✅ Created test company: {company_id}")
        return company_id
    else:
        print(f"❌ Failed to create company: {response.status_code}")
        return None

def test_excel_upload_with_discount(company_id):
    """Test Excel upload with discount parameter"""
    
    # Create test data in general format (3 columns to avoid ELEKTROZİRVE format)
    test_data = {
        'Ürün Adı': ['Solar Panel 450W Monocrystalline High Efficiency'],
        'Liste Fiyatı': [100.00],
        'Para Birimi': ['USD']
    }
    
    df = pd.DataFrame(test_data)
    excel_buffer = BytesIO()
    df.to_excel(excel_buffer, index=False)
    excel_buffer.seek(0)
    
    # Save Excel file for debugging
    with open('/tmp/test_discount.xlsx', 'wb') as f:
        f.write(excel_buffer.getvalue())
    print("📁 Saved test Excel file to /tmp/test_discount.xlsx")
    
    # Test with 20% discount
    excel_buffer.seek(0)
    files = {'file': ('test_discount.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    data = {'discount': '20'}
    
    print(f"\n🔍 Testing Excel upload with 20% discount...")
    print(f"   Company ID: {company_id}")
    print(f"   Excel data: {test_data}")
    
    response = requests.post(
        f"{BASE_URL}/companies/{company_id}/upload-excel",
        files=files,
        data=data,
        timeout=30
    )
    
    print(f"   Response status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Upload successful!")
        print(f"   Response: {json.dumps(result, indent=2)}")
        
        # Check if products were created
        products_response = requests.get(f"{BASE_URL}/products", timeout=30)
        if products_response.status_code == 200:
            products = products_response.json()
            test_products = [p for p in products if p.get('company_id') == company_id]
            
            if test_products:
                product = test_products[0]
                print(f"\n📊 Product created:")
                print(f"   Name: {product.get('name')}")
                print(f"   List Price: {product.get('list_price')}")
                print(f"   Discounted Price: {product.get('discounted_price')}")
                print(f"   Currency: {product.get('currency')}")
                print(f"   List Price TRY: {product.get('list_price_try')}")
                print(f"   Discounted Price TRY: {product.get('discounted_price_try')}")
                
                # Verify discount calculation
                list_price = product.get('list_price', 0)
                discounted_price = product.get('discounted_price')
                
                if discounted_price:
                    expected_discounted = 100.00 * 0.8  # 20% discount
                    if abs(discounted_price - expected_discounted) < 0.01:
                        print(f"✅ Discount calculation correct: {list_price} → {discounted_price} (20% off)")
                    else:
                        print(f"❌ Discount calculation incorrect: Expected {expected_discounted}, got {discounted_price}")
                else:
                    print(f"❌ No discounted price set")
            else:
                print(f"❌ No products found for company")
        else:
            print(f"❌ Failed to fetch products: {products_response.status_code}")
    else:
        try:
            error = response.json()
            print(f"❌ Upload failed: {error}")
        except:
            print(f"❌ Upload failed: {response.text}")

def cleanup_company(company_id):
    """Clean up test company"""
    if company_id:
        response = requests.delete(f"{BASE_URL}/companies/{company_id}", timeout=30)
        if response.status_code == 200:
            print(f"✅ Cleaned up company {company_id}")
        else:
            print(f"⚠️  Failed to cleanup company {company_id}")

def main():
    print("🚀 Simple Excel Discount Test")
    print("=" * 50)
    
    company_id = create_test_company()
    if company_id:
        try:
            test_excel_upload_with_discount(company_id)
        finally:
            cleanup_company(company_id)
    else:
        print("❌ Cannot proceed without company")

if __name__ == "__main__":
    main()