#!/usr/bin/env python3
"""
Single Product Creation System Test
Tests the specific fix for: "ürünler menüsünden tekil ürün eklerken hata veriyor ürün oluşturulamadı diye, ama excel olarak yüklerken yüklüyor"
"""

import requests
import sys
import json
import time
import uuid
from datetime import datetime
from io import BytesIO
import pandas as pd

class SingleProductTester:
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

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'} if not files else {}

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, timeout=30)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if success:
                try:
                    response_data = response.json()
                    details += f" | Response: {json.dumps(response_data, indent=2)[:200]}..."
                except:
                    details += f" | Response: {response.text[:100]}..."
            else:
                details += f" | Expected: {expected_status}"
                try:
                    error_data = response.json()
                    details += f" | Error: {error_data}"
                except:
                    details += f" | Error: {response.text[:100]}"

            return self.log_test(name, success, details), response

        except Exception as e:
            return self.log_test(name, False, f"Exception: {str(e)}"), None

    def test_single_product_creation_comprehensive(self):
        """
        Comprehensive test for single product creation system fix
        Tests the specific issue: "ürünler menüsünden tekil ürün eklerken hata veriyor ürün oluşturulamadı diye, ama excel olarak yüklerken yüklüyor"
        """
        print("\n🔍 Testing Single Product Creation System Fix...")
        print("🎯 Focus: Manual product creation vs Excel upload parity")
        
        # First create a test company for our tests
        test_company_name = f"Single Product Test Company {datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create Test Company for Single Product Tests",
            "POST",
            "companies",
            200,
            data={"name": test_company_name}
        )
        
        if not success or not response:
            self.log_test("Single Product Test Setup", False, "Failed to create test company")
            return False
            
        try:
            company_data = response.json()
            test_company_id = company_data.get('id')
            if not test_company_id:
                self.log_test("Single Product Test Setup", False, "No company ID returned")
                return False
            self.created_companies.append(test_company_id)
        except Exception as e:
            self.log_test("Single Product Test Setup", False, f"Error parsing company response: {e}")
            return False

        # Test 1: Product Creation Bug Fix Testing - POST /api/products endpoint
        print("\n🔍 Testing Product Creation Bug Fix - Decimal Serialization...")
        
        test_products = [
            {
                "name": "Test Solar Panel TRY",
                "company_id": test_company_id,
                "list_price": 5000.50,
                "discounted_price": 4500.25,
                "currency": "TRY",
                "description": "Test product in TRY currency"
            },
            {
                "name": "Test Inverter USD",
                "company_id": test_company_id,
                "list_price": 299.99,
                "discounted_price": 249.99,
                "currency": "USD",
                "description": "Test product in USD currency"
            },
            {
                "name": "Test Battery EUR",
                "company_id": test_company_id,
                "list_price": 450.75,
                "discounted_price": 399.50,
                "currency": "EUR",
                "description": "Test product in EUR currency"
            },
            {
                "name": "Test MPPT Controller TRY No Discount",
                "company_id": test_company_id,
                "list_price": 1250.00,
                "currency": "TRY",
                "description": "Test product without discount"
            }
        ]
        
        created_product_ids = []
        
        for i, product_data in enumerate(test_products):
            success, response = self.run_test(
                f"POST /api/products - {product_data['currency']} Product {i+1}",
                "POST",
                "products",
                200,
                data=product_data
            )
            
            if success and response:
                try:
                    product_response = response.json()
                    product_id = product_response.get('id')
                    
                    if product_id:
                        created_product_ids.append(product_id)
                        self.created_products.append(product_id)
                        self.log_test(f"Product Creation Success - {product_data['currency']}", True, f"ID: {product_id}")
                        
                        # Test Decimal serialization fix - check that all price fields are properly serialized
                        list_price = product_response.get('list_price')
                        discounted_price = product_response.get('discounted_price')
                        list_price_try = product_response.get('list_price_try')
                        discounted_price_try = product_response.get('discounted_price_try')
                        
                        # Verify list_price is properly serialized (not Decimal object)
                        if isinstance(list_price, (int, float)) and list_price > 0:
                            self.log_test(f"list_price Decimal→float Conversion - {product_data['currency']}", True, f"Value: {list_price}")
                        else:
                            self.log_test(f"list_price Decimal→float Conversion - {product_data['currency']}", False, f"Invalid value: {list_price}")
                        
                        # Verify discounted_price is properly serialized if present
                        if product_data.get('discounted_price'):
                            if isinstance(discounted_price, (int, float)) and discounted_price > 0:
                                self.log_test(f"discounted_price Decimal→float Conversion - {product_data['currency']}", True, f"Value: {discounted_price}")
                            else:
                                self.log_test(f"discounted_price Decimal→float Conversion - {product_data['currency']}", False, f"Invalid value: {discounted_price}")
                        
                        # Verify TRY conversion is properly serialized
                        if isinstance(list_price_try, (int, float)) and list_price_try > 0:
                            self.log_test(f"list_price_try Calculation & Serialization - {product_data['currency']}", True, f"Value: {list_price_try}")
                        else:
                            self.log_test(f"list_price_try Calculation & Serialization - {product_data['currency']}", False, f"Invalid value: {list_price_try}")
                        
                        if product_data.get('discounted_price') and discounted_price_try:
                            if isinstance(discounted_price_try, (int, float)) and discounted_price_try > 0:
                                self.log_test(f"discounted_price_try Calculation & Serialization - {product_data['currency']}", True, f"Value: {discounted_price_try}")
                            else:
                                self.log_test(f"discounted_price_try Calculation & Serialization - {product_data['currency']}", False, f"Invalid value: {discounted_price_try}")
                        
                    else:
                        self.log_test(f"Product Creation Response - {product_data['currency']}", False, "No product ID returned")
                        
                except Exception as e:
                    self.log_test(f"Product Creation Response Parsing - {product_data['currency']}", False, f"Error: {e}")
            else:
                self.log_test(f"Product Creation Failed - {product_data['currency']}", False, "HTTP request failed")

        # Test 2: Currency Conversion Testing
        print("\n🔍 Testing Currency Conversion Accuracy...")
        
        # Get current exchange rates for validation
        success, response = self.run_test(
            "Get Current Exchange Rates for Validation",
            "GET",
            "exchange-rates",
            200
        )
        
        current_rates = {}
        if success and response:
            try:
                rates_data = response.json()
                if rates_data.get('success') and 'rates' in rates_data:
                    current_rates = rates_data['rates']
                    self.log_test("Exchange Rates Retrieved", True, f"USD: {current_rates.get('USD')}, EUR: {current_rates.get('EUR')}")
                else:
                    self.log_test("Exchange Rates Retrieved", False, "Invalid response format")
            except Exception as e:
                self.log_test("Exchange Rates Parsing", False, f"Error: {e}")
        
        # Test currency conversion accuracy for created products
        for product_id in created_product_ids:
            success, response = self.run_test(
                f"Get Product for Currency Validation - {product_id[:8]}...",
                "GET",
                "products",
                200
            )
            
            if success and response:
                try:
                    products = response.json()
                    target_product = next((p for p in products if p.get('id') == product_id), None)
                    
                    if target_product:
                        currency = target_product.get('currency')
                        list_price = target_product.get('list_price')
                        list_price_try = target_product.get('list_price_try')
                        
                        if currency == 'TRY':
                            # TRY products should have same price in TRY
                            if abs(list_price - list_price_try) < 0.01:
                                self.log_test(f"TRY Currency Conversion - {product_id[:8]}...", True, f"{list_price} TRY → {list_price_try} TRY (same)")
                            else:
                                self.log_test(f"TRY Currency Conversion - {product_id[:8]}...", False, f"{list_price} TRY → {list_price_try} TRY (should be same)")
                        
                        elif currency in current_rates and current_rates[currency] > 0:
                            # Calculate expected TRY value
                            expected_try = list_price * current_rates[currency]
                            tolerance = expected_try * 0.05  # 5% tolerance for rate fluctuations
                            
                            if abs(list_price_try - expected_try) <= tolerance:
                                self.log_test(f"{currency} Currency Conversion - {product_id[:8]}...", True, f"{list_price} {currency} → {list_price_try} TRY (expected ~{expected_try:.2f})")
                            else:
                                self.log_test(f"{currency} Currency Conversion - {product_id[:8]}...", False, f"{list_price} {currency} → {list_price_try} TRY (expected ~{expected_try:.2f})")
                        
                except Exception as e:
                    self.log_test(f"Currency Validation - {product_id[:8]}...", False, f"Error: {e}")

        # Test 3: Product Model Validation Testing
        print("\n🔍 Testing Product Model Validation...")
        
        # Test required fields validation
        invalid_products = [
            {
                "name": "",  # Empty name
                "company_id": test_company_id,
                "list_price": 100.0,
                "currency": "USD"
            },
            {
                "name": "Test Product",
                "company_id": "invalid-company-id",  # Invalid company_id
                "list_price": 100.0,
                "currency": "USD"
            }
        ]
        
        for i, invalid_product in enumerate(invalid_products):
            success, response = self.run_test(
                f"Invalid Product Validation Test {i+1}",
                "POST",
                "products",
                422,  # Expecting validation error
                data=invalid_product
            )
            
            if success:
                self.log_test(f"Product Validation Error Handling {i+1}", True, "Properly rejected invalid product")
            else:
                self.log_test(f"Product Validation Error Handling {i+1}", False, "Should have rejected invalid product")

        # Test 4: Excel vs Manual Creation Parity Testing
        print("\n🔍 Testing Excel vs Manual Creation Parity...")
        
        # Create a sample Excel file with the same products we created manually
        try:
            excel_test_data = {
                'Ürün Adı': ['Excel Test Solar Panel', 'Excel Test Inverter', 'Excel Test Battery'],
                'Liste Fiyatı': [5000.50, 299.99, 450.75],
                'İndirimli Fiyat': [4500.25, 249.99, 399.50],
                'Para Birimi': ['TRY', 'USD', 'EUR'],
                'Açıklama': ['Excel uploaded solar panel', 'Excel uploaded inverter', 'Excel uploaded battery']
            }
            
            df = pd.DataFrame(excel_test_data)
            excel_buffer = BytesIO()
            df.to_excel(excel_buffer, index=False)
            excel_buffer.seek(0)
            
            # Upload the Excel file
            files = {'file': ('parity_test.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            
            success, response = self.run_test(
                "Excel Upload for Parity Test",
                "POST",
                f"companies/{test_company_id}/upload-excel",
                200,
                files=files
            )
            
            if success and response:
                try:
                    upload_result = response.json()
                    if upload_result.get('success'):
                        products_count = upload_result.get('products_count', 0)
                        self.log_test("Excel Upload Success", True, f"Uploaded {products_count} products")
                        
                        # Now compare the results - get all products for this company
                        success, response = self.run_test(
                            "Get All Products for Parity Comparison",
                            "GET",
                            "products",
                            200
                        )
                        
                        if success and response:
                            try:
                                all_products = response.json()
                                company_products = [p for p in all_products if p.get('company_id') == test_company_id]
                                
                                manual_products = [p for p in company_products if not p.get('name', '').startswith('Excel Test')]
                                excel_products = [p for p in company_products if p.get('name', '').startswith('Excel Test')]
                                
                                self.log_test("Manual vs Excel Product Count", True, f"Manual: {len(manual_products)}, Excel: {len(excel_products)}")
                                
                                # Compare similar products (TRY currency products)
                                manual_try_products = [p for p in manual_products if p.get('currency') == 'TRY']
                                excel_try_products = [p for p in excel_products if p.get('currency') == 'TRY']
                                
                                if manual_try_products and excel_try_products:
                                    manual_product = manual_try_products[0]
                                    excel_product = excel_try_products[0]
                                    
                                    # Compare structure and fields
                                    manual_fields = set(manual_product.keys())
                                    excel_fields = set(excel_product.keys())
                                    
                                    if manual_fields == excel_fields:
                                        self.log_test("Manual vs Excel Product Structure", True, "Same fields in both products")
                                    else:
                                        missing_in_excel = manual_fields - excel_fields
                                        missing_in_manual = excel_fields - manual_fields
                                        self.log_test("Manual vs Excel Product Structure", False, f"Missing in Excel: {missing_in_excel}, Missing in Manual: {missing_in_manual}")
                                    
                                    # Compare TRY conversion accuracy
                                    manual_try_price = manual_product.get('list_price_try')
                                    excel_try_price = excel_product.get('list_price_try')
                                    
                                    if manual_try_price and excel_try_price:
                                        # Both should be close to their original TRY prices
                                        manual_original = manual_product.get('list_price')
                                        excel_original = excel_product.get('list_price')
                                        
                                        if (abs(manual_try_price - manual_original) < 0.01 and 
                                            abs(excel_try_price - excel_original) < 0.01):
                                            self.log_test("Manual vs Excel TRY Conversion Parity", True, f"Both convert TRY correctly")
                                        else:
                                            self.log_test("Manual vs Excel TRY Conversion Parity", False, f"Manual: {manual_try_price}, Excel: {excel_try_price}")
                                    
                                else:
                                    self.log_test("Manual vs Excel TRY Product Comparison", False, "No TRY products found for comparison")
                                    
                            except Exception as e:
                                self.log_test("Parity Comparison Analysis", False, f"Error: {e}")
                        
                    else:
                        self.log_test("Excel Upload Success", False, "Upload failed")
                except Exception as e:
                    self.log_test("Excel Upload Response Parsing", False, f"Error: {e}")
                    
        except Exception as e:
            self.log_test("Excel Parity Test Setup", False, f"Error creating Excel file: {e}")

        # Test 5: MongoDB Serialization Fix Testing
        print("\n🔍 Testing MongoDB Serialization Fix...")
        
        # Test that we can retrieve products without serialization errors
        success, response = self.run_test(
            "MongoDB Serialization Test - Get All Products",
            "GET",
            "products",
            200
        )
        
        if success and response:
            try:
                products = response.json()
                serialization_errors = 0
                
                for product in products:
                    # Check that all price fields are properly serialized
                    for field in ['list_price', 'discounted_price', 'list_price_try', 'discounted_price_try']:
                        value = product.get(field)
                        if value is not None:
                            if not isinstance(value, (int, float)):
                                serialization_errors += 1
                                self.log_test(f"Serialization Error in {field}", False, f"Product {product.get('name', 'Unknown')}: {field} = {value} (type: {type(value)})")
                
                if serialization_errors == 0:
                    self.log_test("MongoDB Serialization Fix", True, f"All {len(products)} products have properly serialized price fields")
                else:
                    self.log_test("MongoDB Serialization Fix", False, f"{serialization_errors} serialization errors found")
                    
            except Exception as e:
                self.log_test("MongoDB Serialization Test", False, f"Error: {e}")

        print(f"\n✅ Single Product Creation System Test Summary:")
        print(f"   - ✅ Tested POST /api/products endpoint with Decimal serialization fix")
        print(f"   - ✅ Tested TRY, USD, EUR currency product creation")
        print(f"   - ✅ Tested products with and without discounted prices")
        print(f"   - ✅ Verified currency conversion accuracy")
        print(f"   - ✅ Tested Decimal → float conversion for all price fields")
        print(f"   - ✅ Verified MongoDB serialization fix")
        print(f"   - ✅ Tested product model validation (required/optional fields)")
        print(f"   - ✅ Compared manual vs Excel creation parity")
        print(f"   - 🎯 Addressed user issue: 'ürünler menüsünden tekil ürün eklerken hata veriyor'")
        
        return True

    def cleanup(self):
        """Clean up created test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created products
        for product_id in self.created_products:
            try:
                success, response = self.run_test(
                    f"Delete Product {product_id[:8]}...",
                    "DELETE",
                    f"products/{product_id}",
                    200
                )
            except:
                pass  # Ignore cleanup errors
        
        # Delete created companies
        for company_id in self.created_companies:
            try:
                success, response = self.run_test(
                    f"Delete Company {company_id[:8]}...",
                    "DELETE",
                    f"companies/{company_id}",
                    200
                )
            except:
                pass  # Ignore cleanup errors
        
        print(f"✅ Cleanup completed")

    def run_tests(self):
        """Run the single product creation tests"""
        print("🚀 Starting Single Product Creation System Test...")
        print(f"🌐 Testing against: {self.base_url}")
        print("=" * 80)
        
        try:
            self.test_single_product_creation_comprehensive()
            
        except KeyboardInterrupt:
            print("\n⚠️ Tests interrupted by user")
        except Exception as e:
            print(f"\n❌ Test suite failed with error: {e}")
        finally:
            # Always run cleanup
            self.cleanup()
            
            # Print final summary
            print("\n" + "=" * 80)
            print("📊 FINAL TEST SUMMARY")
            print("=" * 80)
            print(f"Total Tests Run: {self.tests_run}")
            print(f"Tests Passed: {self.tests_passed}")
            print(f"Tests Failed: {self.tests_run - self.tests_passed}")
            print(f"Success Rate: {(self.tests_passed / self.tests_run * 100):.1f}%" if self.tests_run > 0 else "No tests run")
            
            if self.tests_passed == self.tests_run:
                print("🎉 ALL TESTS PASSED!")
            else:
                print(f"⚠️ {self.tests_run - self.tests_passed} tests failed")
            
            print("=" * 80)

if __name__ == "__main__":
    tester = SingleProductTester()
    tester.run_tests()