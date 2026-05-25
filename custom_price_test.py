#!/usr/bin/env python3
"""
Custom Price Feature Test Suite
Tests the custom price functionality for package products
"""

import requests
import sys
import json
import time
from datetime import datetime

class CustomPriceAPITester:
    def __init__(self, base_url="https://quotemate-3.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0

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

    def test_custom_price_comprehensive(self):
        """Comprehensive test for custom price functionality in package products"""
        print("\n🔍 Testing Custom Price Feature for Package Products...")
        
        # First, find the existing "Motokaravan" package
        motokaravan_package_id = "58f990f8-d1af-42af-a051-a1177d6a07f0"
        
        # Test 1: Get the Motokaravan package and verify it exists
        print("\n🔍 Testing Package Retrieval...")
        success, response = self.run_test(
            "Get Motokaravan Package",
            "GET",
            f"packages/{motokaravan_package_id}",
            200
        )
        
        package_products = []
        if success and response:
            try:
                package_data = response.json()
                package_products = package_data.get('products', [])
                self.log_test("Motokaravan Package Found", True, f"Package has {len(package_products)} products")
                
                # Verify package_product_id is included
                for product in package_products:
                    if 'package_product_id' in product:
                        self.log_test("Package Product ID Included", True, f"Product {product['name'][:30]}... has package_product_id")
                    else:
                        self.log_test("Package Product ID Included", False, f"Product {product['name'][:30]}... missing package_product_id")
                        
                    # Verify has_custom_price field
                    if 'has_custom_price' in product:
                        self.log_test("Has Custom Price Field", True, f"Product {product['name'][:30]}... has has_custom_price: {product['has_custom_price']}")
                    else:
                        self.log_test("Has Custom Price Field", False, f"Product {product['name'][:30]}... missing has_custom_price field")
                        
            except Exception as e:
                self.log_test("Package Data Parsing", False, f"Error: {e}")
                return False
        else:
            self.log_test("Motokaravan Package Found", False, "Package not found or error occurred")
            return False
        
        if not package_products:
            self.log_test("Package Products Available", False, "No products found in package")
            return False
        
        # Test 2: Custom Price Model Testing - Test different custom_price scenarios
        print("\n🔍 Testing Custom Price Model Scenarios...")
        
        test_scenarios = [
            {"custom_price": None, "description": "null (use original price)"},
            {"custom_price": 0, "description": "0 (gift item)"},
            {"custom_price": 150.50, "description": "positive value (custom price)"}
        ]
        
        for i, scenario in enumerate(test_scenarios):
            if i < len(package_products):
                product = package_products[i]
                package_product_id = product.get('package_product_id')
                
                if package_product_id:
                    # Test updating custom price
                    update_data = {"custom_price": scenario["custom_price"]}
                    
                    success, response = self.run_test(
                        f"Update Custom Price - {scenario['description']}",
                        "PUT",
                        f"packages/{motokaravan_package_id}/products/{package_product_id}",
                        200,
                        data=update_data
                    )
                    
                    if success and response:
                        try:
                            update_response = response.json()
                            if update_response.get('success'):
                                self.log_test(f"Custom Price Update Success - {scenario['description']}", True, update_response.get('message', ''))
                            else:
                                self.log_test(f"Custom Price Update Success - {scenario['description']}", False, "Update not successful")
                        except Exception as e:
                            self.log_test(f"Custom Price Update Response - {scenario['description']}", False, f"Error: {e}")
        
        # Test 3: Verify custom price changes in package response
        print("\n🔍 Testing Custom Price Response Verification...")
        
        success, response = self.run_test(
            "Get Package After Custom Price Updates",
            "GET",
            f"packages/{motokaravan_package_id}",
            200
        )
        
        if success and response:
            try:
                package_data = response.json()
                updated_products = package_data.get('products', [])
                
                for i, product in enumerate(updated_products[:len(test_scenarios)]):
                    expected_scenario = test_scenarios[i]
                    actual_custom_price = product.get('custom_price')
                    has_custom_price = product.get('has_custom_price', False)
                    
                    # Verify custom_price value
                    if expected_scenario["custom_price"] is None:
                        if actual_custom_price is None:
                            self.log_test(f"Custom Price Null Verification - Product {i+1}", True, "custom_price is null as expected")
                        else:
                            self.log_test(f"Custom Price Null Verification - Product {i+1}", False, f"Expected null, got: {actual_custom_price}")
                    else:
                        if actual_custom_price == expected_scenario["custom_price"]:
                            self.log_test(f"Custom Price Value Verification - Product {i+1}", True, f"custom_price is {actual_custom_price} as expected")
                        else:
                            self.log_test(f"Custom Price Value Verification - Product {i+1}", False, f"Expected {expected_scenario['custom_price']}, got: {actual_custom_price}")
                    
                    # Verify has_custom_price boolean
                    expected_has_custom = expected_scenario["custom_price"] is not None
                    if has_custom_price == expected_has_custom:
                        self.log_test(f"Has Custom Price Boolean - Product {i+1}", True, f"has_custom_price is {has_custom_price} as expected")
                    else:
                        self.log_test(f"Has Custom Price Boolean - Product {i+1}", False, f"Expected {expected_has_custom}, got: {has_custom_price}")
                        
            except Exception as e:
                self.log_test("Custom Price Response Verification", False, f"Error: {e}")
        
        # Test 4: Test quantity and custom_price update simultaneously
        print("\n🔍 Testing Simultaneous Quantity and Custom Price Updates...")
        
        if len(package_products) > 0:
            product = package_products[0]
            package_product_id = product.get('package_product_id')
            
            if package_product_id:
                update_data = {
                    "quantity": 3,
                    "custom_price": 299.99
                }
                
                success, response = self.run_test(
                    "Update Both Quantity and Custom Price",
                    "PUT",
                    f"packages/{motokaravan_package_id}/products/{package_product_id}",
                    200,
                    data=update_data
                )
                
                if success and response:
                    try:
                        update_response = response.json()
                        if update_response.get('success'):
                            message = update_response.get('message', '')
                            if 'miktar' in message and 'özel fiyat' in message:
                                self.log_test("Simultaneous Update Success", True, f"Both fields updated: {message}")
                            else:
                                self.log_test("Simultaneous Update Success", False, f"Message doesn't indicate both updates: {message}")
                        else:
                            self.log_test("Simultaneous Update Success", False, "Update not successful")
                    except Exception as e:
                        self.log_test("Simultaneous Update Response", False, f"Error: {e}")
        
        # Test 5: Test price calculation with custom prices
        print("\n🔍 Testing Price Calculations with Custom Prices...")
        
        success, response = self.run_test(
            "Get Package for Price Calculation Test",
            "GET",
            f"packages/{motokaravan_package_id}",
            200
        )
        
        if success and response:
            try:
                package_data = response.json()
                products = package_data.get('products', [])
                total_discounted_price = package_data.get('total_discounted_price', 0)
                
                # Calculate expected total manually
                expected_total = 0
                for product in products:
                    custom_price = product.get('custom_price')
                    quantity = product.get('quantity', 1)
                    
                    if custom_price is not None:
                        # Use custom price
                        effective_price = custom_price
                    else:
                        # Use original price
                        effective_price = product.get('discounted_price_try') or product.get('list_price_try', 0)
                    
                    expected_total += effective_price * quantity
                
                # Compare calculated total with returned total
                if abs(total_discounted_price - expected_total) < 0.01:
                    self.log_test("Price Calculation with Custom Prices", True, f"Total: ₺{total_discounted_price} (calculated: ₺{expected_total})")
                else:
                    self.log_test("Price Calculation with Custom Prices", False, f"Total mismatch: returned ₺{total_discounted_price}, calculated ₺{expected_total}")
                    
            except Exception as e:
                self.log_test("Price Calculation Test", False, f"Error: {e}")
        
        # Test 6: Test adding products to package with custom_price
        print("\n🔍 Testing Add Products to Package with Custom Price...")
        
        # First, get a product to add
        success, response = self.run_test(
            "Get Products for Package Addition",
            "GET",
            "products?limit=1",
            200
        )
        
        if success and response:
            try:
                products = response.json()
                if products and len(products) > 0:
                    test_product_id = products[0]['id']
                    
                    # Add product with custom price
                    add_data = [
                        {
                            "product_id": test_product_id,
                            "quantity": 2,
                            "custom_price": 199.99
                        }
                    ]
                    
                    success, response = self.run_test(
                        "Add Product with Custom Price",
                        "POST",
                        f"packages/{motokaravan_package_id}/products",
                        200,
                        data=add_data
                    )
                    
                    if success and response:
                        try:
                            add_response = response.json()
                            if add_response.get('success'):
                                self.log_test("Add Product with Custom Price", True, add_response.get('message', ''))
                                
                                # Verify the product was added with custom price
                                success, response = self.run_test(
                                    "Verify Added Product with Custom Price",
                                    "GET",
                                    f"packages/{motokaravan_package_id}",
                                    200
                                )
                                
                                if success and response:
                                    package_data = response.json()
                                    products = package_data.get('products', [])
                                    
                                    # Find the added product
                                    added_product = next((p for p in products if p['id'] == test_product_id), None)
                                    if added_product:
                                        if added_product.get('custom_price') == 199.99:
                                            self.log_test("Added Product Custom Price Verification", True, f"Custom price: ₺{added_product['custom_price']}")
                                        else:
                                            self.log_test("Added Product Custom Price Verification", False, f"Expected ₺199.99, got: ₺{added_product.get('custom_price')}")
                                    else:
                                        self.log_test("Added Product Found", False, "Added product not found in package")
                            else:
                                self.log_test("Add Product with Custom Price", False, "Addition not successful")
                        except Exception as e:
                            self.log_test("Add Product Response", False, f"Error: {e}")
                else:
                    self.log_test("Products Available for Addition", False, "No products found")
            except Exception as e:
                self.log_test("Get Products for Addition", False, f"Error: {e}")
        
        # Test 7: Error handling tests
        print("\n🔍 Testing Error Handling...")
        
        # Test with invalid package ID
        success, response = self.run_test(
            "Update Product - Invalid Package ID",
            "PUT",
            f"packages/invalid-package-id/products/some-product-id",
            404,
            data={"custom_price": 100}
        )
        
        if success and response:
            try:
                error_response = response.json()
                if 'bulunamadı' in error_response.get('detail', '').lower():
                    self.log_test("Invalid Package ID Error Message", True, f"Turkish error: {error_response.get('detail')}")
                else:
                    self.log_test("Invalid Package ID Error Message", False, f"Unexpected error: {error_response}")
            except Exception as e:
                self.log_test("Invalid Package ID Error Response", False, f"Error: {e}")
        
        # Test with invalid product ID
        if len(package_products) > 0:
            success, response = self.run_test(
                "Update Product - Invalid Product ID",
                "PUT",
                f"packages/{motokaravan_package_id}/products/invalid-product-id",
                404,
                data={"custom_price": 100}
            )
            
            if success and response:
                try:
                    error_response = response.json()
                    if 'bulunamadı' in error_response.get('detail', '').lower():
                        self.log_test("Invalid Product ID Error Message", True, f"Turkish error: {error_response.get('detail')}")
                    else:
                        self.log_test("Invalid Product ID Error Message", False, f"Unexpected error: {error_response}")
                except Exception as e:
                    self.log_test("Invalid Product ID Error Response", False, f"Error: {e}")
        
        # Test 8: Gift item scenario (custom_price = 0)
        print("\n🔍 Testing Gift Item Scenario (custom_price = 0)...")
        
        if len(package_products) > 0:
            product = package_products[0]
            package_product_id = product.get('package_product_id')
            
            if package_product_id:
                # Set custom price to 0 (gift)
                update_data = {"custom_price": 0}
                
                success, response = self.run_test(
                    "Set Product as Gift (custom_price = 0)",
                    "PUT",
                    f"packages/{motokaravan_package_id}/products/{package_product_id}",
                    200,
                    data=update_data
                )
                
                if success and response:
                    try:
                        update_response = response.json()
                        if update_response.get('success'):
                            self.log_test("Gift Item Update Success", True, update_response.get('message', ''))
                            
                            # Verify gift item in package response
                            success, response = self.run_test(
                                "Verify Gift Item in Package",
                                "GET",
                                f"packages/{motokaravan_package_id}",
                                200
                            )
                            
                            if success and response:
                                package_data = response.json()
                                products = package_data.get('products', [])
                                
                                # Find the gift product
                                gift_product = next((p for p in products if p.get('package_product_id') == package_product_id), None)
                                if gift_product:
                                    if gift_product.get('custom_price') == 0:
                                        self.log_test("Gift Item Price Verification", True, "Product set as gift (₺0)")
                                        
                                        # Verify has_custom_price is True for gift items
                                        if gift_product.get('has_custom_price') == True:
                                            self.log_test("Gift Item Has Custom Price Flag", True, "has_custom_price is True for gift item")
                                        else:
                                            self.log_test("Gift Item Has Custom Price Flag", False, f"Expected True, got: {gift_product.get('has_custom_price')}")
                                    else:
                                        self.log_test("Gift Item Price Verification", False, f"Expected ₺0, got: ₺{gift_product.get('custom_price')}")
                                else:
                                    self.log_test("Gift Item Found", False, "Gift product not found in package")
                        else:
                            self.log_test("Gift Item Update Success", False, "Update not successful")
                    except Exception as e:
                        self.log_test("Gift Item Update Response", False, f"Error: {e}")
        
        print(f"\n✅ Custom Price Feature Test Summary:")
        print(f"   - ✅ Tested PackageProduct model custom_price field")
        print(f"   - ✅ Tested PackageProductCreate and PackageProductUpdate models")
        print(f"   - ✅ Tested custom_price scenarios: null, 0, positive value")
        print(f"   - ✅ Tested PUT /api/packages/{{package_id}}/products/{{package_product_id}} endpoint")
        print(f"   - ✅ Tested quantity and custom_price simultaneous updates")
        print(f"   - ✅ Tested GET /api/packages/{{package_id}} custom_price response fields")
        print(f"   - ✅ Tested has_custom_price boolean field")
        print(f"   - ✅ Tested package_product_id inclusion")
        print(f"   - ✅ Tested price calculations with custom prices")
        print(f"   - ✅ Tested POST /api/packages/{{package_id}}/products with custom_price")
        print(f"   - ✅ Tested error handling for invalid IDs")
        print(f"   - ✅ Tested gift item scenario (custom_price = 0)")
        
        return True

if __name__ == "__main__":
    tester = CustomPriceAPITester()
    tester.test_custom_price_comprehensive()
    
    # Print final summary
    print("\n" + "=" * 80)
    print("📊 CUSTOM PRICE TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Tests Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed / tester.tests_run * 100):.1f}%" if tester.tests_run > 0 else "0%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 ALL CUSTOM PRICE TESTS PASSED!")
    else:
        print(f"⚠️ {tester.tests_run - tester.tests_passed} TESTS FAILED")
    
    print("=" * 80)