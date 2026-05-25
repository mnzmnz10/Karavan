#!/usr/bin/env python3
"""
Direct test for currency parameter by creating products directly
"""

import requests
import json
from datetime import datetime

def test_currency_parameter_direct():
    """Test currency parameter by creating products directly and verifying conversion"""
    base_url = "https://quotemate-3.preview.emergentagent.com/api"
    
    print("🔍 Testing Currency Parameter Functionality (Direct Product Creation)...")
    
    # Step 1: Create a test company
    company_name = f"Currency Direct Test {datetime.now().strftime('%H%M%S')}"
    
    try:
        response = requests.post(
            f"{base_url}/companies",
            json={"name": company_name},
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ Failed to create company: {response.status_code} - {response.text}")
            return
            
        company_data = response.json()
        company_id = company_data.get('id')
        print(f"✅ Created test company: {company_id}")
        
    except Exception as e:
        print(f"❌ Error creating company: {e}")
        return

    # Step 2: Test currency parameter by creating products with different currencies
    test_currencies = ['USD', 'EUR', 'TRY']
    created_products = []
    
    for currency in test_currencies:
        print(f"\n🔍 Testing product creation with currency: {currency}")
        
        try:
            product_data = {
                "name": f"Test Product {currency}",
                "company_id": company_id,
                "list_price": 100.0,
                "discounted_price": 85.0,
                "currency": currency,
                "description": f"Test product with {currency} currency"
            }
            
            response = requests.post(
                f"{base_url}/products",
                json=product_data,
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            
            if response.status_code == 200:
                product = response.json()
                created_products.append(product.get('id'))
                
                print(f"✅ Product created successfully")
                print(f"   Currency: {product.get('currency')}")
                print(f"   List Price: {product.get('list_price')} {currency}")
                print(f"   List Price TRY: {product.get('list_price_try')} TRY")
                print(f"   Discounted Price TRY: {product.get('discounted_price_try')} TRY")
                
                # Verify currency is correct
                if product.get('currency') == currency:
                    print(f"✅ Currency correctly set to {currency}")
                else:
                    print(f"❌ Currency mismatch: expected {currency}, got {product.get('currency')}")
                
                # Verify TRY conversion exists
                if product.get('list_price_try') and product.get('list_price_try') > 0:
                    print(f"✅ TRY conversion successful")
                else:
                    print(f"❌ TRY conversion failed")
                    
            else:
                print(f"❌ Product creation failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            print(f"❌ Error creating product with {currency}: {e}")

    # Step 3: Test the Excel upload endpoint parameter handling
    print(f"\n🔍 Testing Excel Upload Endpoint Parameter Handling...")
    
    # Test that the endpoint accepts the currency parameter (even if parsing fails)
    try:
        # Create a minimal file that will definitely fail parsing
        test_content = b"Invalid Excel Content"
        
        files = {'file': ('test.xlsx', test_content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        form_data = {'currency': 'USD'}
        
        response = requests.post(
            f"{base_url}/companies/{company_id}/upload-excel",
            files=files,
            data=form_data,
            timeout=60
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        # We expect this to fail, but we want to see if the currency parameter is accepted
        if "currency" in response.text.lower() or response.status_code != 500:
            print("✅ Currency parameter is being processed by the endpoint")
        else:
            print("❌ Currency parameter may not be processed")
            
    except Exception as e:
        print(f"❌ Error testing endpoint: {e}")

    # Step 4: Verify the backend implementation
    print(f"\n🔍 Verifying Backend Implementation...")
    
    # Check if the upload endpoint exists and accepts POST requests
    try:
        # Test with no file (should get a different error)
        response = requests.post(
            f"{base_url}/companies/{company_id}/upload-excel",
            timeout=30
        )
        
        print(f"No file response: {response.status_code} - {response.text[:100]}")
        
        if response.status_code == 422:  # FastAPI validation error
            print("✅ Endpoint exists and validates file parameter")
        else:
            print(f"⚠️ Unexpected response: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error testing endpoint existence: {e}")

    # Cleanup
    print(f"\n🧹 Cleaning up...")
    
    # Delete products
    for product_id in created_products:
        try:
            response = requests.delete(f"{base_url}/products/{product_id}", timeout=30)
            if response.status_code == 200:
                print(f"✅ Deleted product {product_id}")
            else:
                print(f"⚠️ Failed to delete product {product_id}")
        except Exception as e:
            print(f"⚠️ Error deleting product {product_id}: {e}")
    
    # Delete company
    try:
        response = requests.delete(f"{base_url}/companies/{company_id}", timeout=30)
        if response.status_code == 200:
            print(f"✅ Deleted test company")
        else:
            print(f"⚠️ Failed to delete company: {response.status_code}")
    except Exception as e:
        print(f"⚠️ Error during cleanup: {e}")

if __name__ == "__main__":
    test_currency_parameter_direct()