#!/usr/bin/env python3
"""
Test Excel Discount with Real Excel File
"""

import requests
import json

BASE_URL = "https://quotemate-3.preview.emergentagent.com/api"

def create_test_company():
    """Create a test company"""
    response = requests.post(
        f"{BASE_URL}/companies",
        json={"name": "Real Excel Discount Test Company"},
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

def test_discount_with_real_excel(company_id):
    """Test discount functionality with real Excel file"""
    
    # Read the existing ELEKTROZİRVE.xlsx file
    with open('/app/ELEKTROZİRVE.xlsx', 'rb') as f:
        excel_content = f.read()
    
    print(f"\n🔍 Testing discount functionality with real Excel file...")
    
    # Test cases
    test_cases = [
        {"discount": "0", "description": "No discount"},
        {"discount": "20", "description": "20% discount"},
        {"discount": "15.5", "description": "15.5% decimal discount"}
    ]
    
    for test_case in test_cases:
        discount = test_case["discount"]
        description = test_case["description"]
        
        print(f"\n📊 Testing {description}...")
        
        files = {'file': ('ELEKTROZİRVE.xlsx', excel_content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        data = {'discount': discount}
        
        response = requests.post(
            f"{BASE_URL}/companies/{company_id}/upload-excel",
            files=files,
            data=data,
            timeout=60
        )
        
        print(f"   Response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Upload successful!")
            print(f"   Products uploaded: {result.get('summary', {}).get('total_products', 'Unknown')}")
            print(f"   New products: {result.get('summary', {}).get('new_products', 'Unknown')}")
            print(f"   Updated products: {result.get('summary', {}).get('updated_products', 'Unknown')}")
            
            # Check a few products to verify discount calculation
            products_response = requests.get(f"{BASE_URL}/products", timeout=30)
            if products_response.status_code == 200:
                products = products_response.json()
                test_products = [p for p in products if p.get('company_id') == company_id]
                
                if test_products:
                    print(f"\n   📋 Sample products with discount:")
                    for i, product in enumerate(test_products[:3]):  # Show first 3 products
                        name = product.get('name', 'Unknown')[:50]
                        list_price = product.get('list_price', 0)
                        discounted_price = product.get('discounted_price')
                        currency = product.get('currency', 'Unknown')
                        
                        print(f"   Product {i+1}: {name}")
                        print(f"      List Price: {list_price} {currency}")
                        
                        if float(discount) > 0:
                            if discounted_price:
                                expected_discounted = list_price * (1 - float(discount) / 100)
                                print(f"      Discounted Price: {discounted_price} {currency}")
                                print(f"      Expected: {expected_discounted:.2f} {currency}")
                                
                                if abs(discounted_price - expected_discounted) < 0.01:
                                    print(f"      ✅ Discount calculation correct!")
                                else:
                                    print(f"      ❌ Discount calculation incorrect!")
                            else:
                                print(f"      ❌ No discounted price set!")
                        else:
                            if discounted_price is None:
                                print(f"      ✅ No discount applied (correct)")
                            else:
                                print(f"      ❌ Unexpected discounted price: {discounted_price}")
                        print()
                else:
                    print(f"   ❌ No products found for company")
            else:
                print(f"   ❌ Failed to fetch products: {products_response.status_code}")
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
    print("🚀 Real Excel Discount Functionality Test")
    print("=" * 60)
    
    company_id = create_test_company()
    if company_id:
        try:
            test_discount_with_real_excel(company_id)
        finally:
            cleanup_company(company_id)
    else:
        print("❌ Cannot proceed without company")

if __name__ == "__main__":
    main()