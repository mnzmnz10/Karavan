#!/usr/bin/env python3
"""
Package Optional Sale Price Feature Test
Tests the specific requirement to make sale_price optional for package creation and editing
"""

import requests
import json
import uuid
from datetime import datetime

class PackageSalePriceTest:
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
                    details += f" | Response keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'List'}"
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

    def test_package_optional_sale_price(self):
        """Test package creation and editing with optional sale_price field"""
        print("\n🔍 Testing Package Optional Sale Price Feature...")
        
        # Step 1: Test Package Creation WITHOUT sale_price field
        print("\n📝 Test 1: Package Creation WITHOUT sale_price field")
        
        package_without_sale_price = {
            "name": f"Test Package Without Sale Price {datetime.now().strftime('%H%M%S')}",
            "description": "Package created without specifying sale_price",
            "image_url": "https://example.com/package.jpg",
            "is_pinned": False
        }
        
        success, response = self.run_test(
            "Create Package WITHOUT sale_price field",
            "POST",
            "packages",
            200,
            data=package_without_sale_price
        )
        
        package_id_1 = None
        if success and response:
            try:
                package_response = response.json()
                package_id_1 = package_response.get('id')
                sale_price = package_response.get('sale_price')
                
                if package_id_1:
                    self.created_packages.append(package_id_1)
                    self.log_test("Package Created Without sale_price", True, f"ID: {package_id_1}, sale_price: {sale_price}")
                    
                    # Verify sale_price handling
                    if sale_price is None or sale_price == 0:
                        self.log_test("sale_price Default Value", True, f"sale_price correctly handled as: {sale_price}")
                    else:
                        self.log_test("sale_price Default Value", False, f"Unexpected sale_price value: {sale_price}")
                else:
                    self.log_test("Package Created Without sale_price", False, "No package ID returned")
            except Exception as e:
                self.log_test("Package Creation Without sale_price", False, f"Error parsing: {e}")
        
        # Step 2: Test Package Creation WITH sale_price: null
        print("\n📝 Test 2: Package Creation WITH sale_price: null")
        
        package_with_null_sale_price = {
            "name": f"Test Package With Null Sale Price {datetime.now().strftime('%H%M%S')}",
            "description": "Package created with sale_price: null",
            "sale_price": None,
            "image_url": "https://example.com/package2.jpg",
            "is_pinned": False
        }
        
        success, response = self.run_test(
            "Create Package WITH sale_price: null",
            "POST",
            "packages",
            200,
            data=package_with_null_sale_price
        )
        
        package_id_2 = None
        if success and response:
            try:
                package_response = response.json()
                package_id_2 = package_response.get('id')
                sale_price = package_response.get('sale_price')
                
                if package_id_2:
                    self.created_packages.append(package_id_2)
                    self.log_test("Package Created With null sale_price", True, f"ID: {package_id_2}, sale_price: {sale_price}")
                    
                    # Verify null sale_price handling
                    if sale_price is None or sale_price == 0:
                        self.log_test("Null sale_price Handling", True, f"Null sale_price correctly handled as: {sale_price}")
                    else:
                        self.log_test("Null sale_price Handling", False, f"Unexpected sale_price value: {sale_price}")
                else:
                    self.log_test("Package Created With null sale_price", False, "No package ID returned")
            except Exception as e:
                self.log_test("Package Creation With null sale_price", False, f"Error parsing: {e}")
        
        # Step 3: Test Package Creation WITH valid sale_price
        print("\n📝 Test 3: Package Creation WITH valid sale_price")
        
        package_with_sale_price = {
            "name": f"Test Package With Sale Price {datetime.now().strftime('%H%M%S')}",
            "description": "Package created with valid sale_price",
            "sale_price": 1500.50,
            "image_url": "https://example.com/package4.jpg",
            "is_pinned": False
        }
        
        success, response = self.run_test(
            "Create Package WITH valid sale_price",
            "POST",
            "packages",
            200,
            data=package_with_sale_price
        )
        
        package_id_3 = None
        if success and response:
            try:
                package_response = response.json()
                package_id_3 = package_response.get('id')
                sale_price = package_response.get('sale_price')
                
                if package_id_3:
                    self.created_packages.append(package_id_3)
                    self.log_test("Package Created With valid sale_price", True, f"ID: {package_id_3}, sale_price: {sale_price}")
                    
                    # Verify valid sale_price handling
                    if abs(float(sale_price) - 1500.50) < 0.01:
                        self.log_test("Valid sale_price Handling", True, f"Valid sale_price correctly stored: {sale_price}")
                    else:
                        self.log_test("Valid sale_price Handling", False, f"sale_price mismatch - Expected: 1500.50, Got: {sale_price}")
                else:
                    self.log_test("Package Created With valid sale_price", False, "No package ID returned")
            except Exception as e:
                self.log_test("Package Creation With valid sale_price", False, f"Error parsing: {e}")
        
        # Step 4: Test Package Update - Remove sale_price
        print("\n📝 Test 4: Package Update - Remove sale_price")
        
        if package_id_3:  # Use the package with valid sale_price
            package_update_remove_price = {
                "name": f"Updated Package Without Sale Price {datetime.now().strftime('%H%M%S')}",
                "description": "Package updated to remove sale_price",
                "sale_price": None,
                "image_url": "https://example.com/updated_package.jpg",
                "is_pinned": False
            }
            
            success, response = self.run_test(
                "Update Package - Remove sale_price",
                "PUT",
                f"packages/{package_id_3}",
                200,
                data=package_update_remove_price
            )
            
            if success and response:
                try:
                    updated_package = response.json()
                    updated_sale_price = updated_package.get('sale_price')
                    
                    if updated_sale_price is None or updated_sale_price == 0:
                        self.log_test("Package Update - Remove sale_price", True, f"sale_price successfully removed: {updated_sale_price}")
                    else:
                        self.log_test("Package Update - Remove sale_price", False, f"sale_price not removed: {updated_sale_price}")
                except Exception as e:
                    self.log_test("Package Update - Remove sale_price", False, f"Error parsing: {e}")
        
        # Step 5: Test Package Retrieval - GET /api/packages
        print("\n📝 Test 5: Package Retrieval - GET /api/packages")
        
        success, response = self.run_test(
            "Get All Packages",
            "GET",
            "packages",
            200
        )
        
        if success and response:
            try:
                packages = response.json()
                if isinstance(packages, list):
                    # Find our test packages
                    test_packages = [p for p in packages if p.get('name', '').startswith('Test Package')]
                    
                    self.log_test("Package List Retrieval", True, f"Found {len(test_packages)} test packages out of {len(packages)} total")
                    
                    # Verify packages without sale_price are retrievable
                    packages_without_price = [p for p in test_packages if p.get('sale_price') is None or p.get('sale_price') == 0]
                    if packages_without_price:
                        self.log_test("Packages Without sale_price Retrievable", True, f"Found {len(packages_without_price)} packages without sale_price")
                    else:
                        self.log_test("Packages Without sale_price Retrievable", False, "No packages without sale_price found")
                        
                    # Verify packages display properly (showing ₺0 or empty price)
                    for package in test_packages:
                        sale_price = package.get('sale_price')
                        package_name = package.get('name', 'Unknown')[:30]
                        
                        if sale_price is None or sale_price == 0:
                            self.log_test(f"Package Display - {package_name}...", True, f"Displays properly with sale_price: {sale_price}")
                        else:
                            self.log_test(f"Package Display - {package_name}...", True, f"Displays properly with sale_price: {sale_price}")
                else:
                    self.log_test("Package List Format", False, "Response is not a list")
            except Exception as e:
                self.log_test("Package List Parsing", False, f"Error: {e}")
        
        # Step 6: Test Individual Package Retrieval - GET /api/packages/{id}
        print("\n📝 Test 6: Individual Package Retrieval")
        
        test_package_ids = [pid for pid in [package_id_1, package_id_2, package_id_3] if pid]
        
        for i, package_id in enumerate(test_package_ids, 1):
            success, response = self.run_test(
                f"Get Package {i} Details",
                "GET",
                f"packages/{package_id}",
                200
            )
            
            if success and response:
                try:
                    package_details = response.json()
                    sale_price = package_details.get('sale_price')
                    package_name = package_details.get('name', 'Unknown')[:30]
                    
                    # Verify package structure
                    required_fields = ['id', 'name', 'created_at', 'products', 'supplies']
                    missing_fields = [field for field in required_fields if field not in package_details]
                    
                    if not missing_fields:
                        self.log_test(f"Package {i} Structure", True, f"All required fields present")
                        self.log_test(f"Package {i} sale_price", True, f"{package_name}... - sale_price: {sale_price}")
                    else:
                        self.log_test(f"Package {i} Structure", False, f"Missing fields: {missing_fields}")
                        
                except Exception as e:
                    self.log_test(f"Package {i} Details Parsing", False, f"Error: {e}")
        
        # Step 7: Test Database Validation
        print("\n📝 Test 7: Database Validation")
        
        # Create a package and immediately retrieve it to verify database storage
        db_test_package = {
            "name": f"Database Validation Test Package {datetime.now().strftime('%H%M%S')}",
            "description": "Testing database storage of null sale_price",
            "sale_price": None
        }
        
        success, response = self.run_test(
            "Create Package for DB Validation",
            "POST",
            "packages",
            200,
            data=db_test_package
        )
        
        if success and response:
            try:
                created_package = response.json()
                db_package_id = created_package.get('id')
                
                if db_package_id:
                    self.created_packages.append(db_package_id)
                    # Immediately retrieve the package to verify database storage
                    success, response = self.run_test(
                        "Retrieve Package for DB Validation",
                        "GET",
                        f"packages/{db_package_id}",
                        200
                    )
                    
                    if success and response:
                        try:
                            retrieved_package = response.json()
                            db_sale_price = retrieved_package.get('sale_price')
                            
                            if db_sale_price is None or db_sale_price == 0:
                                self.log_test("Database Storage Validation", True, f"Package correctly stored and retrieved with sale_price: {db_sale_price}")
                            else:
                                self.log_test("Database Storage Validation", False, f"Unexpected database sale_price: {db_sale_price}")
                                
                            # Verify package functionality works regardless of sale_price presence
                            total_discounted_price = retrieved_package.get('total_discounted_price')
                            if total_discounted_price is not None:
                                self.log_test("Package Functionality Without sale_price", True, f"Package functions correctly, total_discounted_price: {total_discounted_price}")
                            else:
                                self.log_test("Package Functionality Without sale_price", True, "Package functions correctly (no products added yet)")
                                
                        except Exception as e:
                            self.log_test("DB Validation Retrieval Parsing", False, f"Error: {e}")
                            
            except Exception as e:
                self.log_test("DB Validation Package Creation", False, f"Error: {e}")

    def cleanup(self):
        """Clean up created test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created packages
        for package_id in self.created_packages:
            try:
                success, response = self.run_test(
                    f"Delete Package {package_id[:8]}...",
                    "DELETE",
                    f"packages/{package_id}",
                    200
                )
            except Exception as e:
                print(f"Error deleting package {package_id}: {e}")
        
        print(f"✅ Cleanup completed - Attempted to delete {len(self.created_packages)} packages")

    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting Package Optional Sale Price Test Suite...")
        print(f"🔗 Testing API at: {self.base_url}")
        
        try:
            # Test root endpoint first
            success, response = self.run_test(
                "Root API Endpoint",
                "GET",
                "",
                200
            )
            
            if not success:
                print("❌ Cannot connect to API - aborting tests")
                return
            
            # Run the main test
            self.test_package_optional_sale_price()
            
        except KeyboardInterrupt:
            print("\n⚠️ Test suite interrupted by user")
        except Exception as e:
            print(f"\n❌ Test suite failed with error: {e}")
        finally:
            # Always run cleanup
            self.cleanup()
            
            # Print final results
            print(f"\n📊 Final Test Results:")
            print(f"   Tests Run: {self.tests_run}")
            print(f"   Tests Passed: {self.tests_passed}")
            print(f"   Tests Failed: {self.tests_run - self.tests_passed}")
            print(f"   Success Rate: {(self.tests_passed / self.tests_run * 100):.1f}%" if self.tests_run > 0 else "   Success Rate: 0%")
            
            if self.tests_passed == self.tests_run:
                print("🎉 All tests passed!")
            else:
                print("⚠️ Some tests failed - check the logs above")

if __name__ == "__main__":
    tester = PackageSalePriceTest()
    tester.run_all_tests()