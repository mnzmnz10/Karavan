#!/usr/bin/env python3
"""
Excel Discount Functionality Test Script
Tests the new Excel upload discount functionality as requested
"""

import requests
import sys
import json
import time
from datetime import datetime
from io import BytesIO
import pandas as pd

class ExcelDiscountTester:
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

    def test_discount_parameter_validation(self, company_id):
        """Test discount parameter validation"""
        print("\n🔍 Testing Discount Parameter Validation...")
        
        # Create test Excel data in 4-column format (ELEKTROZİRVE format)
        test_data = {
            'Ürün Adı': ['Test Solar Panel Product'],
            'Liste Fiyatı': [100.00],
            'İskonto': [0],
            'Net Fiyat': [100.00]
        }
        
        df = pd.DataFrame(test_data)
        excel_buffer = BytesIO()
        df.to_excel(excel_buffer, index=False)
        
        # Test cases for discount validation
        test_cases = [
            {"discount": "-5", "should_pass": False, "description": "Negative discount"},
            {"discount": "150", "should_pass": False, "description": "Discount over 100%"},
            {"discount": "abc", "should_pass": False, "description": "Non-numeric discount"},
            {"discount": "", "should_pass": True, "description": "Empty discount (default to 0)"},
            {"discount": "0", "should_pass": True, "description": "0% discount"},
            {"discount": "20", "should_pass": True, "description": "Valid 20% discount"},
            {"discount": "15.5", "should_pass": True, "description": "Valid decimal discount"},
            {"discount": "100", "should_pass": True, "description": "100% discount (free)"}
        ]
        
        for test_case in test_cases:
            discount_value = test_case["discount"]
            should_pass = test_case["should_pass"]
            description = test_case["description"]
            
            excel_buffer.seek(0)
            files = {'file': ('test.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            data = {'discount': discount_value}
            
            try:
                url = f"{self.base_url}/companies/{company_id}/upload-excel"
                response = requests.post(url, files=files, data=data, timeout=30)
                
                if should_pass:
                    if response.status_code == 200:
                        self.log_test(f"Discount Validation - {description}", True, f"Accepted discount '{discount_value}'")
                    else:
                        try:
                            error_detail = response.json().get('detail', 'Unknown error')
                            self.log_test(f"Discount Validation - {description}", False, f"Expected 200, got {response.status_code}: {error_detail}")
                        except:
                            self.log_test(f"Discount Validation - {description}", False, f"Expected 200, got {response.status_code}: {response.text[:100]}")
                else:
                    if response.status_code == 400:
                        self.log_test(f"Discount Validation - {description}", True, f"Correctly rejected discount '{discount_value}'")
                    else:
                        try:
                            error_detail = response.json().get('detail', 'Unknown error')
                            self.log_test(f"Discount Validation - {description}", False, f"Expected 400, got {response.status_code}: {error_detail}")
                        except:
                            self.log_test(f"Discount Validation - {description}", False, f"Expected 400, got {response.status_code}: {response.text[:100]}")
                        
            except Exception as e:
                self.log_test(f"Discount Validation - {description}", False, f"Exception: {e}")

    def test_discount_calculations(self, company_id):
        """Test discount calculation accuracy"""
        print("\n🔍 Testing Discount Calculations...")
        
        # Test cases with expected results
        test_cases = [
            {"original_price": 100.00, "discount": "20", "expected_discounted": 80.00},
            {"original_price": 250.00, "discount": "20", "expected_discounted": 200.00},
            {"original_price": 100.00, "discount": "15.5", "expected_discounted": 84.50},
            {"original_price": 100.00, "discount": "0", "expected_discounted": None}
        ]
        
        for i, test_case in enumerate(test_cases):
            original_price = test_case["original_price"]
            discount = test_case["discount"]
            expected_discounted = test_case["expected_discounted"]
            
            # Create test data in 4-column format
            test_data = {
                'Ürün Adı': [f'Discount Test Solar Panel {i+1}'],
                'Liste Fiyatı': [original_price],
                'İskonto': [0],
                'Net Fiyat': [original_price]
            }
            
            df = pd.DataFrame(test_data)
            excel_buffer = BytesIO()
            df.to_excel(excel_buffer, index=False)
            excel_buffer.seek(0)
            
            files = {'file': ('discount_calc_test.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            data = {'discount': discount, 'currency': 'USD'}
            
            try:
                url = f"{self.base_url}/companies/{company_id}/upload-excel"
                response = requests.post(url, files=files, data=data, timeout=30)
                
                if response.status_code == 200:
                    # Verify the calculation by checking the created product
                    products_response = requests.get(f"{self.base_url}/products", timeout=30)
                    if products_response.status_code == 200:
                        products = products_response.json()
                        test_product = next((p for p in products if f'Discount Test Product {i+1}' in p.get('name', '')), None)
                        
                        if test_product:
                            list_price = test_product.get('list_price', 0)
                            discounted_price = test_product.get('discounted_price')
                            
                            # Verify list price preservation
                            if abs(list_price - original_price) < 0.01:
                                self.log_test(f"List Price Preservation - {discount}% discount", True, f"Original: ${original_price}, Stored: ${list_price}")
                            else:
                                self.log_test(f"List Price Preservation - {discount}% discount", False, f"Expected ${original_price}, got ${list_price}")
                            
                            # Verify discount calculation
                            if expected_discounted is None:
                                if discounted_price is None:
                                    self.log_test(f"Discount Calculation - {discount}% discount", True, f"No discount applied correctly")
                                else:
                                    self.log_test(f"Discount Calculation - {discount}% discount", False, f"Expected None, got ${discounted_price}")
                            else:
                                if discounted_price and abs(discounted_price - expected_discounted) < 0.01:
                                    self.log_test(f"Discount Calculation - {discount}% discount", True, f"${original_price} → ${discounted_price} ({discount}% off)")
                                else:
                                    self.log_test(f"Discount Calculation - {discount}% discount", False, f"Expected ${expected_discounted}, got ${discounted_price}")
                            
                            # Verify TRY conversion
                            list_price_try = test_product.get('list_price_try')
                            discounted_price_try = test_product.get('discounted_price_try')
                            
                            if list_price_try and list_price_try > 0:
                                self.log_test(f"TRY Conversion List Price - {discount}% discount", True, f"Converted to TRY: {list_price_try}")
                            else:
                                self.log_test(f"TRY Conversion List Price - {discount}% discount", False, f"Invalid TRY conversion: {list_price_try}")
                            
                            if expected_discounted is not None:
                                if discounted_price_try and discounted_price_try > 0:
                                    self.log_test(f"TRY Conversion Discounted Price - {discount}% discount", True, f"Converted to TRY: {discounted_price_try}")
                                else:
                                    self.log_test(f"TRY Conversion Discounted Price - {discount}% discount", False, f"Invalid TRY conversion: {discounted_price_try}")
                        else:
                            self.log_test(f"Product Creation - {discount}% discount", False, "Test product not found")
                    else:
                        self.log_test(f"Product Fetch - {discount}% discount", False, f"Failed to fetch products: {products_response.status_code}")
                else:
                    self.log_test(f"Upload - {discount}% discount", False, f"Upload failed: {response.status_code}")
                    
            except Exception as e:
                self.log_test(f"Discount Calculation Test - {discount}%", False, f"Exception: {e}")

    def test_discount_with_currencies(self, company_id):
        """Test discount with different currency selections"""
        print("\n🔍 Testing Discount with Currency Selection...")
        
        currencies = ["USD", "EUR", "TRY"]
        
        for currency in currencies:
            test_data = {
                'Ürün Adı': [f'Currency Test Solar Panel {currency}'],
                'Liste Fiyatı': [100.00],
                'İskonto': [0],
                'Net Fiyat': [100.00]
            }
            
            df = pd.DataFrame(test_data)
            excel_buffer = BytesIO()
            df.to_excel(excel_buffer, index=False)
            excel_buffer.seek(0)
            
            files = {'file': ('currency_discount_test.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            data = {'discount': '25', 'currency': currency}
            
            try:
                url = f"{self.base_url}/companies/{company_id}/upload-excel"
                response = requests.post(url, files=files, data=data, timeout=30)
                
                if response.status_code == 200:
                    self.log_test(f"Currency + Discount Upload - {currency}", True, f"25% discount with {currency} currency")
                    
                    # Verify the product was created with correct currency and discount
                    products_response = requests.get(f"{self.base_url}/products", timeout=30)
                    if products_response.status_code == 200:
                        products = products_response.json()
                        test_product = next((p for p in products if f'Currency Test {currency}' in p.get('name', '')), None)
                        
                        if test_product:
                            product_currency = test_product.get('currency')
                            list_price = test_product.get('list_price', 0)
                            discounted_price = test_product.get('discounted_price')
                            
                            # Verify currency assignment
                            if product_currency == currency:
                                self.log_test(f"Currency Assignment - {currency}", True, f"Product currency: {product_currency}")
                            else:
                                self.log_test(f"Currency Assignment - {currency}", False, f"Expected {currency}, got {product_currency}")
                            
                            # Verify discount calculation (25% off 100 = 75)
                            expected_discounted = 75.00
                            if discounted_price and abs(discounted_price - expected_discounted) < 0.01:
                                self.log_test(f"Currency Discount Calculation - {currency}", True, f"100 {currency} → {discounted_price} {currency}")
                            else:
                                self.log_test(f"Currency Discount Calculation - {currency}", False, f"Expected {expected_discounted}, got {discounted_price}")
                        else:
                            self.log_test(f"Currency Test Product - {currency}", False, "Test product not found")
                else:
                    self.log_test(f"Currency + Discount Upload - {currency}", False, f"Upload failed: {response.status_code}")
                    
            except Exception as e:
                self.log_test(f"Currency Discount Test - {currency}", False, f"Exception: {e}")

    def run_discount_tests(self):
        """Run all discount functionality tests"""
        print("🚀 Starting Excel Discount Functionality Tests...")
        print(f"   Base URL: {self.base_url}")
        print(f"   Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
        
        try:
            # Step 1: Create test company
            print("\n🔍 Creating Test Company...")
            company_name = f"Discount Test Company {datetime.now().strftime('%H%M%S')}"
            
            response = requests.post(
                f"{self.base_url}/companies",
                json={"name": company_name},
                timeout=30
            )
            
            if response.status_code == 200:
                company_data = response.json()
                company_id = company_data.get('id')
                if company_id:
                    self.created_companies.append(company_id)
                    self.log_test("Test Company Creation", True, f"Company ID: {company_id}")
                    
                    # Step 2: Run discount tests
                    self.test_discount_parameter_validation(company_id)
                    self.test_discount_calculations(company_id)
                    self.test_discount_with_currencies(company_id)
                    
                else:
                    self.log_test("Test Company Creation", False, "No company ID returned")
                    return False
            else:
                self.log_test("Test Company Creation", False, f"Failed to create company: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Test suite failed with error: {e}")
        finally:
            # Cleanup
            self.cleanup()
            
            # Print summary
            print("\n" + "=" * 80)
            print("📊 EXCEL DISCOUNT FUNCTIONALITY TEST SUMMARY")
            print("=" * 80)
            print(f"Total Tests Run: {self.tests_run}")
            print(f"Tests Passed: {self.tests_passed}")
            print(f"Tests Failed: {self.tests_run - self.tests_passed}")
            print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
            
            if self.tests_passed == self.tests_run:
                print("🎉 ALL DISCOUNT TESTS PASSED!")
                return True
            else:
                print("⚠️  SOME DISCOUNT TESTS FAILED!")
                return False

    def cleanup(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        for company_id in self.created_companies:
            try:
                response = requests.delete(f"{self.base_url}/companies/{company_id}", timeout=30)
                if response.status_code == 200:
                    print(f"   ✅ Deleted company {company_id}")
                else:
                    print(f"   ⚠️  Failed to delete company {company_id}: {response.status_code}")
            except Exception as e:
                print(f"   ⚠️  Error deleting company {company_id}: {e}")

if __name__ == "__main__":
    tester = ExcelDiscountTester()
    success = tester.run_discount_tests()
    sys.exit(0 if success else 1)