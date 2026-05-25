#!/usr/bin/env python3
"""
Test script for Package Sale Price Optional functionality
"""

import requests
import json
import uuid
from datetime import datetime

class PackageSalePriceTester:
    def __init__(self, base_url="https://quotemate-3.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_companies = []
        self.created_products = []
        self.created_packages = []

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
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

    def test_package_sale_price_optional(self):
        """Test the optional sale price functionality for packages after backend model fixes"""
        print("\n🔍 Testing Package Sale Price Optional Feature...")
        
        # Step 1: Create a test company for package testing
        test_company_name = f"Package Sale Price Test Company {datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create Test Company for Package Sale Price Test",
            "POST",
            "companies",
            200,
            data={"name": test_company_name}
        )
        
        if not success or not response:
            self.log_test("Package Sale Price Test Setup", False, "Failed to create test company")
            return False
            
        try:
            company_data = response.json()
            test_company_id = company_data.get('id')
            if not test_company_id:
                self.log_test("Package Sale Price Test Setup", False, "No company ID returned")
                return False
            self.created_companies.append(test_company_id)
        except Exception as e:
            self.log_test("Package Sale Price Test Setup", False, f"Error parsing company response: {e}")
            return False

        # Step 2: Create test products for packages
        test_products = [
            {
                "name": "Test Product 1 for Package",
                "company_id": test_company_id,
                "list_price": 100.00,
                "currency": "USD",
                "description": "Test product for package sale price testing"
            },
            {
                "name": "Test Product 2 for Package",
                "company_id": test_company_id,
                "list_price": 200.00,
                "currency": "EUR",
                "description": "Another test product for package testing"
            }
        ]
        
        created_product_ids = []
        
        for product_data in test_products:
            success, response = self.run_test(
                f"Create Product: {product_data['name']}",
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
                        self.log_test(f"Product Created - {product_data['name']}", True, f"ID: {product_id}")
                    else:
                        self.log_test(f"Product Creation - {product_data['name']}", False, "No product ID returned")
                except Exception as e:
                    self.log_test(f"Product Creation - {product_data['name']}", False, f"Error parsing: {e}")

        if len(created_product_ids) < 2:
            self.log_test("Package Sale Price Test Products", False, f"Only {len(created_product_ids)} products created, need at least 2")
            return False

        # Test 1: Package Creation Without Sale Price Field
        print("\n🔍 Testing Package Creation Without Sale Price Field...")
        
        package_without_sale_price = {
            "name": "Package Without Sale Price",
            "description": "Test package created without sale_price field"
        }
        
        success, response = self.run_test(
            "Create Package Without Sale Price Field",
            "POST",
            "packages",
            200,
            data=package_without_sale_price
        )
        
        if success and response:
            try:
                package_response = response.json()
                package_id = package_response.get('id')
                if package_id:
                    self.created_packages.append(package_id)
                    self.log_test("Package Creation Without Sale Price", True, f"Package ID: {package_id}")
                    
                    # Verify sale_price is None in response
                    sale_price = package_response.get('sale_price')
                    if sale_price is None:
                        self.log_test("Sale Price None Verification", True, "sale_price is correctly None")
                    else:
                        self.log_test("Sale Price None Verification", False, f"Expected None, got: {sale_price}")
                else:
                    self.log_test("Package Creation Without Sale Price", False, "No package ID returned")
            except Exception as e:
                self.log_test("Package Creation Without Sale Price", False, f"Error parsing: {e}")

        # Test 2: Package Creation With Null Sale Price
        print("\n🔍 Testing Package Creation With Null Sale Price...")
        
        package_with_null_sale_price = {
            "name": "Package With Null Sale Price",
            "description": "Test package created with explicit null sale_price",
            "sale_price": None
        }
        
        success, response = self.run_test(
            "Create Package With Null Sale Price",
            "POST",
            "packages",
            200,
            data=package_with_null_sale_price
        )
        
        if success and response:
            try:
                package_response = response.json()
                package_id = package_response.get('id')
                if package_id:
                    self.created_packages.append(package_id)
                    self.log_test("Package Creation With Null Sale Price", True, f"Package ID: {package_id}")
                    
                    # Verify sale_price is None in response
                    sale_price = package_response.get('sale_price')
                    if sale_price is None:
                        self.log_test("Null Sale Price Verification", True, "sale_price is correctly None")
                    else:
                        self.log_test("Null Sale Price Verification", False, f"Expected None, got: {sale_price}")
                else:
                    self.log_test("Package Creation With Null Sale Price", False, "No package ID returned")
            except Exception as e:
                self.log_test("Package Creation With Null Sale Price", False, f"Error parsing: {e}")

        # Test 3: Package Creation With Valid Sale Price (ensure it still works)
        print("\n🔍 Testing Package Creation With Valid Sale Price...")
        
        package_with_valid_sale_price = {
            "name": "Package With Valid Sale Price",
            "description": "Test package created with valid sale_price",
            "sale_price": 999.99
        }
        
        success, response = self.run_test(
            "Create Package With Valid Sale Price",
            "POST",
            "packages",
            200,
            data=package_with_valid_sale_price
        )
        
        if success and response:
            try:
                package_response = response.json()
                package_id = package_response.get('id')
                if package_id:
                    self.created_packages.append(package_id)
                    self.log_test("Package Creation With Valid Sale Price", True, f"Package ID: {package_id}")
                    
                    # Verify sale_price is correct in response
                    sale_price = package_response.get('sale_price')
                    if sale_price == 999.99 or sale_price == "999.99":
                        self.log_test("Valid Sale Price Verification", True, f"sale_price is correctly {sale_price}")
                    else:
                        self.log_test("Valid Sale Price Verification", False, f"Expected 999.99, got: {sale_price}")
                else:
                    self.log_test("Package Creation With Valid Sale Price", False, "No package ID returned")
            except Exception as e:
                self.log_test("Package Creation With Valid Sale Price", False, f"Error parsing: {e}")

        # Test 4: Package Update to Remove Sale Price
        print("\n🔍 Testing Package Update to Remove Sale Price...")
        
        if len(self.created_packages) >= 3:  # Use the package with valid sale price
            package_id_to_update = self.created_packages[2]  # The one with valid sale price
            
            update_data = {
                "name": "Updated Package Without Sale Price",
                "description": "Package updated to remove sale price",
                "sale_price": None
            }
            
            success, response = self.run_test(
                "Update Package to Remove Sale Price",
                "PUT",
                f"packages/{package_id_to_update}",
                200,
                data=update_data
            )
            
            if success and response:
                try:
                    updated_package = response.json()
                    sale_price = updated_package.get('sale_price')
                    if sale_price is None:
                        self.log_test("Package Update Remove Sale Price", True, "sale_price successfully set to None")
                    else:
                        self.log_test("Package Update Remove Sale Price", False, f"Expected None, got: {sale_price}")
                except Exception as e:
                    self.log_test("Package Update Remove Sale Price", False, f"Error parsing: {e}")

        # Test 5: Database Storage Verification
        print("\n🔍 Testing Database Storage and Retrieval...")
        
        success, response = self.run_test(
            "Get All Packages - Verify Storage",
            "GET",
            "packages",
            200
        )
        
        if success and response:
            try:
                packages = response.json()
                if isinstance(packages, list):
                    packages_with_null_sale_price = 0
                    packages_with_valid_sale_price = 0
                    
                    for package in packages:
                        if package.get('name', '').startswith('Package'):  # Our test packages
                            sale_price = package.get('sale_price')
                            if sale_price is None:
                                packages_with_null_sale_price += 1
                            elif isinstance(sale_price, (int, float)) and sale_price > 0:
                                packages_with_valid_sale_price += 1
                    
                    self.log_test("Database Storage Verification", True, 
                                f"Found {packages_with_null_sale_price} packages with null sale_price, "
                                f"{packages_with_valid_sale_price} with valid sale_price")
                else:
                    self.log_test("Database Storage Verification", False, "Response is not a list")
            except Exception as e:
                self.log_test("Database Storage Verification", False, f"Error: {e}")

        # Test 6: Package Display with Products (GET /packages/{id})
        print("\n🔍 Testing Package Display with Products...")
        
        if self.created_packages:
            # Add products to the first package
            package_id_for_products = self.created_packages[0]
            
            # Add products to package
            products_to_add = [
                {"product_id": created_product_ids[0], "quantity": 2},
                {"product_id": created_product_ids[1], "quantity": 1}
            ]
            
            success, response = self.run_test(
                "Add Products to Package",
                "POST",
                f"packages/{package_id_for_products}/products",
                200,
                data=products_to_add
            )
            
            if success:
                # Now get the package with products
                success, response = self.run_test(
                    "Get Package With Products - Null Sale Price",
                    "GET",
                    f"packages/{package_id_for_products}",
                    200
                )
                
                if success and response:
                    try:
                        package_with_products = response.json()
                        
                        # Verify package structure
                        required_fields = ['id', 'name', 'description', 'sale_price', 'created_at', 'products']
                        missing_fields = [field for field in required_fields if field not in package_with_products]
                        
                        if not missing_fields:
                            self.log_test("Package With Products Structure", True, "All required fields present")
                            
                            # Verify sale_price handling
                            sale_price = package_with_products.get('sale_price')
                            if sale_price is None:
                                self.log_test("Package Display Null Sale Price", True, "Null sale_price displayed correctly")
                            else:
                                self.log_test("Package Display Null Sale Price", False, f"Expected None, got: {sale_price}")
                            
                            # Verify products are included
                            products = package_with_products.get('products', [])
                            if len(products) >= 2:
                                self.log_test("Package Products Included", True, f"Found {len(products)} products")
                            else:
                                self.log_test("Package Products Included", False, f"Expected 2+ products, got {len(products)}")
                                
                        else:
                            self.log_test("Package With Products Structure", False, f"Missing fields: {missing_fields}")
                            
                    except Exception as e:
                        self.log_test("Package With Products Display", False, f"Error: {e}")

        print(f"\n✅ Package Sale Price Optional Test Summary:")
        print(f"   - Tested package creation without sale_price field")
        print(f"   - Tested package creation with null sale_price")
        print(f"   - Verified valid sale_price still works")
        print(f"   - Tested package update to remove sale_price")
        print(f"   - Verified database storage and retrieval")
        print(f"   - Tested package display with products")
        
        return True

    def cleanup(self):
        """Clean up created test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created packages
        for package_id in self.created_packages:
            try:
                requests.delete(f"{self.base_url}/packages/{package_id}", timeout=30)
            except:
                pass
        
        # Delete created companies (this will also delete their products)
        for company_id in self.created_companies:
            try:
                requests.delete(f"{self.base_url}/companies/{company_id}", timeout=30)
            except:
                pass
        
        print(f"✅ Cleanup completed - Attempted to delete {len(self.created_packages)} packages and {len(self.created_companies)} companies")

    def run_tests(self):
        """Run all tests"""
        print("🚀 Starting Package Sale Price Optional Testing")
        print("=" * 80)
        
        try:
            self.test_package_sale_price_optional()
        finally:
            self.cleanup()
            
            # Print final results
            print("\n" + "=" * 80)
            print("📊 FINAL TEST RESULTS")
            print("=" * 80)
            print(f"Total Tests Run: {self.tests_run}")
            print(f"Tests Passed: {self.tests_passed}")
            print(f"Tests Failed: {self.tests_run - self.tests_passed}")
            
            if self.tests_run > 0:
                success_rate = (self.tests_passed / self.tests_run) * 100
                print(f"Success Rate: {success_rate:.1f}%")
                
                if success_rate >= 90:
                    print("🎉 EXCELLENT - System is working very well!")
                elif success_rate >= 75:
                    print("✅ GOOD - System is working well with minor issues")
                elif success_rate >= 50:
                    print("⚠️ FAIR - System has some issues that need attention")
                else:
                    print("❌ POOR - System has significant issues requiring immediate attention")
            else:
                print("❌ NO TESTS COMPLETED")
            
            print("=" * 80)

if __name__ == "__main__":
    tester = PackageSalePriceTester()
    tester.run_tests()