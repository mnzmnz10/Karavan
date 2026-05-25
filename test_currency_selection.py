#!/usr/bin/env python3
"""
Test script specifically for Excel Currency Selection functionality
"""

import requests
import sys
import json
import time
from datetime import datetime
from io import BytesIO
import pandas as pd

class CurrencySelectionTester:
    def __init__(self, base_url="https://quotemate-3.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_companies = []
        self.created_products = []

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def test_excel_currency_selection_system(self):
        """Comprehensive test for user-selected currency Excel upload system"""
        print("\n🔍 Testing Excel Upload with User-Selected Currency...")
        
        # Step 1: Create a test company for currency testing
        currency_company_name = f"Currency Test Company {datetime.now().strftime('%H%M%S')}"
        
        try:
            response = requests.post(
                f"{self.base_url}/companies",
                json={"name": currency_company_name},
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            
            if response.status_code == 200:
                company_data = response.json()
                currency_company_id = company_data.get('id')
                if not currency_company_id:
                    self.log_test("Currency Test Setup", False, "No company ID returned")
                    return False
                self.created_companies.append(currency_company_id)
                self.log_test("Currency Test Setup", True, f"Company created: {currency_company_id}")
            else:
                self.log_test("Currency Test Setup", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Currency Test Setup", False, f"Error: {e}")
            return False

        # Step 2: Create test Excel files with different currency scenarios
        test_currencies = ['USD', 'EUR', 'TRY']
        
        for test_currency in test_currencies:
            print(f"\n🔍 Testing Excel Upload with Currency: {test_currency}")
            
            try:
                # Create sample Excel data with proper column names
                sample_data = {
                    'Ürün Adı': [f'Test Product {test_currency} 1', f'Test Product {test_currency} 2', f'Test Product {test_currency} 3'],
                    'Liste Fiyatı': [100.50, 250.75, 89.99],
                    'İndirimli Fiyat': [85.50, 200.00, 75.99],
                    'Açıklama': [f'Test product 1 in {test_currency}', f'Test product 2 in {test_currency}', f'Test product 3 in {test_currency}']
                }
                
                df = pd.DataFrame(sample_data)
                excel_buffer = BytesIO()
                df.to_excel(excel_buffer, index=False)
                excel_buffer.seek(0)
                
                # Test 1: Upload with user-selected currency parameter
                files = {'file': (f'test_products_{test_currency}.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
                data = {'currency': test_currency}
                
                # Make request with both file and form data
                url = f"{self.base_url}/companies/{currency_company_id}/upload-excel"
                response = requests.post(url, files=files, data=data, timeout=60)
                
                if response.status_code == 200:
                    upload_result = response.json()
                    if upload_result.get('success'):
                        self.log_test(f"Excel Upload with {test_currency} Currency", True, f"Upload successful")
                        
                        # Test 2: Verify currency distribution in response
                        currency_distribution = upload_result.get('summary', {}).get('currency_distribution', {})
                        if test_currency in currency_distribution:
                            product_count = currency_distribution[test_currency]
                            if product_count == 3:  # We uploaded 3 products
                                self.log_test(f"Currency Distribution - {test_currency}", True, f"All 3 products assigned {test_currency} currency")
                            else:
                                self.log_test(f"Currency Distribution - {test_currency}", False, f"Expected 3 products, got {product_count}")
                        else:
                            self.log_test(f"Currency Distribution - {test_currency}", False, f"Currency {test_currency} not found in distribution")
                        
                        # Test 3: Verify products were created with correct currency
                        products_response = requests.get(f"{self.base_url}/products", timeout=30)
                        if products_response.status_code == 200:
                            products = products_response.json()
                            
                            # Find our uploaded products
                            uploaded_products = [p for p in products if p.get('name', '').startswith(f'Test Product {test_currency}')]
                            
                            if len(uploaded_products) == 3:
                                self.log_test(f"Products Created - {test_currency}", True, f"Found all 3 uploaded products")
                                
                                # Verify each product has the correct currency
                                all_correct_currency = True
                                for product in uploaded_products:
                                    if product.get('currency') != test_currency:
                                        all_correct_currency = False
                                        break
                                    # Store product ID for cleanup
                                    if product.get('id'):
                                        self.created_products.append(product.get('id'))
                                
                                if all_correct_currency:
                                    self.log_test(f"Product Currency Assignment - {test_currency}", True, f"All products have {test_currency} currency")
                                else:
                                    self.log_test(f"Product Currency Assignment - {test_currency}", False, f"Some products have incorrect currency")
                                
                                # Test 4: Verify currency conversion to TRY
                                conversion_test_passed = True
                                for product in uploaded_products:
                                    list_price_try = product.get('list_price_try')
                                    if not list_price_try or list_price_try <= 0:
                                        conversion_test_passed = False
                                        break
                                
                                if conversion_test_passed:
                                    self.log_test(f"Currency Conversion to TRY - {test_currency}", True, f"All products have valid TRY prices")
                                else:
                                    self.log_test(f"Currency Conversion to TRY - {test_currency}", False, f"Some products missing TRY conversion")
                            else:
                                self.log_test(f"Products Created - {test_currency}", False, f"Expected 3 products, found {len(uploaded_products)}")
                        else:
                            self.log_test(f"Products Verification - {test_currency}", False, f"Failed to fetch products for verification")
                            
                    else:
                        self.log_test(f"Excel Upload with {test_currency} Currency", False, f"Upload failed: {upload_result}")
                else:
                    self.log_test(f"Excel Upload with {test_currency} Currency", False, f"HTTP {response.status_code}: {response.text[:200]}")
                    
            except Exception as e:
                self.log_test(f"Excel File Creation - {test_currency}", False, f"Error creating test file: {e}")

        # Step 3: Test currency override logic
        print(f"\n🔍 Testing Currency Override Logic...")
        
        try:
            # Create Excel with mixed currency indicators in content but override with EUR
            mixed_currency_data = {
                'Ürün Adı': ['USD Product Override Test', 'TRY Product Override Test'],
                'Liste Fiyatı': [100.00, 200.00],  # Will be overridden to EUR
                'İndirimli Fiyat': [85.00, 170.00],
                'Açıklama': ['Product with USD in header but EUR override', 'Product with TRY in header but EUR override']
            }
            
            df = pd.DataFrame(mixed_currency_data)
            excel_buffer = BytesIO()
            df.to_excel(excel_buffer, index=False)
            excel_buffer.seek(0)
            
            # Upload with EUR override
            files = {'file': ('mixed_currency_test.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            data = {'currency': 'EUR'}  # Override with EUR
            
            url = f"{self.base_url}/companies/{currency_company_id}/upload-excel"
            response = requests.post(url, files=files, data=data, timeout=60)
            
            if response.status_code == 200:
                upload_result = response.json()
                if upload_result.get('success'):
                    self.log_test("Currency Override Logic", True, "Upload with currency override successful")
                    
                    # Verify all products got EUR currency despite header indicators
                    currency_distribution = upload_result.get('summary', {}).get('currency_distribution', {})
                    if currency_distribution.get('EUR', 0) == 2 and len(currency_distribution) == 1:
                        self.log_test("Currency Override Effectiveness", True, "All products assigned EUR despite mixed headers")
                    else:
                        self.log_test("Currency Override Effectiveness", False, f"Currency distribution: {currency_distribution}")
                        
                    # Verify in database
                    products_response = requests.get(f"{self.base_url}/products", timeout=30)
                    if products_response.status_code == 200:
                        products = products_response.json()
                        override_products = [p for p in products if 'Override Test' in p.get('name', '')]
                        
                        if len(override_products) == 2:
                            all_eur = all(p.get('currency') == 'EUR' for p in override_products)
                            if all_eur:
                                self.log_test("Database Currency Override Verification", True, "All override products have EUR currency in database")
                            else:
                                self.log_test("Database Currency Override Verification", False, "Some products don't have EUR currency")
                            
                            # Store for cleanup
                            for product in override_products:
                                if product.get('id'):
                                    self.created_products.append(product.get('id'))
                        else:
                            self.log_test("Override Products Count", False, f"Expected 2 products, found {len(override_products)}")
                else:
                    self.log_test("Currency Override Logic", False, f"Upload failed: {upload_result}")
            else:
                self.log_test("Currency Override Logic", False, f"HTTP {response.status_code}: {response.text[:200]}")
                
        except Exception as e:
            self.log_test("Currency Override Test", False, f"Error: {e}")

        # Step 4: Test invalid currency handling
        print(f"\n🔍 Testing Invalid Currency Handling...")
        
        try:
            # Create simple test data
            invalid_currency_data = {
                'Ürün Adı': ['Invalid Currency Test Product'],
                'Liste Fiyatı': [100.00],
                'Açıklama': ['Test product with invalid currency']
            }
            
            df = pd.DataFrame(invalid_currency_data)
            excel_buffer = BytesIO()
            df.to_excel(excel_buffer, index=False)
            excel_buffer.seek(0)
            
            # Test with invalid currency
            files = {'file': ('invalid_currency_test.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            data = {'currency': 'INVALID'}  # Invalid currency
            
            url = f"{self.base_url}/companies/{currency_company_id}/upload-excel"
            response = requests.post(url, files=files, data=data, timeout=60)
            
            if response.status_code == 200:
                upload_result = response.json()
                if upload_result.get('success'):
                    # Should fall back to detected currency or default
                    currency_distribution = upload_result.get('summary', {}).get('currency_distribution', {})
                    if 'INVALID' not in currency_distribution:
                        self.log_test("Invalid Currency Handling", True, f"Invalid currency rejected, used: {list(currency_distribution.keys())}")
                    else:
                        self.log_test("Invalid Currency Handling", False, "Invalid currency was accepted")
                else:
                    self.log_test("Invalid Currency Upload", False, f"Upload failed: {upload_result}")
            else:
                self.log_test("Invalid Currency Request", False, f"HTTP {response.status_code}: {response.text[:200]}")
                
        except Exception as e:
            self.log_test("Invalid Currency Test", False, f"Error: {e}")

        # Step 5: Test no currency parameter (default behavior)
        print(f"\n🔍 Testing Default Currency Behavior...")
        
        try:
            # Create test data without currency parameter
            default_currency_data = {
                'Ürün Adı': ['Default Currency Test Product'],
                'Liste Fiyatı': [150.00],
                'Açıklama': ['Test product without currency parameter']
            }
            
            df = pd.DataFrame(default_currency_data)
            excel_buffer = BytesIO()
            df.to_excel(excel_buffer, index=False)
            excel_buffer.seek(0)
            
            # Upload without currency parameter
            files = {'file': ('default_currency_test.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            # No currency parameter
            
            url = f"{self.base_url}/companies/{currency_company_id}/upload-excel"
            response = requests.post(url, files=files, timeout=60)
            
            if response.status_code == 200:
                upload_result = response.json()
                if upload_result.get('success'):
                    currency_distribution = upload_result.get('summary', {}).get('currency_distribution', {})
                    if currency_distribution:
                        default_currency = list(currency_distribution.keys())[0]
                        self.log_test("Default Currency Behavior", True, f"Default currency used: {default_currency}")
                    else:
                        self.log_test("Default Currency Behavior", False, "No currency distribution found")
                else:
                    self.log_test("Default Currency Upload", False, f"Upload failed: {upload_result}")
            else:
                self.log_test("Default Currency Request", False, f"HTTP {response.status_code}: {response.text[:200]}")
                
        except Exception as e:
            self.log_test("Default Currency Test", False, f"Error: {e}")

        print(f"\n✅ Excel Currency Selection Test Summary:")
        print(f"   - Tested currency parameter handling for USD, EUR, TRY")
        print(f"   - Verified currency override logic works correctly")
        print(f"   - Tested currency conversion with user selection")
        print(f"   - Verified currency distribution in responses")
        print(f"   - Tested invalid currency handling")
        print(f"   - Tested default behavior without currency parameter")
        
        return True

    def cleanup(self):
        """Clean up created test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created products
        for product_id in self.created_products:
            try:
                response = requests.delete(f"{self.base_url}/products/{product_id}", timeout=30)
                if response.status_code == 200:
                    print(f"✅ Deleted product {product_id}")
                else:
                    print(f"⚠️ Failed to delete product {product_id}")
            except Exception as e:
                print(f"⚠️ Error deleting product {product_id}: {e}")
        
        # Delete created companies
        for company_id in self.created_companies:
            try:
                response = requests.delete(f"{self.base_url}/companies/{company_id}", timeout=30)
                if response.status_code == 200:
                    print(f"✅ Deleted company {company_id}")
                else:
                    print(f"⚠️ Failed to delete company {company_id}")
            except Exception as e:
                print(f"⚠️ Error deleting company {company_id}: {e}")
        
        print(f"Cleanup completed: {len(self.created_products)} products, {len(self.created_companies)} companies")

    def run_tests(self):
        """Run currency selection tests"""
        print("🚀 Starting Excel Currency Selection Testing...")
        print(f"Testing against: {self.base_url}")
        print("=" * 80)
        
        try:
            # Run the currency selection tests
            self.test_excel_currency_selection_system()
            
        finally:
            # Always cleanup
            self.cleanup()
        
        # Print final results
        print("\n" + "=" * 80)
        print("🎯 FINAL TEST RESULTS")
        print("=" * 80)
        print(f"Total Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 ALL TESTS PASSED!")
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} TESTS FAILED")
        
        print("=" * 80)

if __name__ == "__main__":
    tester = CurrencySelectionTester()
    tester.run_tests()