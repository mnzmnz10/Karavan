#!/usr/bin/env python3
"""
Simple test for Excel Currency Selection functionality
"""

import requests
import json
from datetime import datetime
from io import BytesIO
import pandas as pd

def test_currency_parameter():
    """Test the currency parameter functionality"""
    base_url = "https://quotemate-3.preview.emergentagent.com/api"
    
    print("🔍 Testing Excel Currency Parameter Functionality...")
    
    # Step 1: Create a test company
    company_name = f"Currency Test {datetime.now().strftime('%H%M%S')}"
    
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

    # Step 2: Test currency parameter with different values
    test_currencies = ['USD', 'EUR', 'TRY']
    
    for currency in test_currencies:
        print(f"\n🔍 Testing with currency: {currency}")
        
        try:
            # Create a simple Excel file that should work with traditional parser
            # Use very simple column names that match the parser expectations
            data = {
                'name': [f'Product {currency} Test 1', f'Product {currency} Test 2'],
                'price': [100.0, 200.0],
                'description': [f'Test product 1 for {currency}', f'Test product 2 for {currency}']
            }
            
            df = pd.DataFrame(data)
            excel_buffer = BytesIO()
            df.to_excel(excel_buffer, index=False)
            excel_buffer.seek(0)
            
            # Upload with currency parameter
            files = {'file': (f'test_{currency}.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            form_data = {'currency': currency}
            
            response = requests.post(
                f"{base_url}/companies/{company_id}/upload-excel",
                files=files,
                data=form_data,
                timeout=60
            )
            
            print(f"Response status: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    print(f"✅ Upload successful for {currency}")
                    
                    # Check currency distribution
                    currency_dist = result.get('summary', {}).get('currency_distribution', {})
                    print(f"Currency distribution: {currency_dist}")
                    
                    if currency in currency_dist:
                        print(f"✅ Currency {currency} found in distribution")
                    else:
                        print(f"❌ Currency {currency} NOT found in distribution")
                else:
                    print(f"❌ Upload failed: {result}")
            else:
                print(f"❌ Upload failed with status {response.status_code}")
                
        except Exception as e:
            print(f"❌ Error testing {currency}: {e}")
    
    # Cleanup
    try:
        response = requests.delete(f"{base_url}/companies/{company_id}", timeout=30)
        if response.status_code == 200:
            print(f"\n✅ Cleaned up test company")
        else:
            print(f"\n⚠️ Failed to cleanup company: {response.status_code}")
    except Exception as e:
        print(f"\n⚠️ Error during cleanup: {e}")

if __name__ == "__main__":
    test_currency_parameter()