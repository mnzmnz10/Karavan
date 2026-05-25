#!/usr/bin/env python3
"""
Package Copy Functionality Test Script
Focused testing for the comprehensive package copy system
"""

import requests
import sys
import json
import time
import uuid
from datetime import datetime

class PackageCopyTester:
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
                elif 'copy' in endpoint:
                    # Use form data for copy endpoint
                    response = requests.post(url, data=data, timeout=30)
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

    def test_package_copy_comprehensive(self):
        """Comprehensive test for package copy system"""
        print("\n🔍 COMPREHENSIVE PACKAGE COPY FUNCTIONALITY TESTING")
        print("=" * 80)
        
        # Step 1: Create a test company for package testing
        test_company_name = f"Package Copy Test Company {datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create Package Copy Test Company",
            "POST",
            "companies",
            200,
            data={"name": test_company_name}
        )
        
        if not success or not response:
            self.log_test("Package Copy Test Setup", False, "Failed to create test company")
            return False
            
        try:
            company_data = response.json()
            test_company_id = company_data.get('id')
            if not test_company_id:
                self.log_test("Package Copy Test Setup", False, "No company ID returned")
                return False
            self.created_companies.append(test_company_id)
        except Exception as e:
            self.log_test("Package Copy Test Setup", False, f"Error parsing company response: {e}")
            return False

        # Step 2: Create test products for the package
        test_products = [
            {
                "name": "Solar Panel 450W - Package Test",
                "company_id": test_company_id,
                "list_price": 299.99,
                "discounted_price": 249.99,
                "currency": "USD",
                "description": "High efficiency solar panel for package testing"
            },
            {
                "name": "Inverter 5000W - Package Test", 
                "company_id": test_company_id,
                "list_price": 750.50,
                "discounted_price": 699.00,
                "currency": "EUR",
                "description": "Hybrid solar inverter for package testing"
            },
            {
                "name": "Battery 200Ah - Package Test",
                "company_id": test_company_id,
                "list_price": 8750.00,
                "discounted_price": 8250.00,
                "currency": "TRY",
                "description": "Deep cycle battery for package testing"
            }
        ]
        
        created_product_ids = []
        
        print("\n🔍 Creating Test Products...")
        for product_data in test_products:
            success, response = self.run_test(
                f"Create Package Test Product: {product_data['name'][:30]}...",
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
                        self.log_test(f"Package Test Product Created - {product_data['name'][:20]}...", True, f"ID: {product_id}")
                    else:
                        self.log_test(f"Package Test Product Creation - {product_data['name'][:20]}...", False, "No product ID returned")
                except Exception as e:
                    self.log_test(f"Package Test Product Creation - {product_data['name'][:20]}...", False, f"Error parsing: {e}")

        if len(created_product_ids) < 3:
            self.log_test("Package Copy Test Products", False, f"Only {len(created_product_ids)} products created, need at least 3")
            return False

        # Step 3: Create supplies products (from Sarf Malzemeleri category)
        supplies_products = [
            {
                "name": "Kablo Bağlantı Malzemesi",
                "company_id": test_company_id,
                "list_price": 25.50,
                "currency": "TRY",
                "description": "Kablo bağlantı malzemesi",
                "category_id": "sarf-malzemeleri-category"
            },
            {
                "name": "Vida ve Somun Seti",
                "company_id": test_company_id,
                "list_price": 15.75,
                "currency": "TRY",
                "description": "Montaj için vida ve somun seti",
                "category_id": "sarf-malzemeleri-category"
            }
        ]
        
        created_supply_ids = []
        
        print("\n🔍 Creating Test Supplies...")
        for supply_data in supplies_products:
            success, response = self.run_test(
                f"Create Package Test Supply: {supply_data['name'][:30]}...",
                "POST",
                "products",
                200,
                data=supply_data
            )
            
            if success and response:
                try:
                    supply_response = response.json()
                    supply_id = supply_response.get('id')
                    if supply_id:
                        created_supply_ids.append(supply_id)
                        self.created_products.append(supply_id)
                        self.log_test(f"Package Test Supply Created - {supply_data['name'][:20]}...", True, f"ID: {supply_id}")
                    else:
                        self.log_test(f"Package Test Supply Creation - {supply_data['name'][:20]}...", False, "No supply ID returned")
                except Exception as e:
                    self.log_test(f"Package Test Supply Creation - {supply_data['name'][:20]}...", False, f"Error parsing: {e}")

        # Step 4: Create original package (FAMILY4100 equivalent)
        print("\n🔍 Creating Original Package (FAMILY4100)...")
        original_package_data = {
            "name": "FAMILY4100",
            "description": "Complete solar energy system package for family use",
            "sale_price": 15000.00,
            "image_url": "https://example.com/family4100.jpg"
        }
        
        success, response = self.run_test(
            "Create Original Package (FAMILY4100)",
            "POST",
            "packages",
            200,
            data=original_package_data
        )
        
        original_package_id = None
        if success and response:
            try:
                package_response = response.json()
                original_package_id = package_response.get('id')
                if original_package_id:
                    self.created_packages.append(original_package_id)
                    self.log_test("Original Package Created", True, f"FAMILY4100 ID: {original_package_id}")
                else:
                    self.log_test("Original Package Creation", False, "No package ID returned")
                    return False
            except Exception as e:
                self.log_test("Original Package Creation", False, f"Error parsing: {e}")
                return False
        else:
            return False

        # Step 5: Add products to the original package
        print("\n🔍 Adding Products to Original Package...")
        package_products_data = [
            {"product_id": created_product_ids[0], "quantity": 2},
            {"product_id": created_product_ids[1], "quantity": 1},
            {"product_id": created_product_ids[2], "quantity": 1}
        ]
        
        success, response = self.run_test(
            "Add Products to Original Package",
            "POST",
            f"packages/{original_package_id}/products",
            200,
            data=package_products_data
        )
        
        if success and response:
            try:
                add_products_response = response.json()
                if add_products_response.get('success'):
                    self.log_test("Package Products Added", True, f"Added {len(package_products_data)} products to package")
                else:
                    self.log_test("Package Products Added", False, "Failed to add products to package")
            except Exception as e:
                self.log_test("Package Products Addition", False, f"Error parsing: {e}")

        # Step 6: Add supplies to the original package
        if created_supply_ids:
            print("\n🔍 Adding Supplies to Original Package...")
            package_supplies_data = [
                {"product_id": created_supply_ids[0], "quantity": 5},
                {"product_id": created_supply_ids[1], "quantity": 3}
            ]
            
            success, response = self.run_test(
                "Add Supplies to Original Package",
                "POST",
                f"packages/{original_package_id}/supplies",
                200,
                data=package_supplies_data
            )
            
            if success and response:
                try:
                    add_supplies_response = response.json()
                    if add_supplies_response.get('success'):
                        self.log_test("Package Supplies Added", True, f"Added {len(package_supplies_data)} supplies to package")
                    else:
                        self.log_test("Package Supplies Added", False, "Failed to add supplies to package")
                except Exception as e:
                    self.log_test("Package Supplies Addition", False, f"Error parsing: {e}")

        # Step 7: Test Package Copy Endpoint - Valid Copy
        print("\n🔍 TESTING PACKAGE COPY ENDPOINT")
        print("-" * 50)
        
        copy_data = {"new_name": "FAMILY4100_COPY_TEST"}
        
        success, response = self.run_test(
            "Copy Package - Valid Request",
            "POST",
            f"packages/{original_package_id}/copy",
            200,
            data=copy_data
        )
        
        copied_package_id = None
        if success and response:
            try:
                copy_response = response.json()
                if copy_response.get('success'):
                    copied_package_id = copy_response.get('new_package_id')
                    original_name = copy_response.get('original_package_name')
                    new_name = copy_response.get('new_package_name')
                    copied_products = copy_response.get('copied_products', 0)
                    copied_supplies = copy_response.get('copied_supplies', 0)
                    
                    if copied_package_id:
                        self.created_packages.append(copied_package_id)
                    
                    self.log_test("Package Copy Success", True, f"Copied '{original_name}' to '{new_name}'")
                    self.log_test("Package Copy Statistics", True, f"Products: {copied_products}, Supplies: {copied_supplies}")
                    
                    if copied_package_id:
                        self.log_test("New Package ID Generated", True, f"New ID: {copied_package_id}")
                    else:
                        self.log_test("New Package ID Generated", False, "No new package ID returned")
                        
                else:
                    self.log_test("Package Copy Success", False, "Copy operation failed")
            except Exception as e:
                self.log_test("Package Copy Response", False, f"Error parsing: {e}")

        # Step 8: Verify copied package data integrity
        if copied_package_id:
            print("\n🔍 TESTING PACKAGE COPY DATA INTEGRITY")
            print("-" * 50)
            
            success, response = self.run_test(
                "Get Copied Package Details",
                "GET",
                f"packages/{copied_package_id}",
                200
            )
            
            if success and response:
                try:
                    copied_package = response.json()
                    
                    # Verify package metadata
                    if copied_package.get('name') == "FAMILY4100_COPY_TEST":
                        self.log_test("Copied Package Name", True, f"Name: {copied_package.get('name')}")
                    else:
                        self.log_test("Copied Package Name", False, f"Expected: FAMILY4100_COPY_TEST, Got: {copied_package.get('name')}")
                    
                    if copied_package.get('description') == original_package_data['description']:
                        self.log_test("Copied Package Description", True, "Description preserved")
                    else:
                        self.log_test("Copied Package Description", False, "Description not preserved")
                    
                    if float(copied_package.get('sale_price', 0)) == original_package_data['sale_price']:
                        self.log_test("Copied Package Sale Price", True, f"Sale price: {copied_package.get('sale_price')}")
                    else:
                        self.log_test("Copied Package Sale Price", False, f"Expected: {original_package_data['sale_price']}, Got: {copied_package.get('sale_price')}")
                    
                    if copied_package.get('image_url') == original_package_data['image_url']:
                        self.log_test("Copied Package Image URL", True, "Image URL preserved")
                    else:
                        self.log_test("Copied Package Image URL", False, "Image URL not preserved")
                    
                    # Verify unique ID
                    if copied_package.get('id') != original_package_id:
                        self.log_test("Unique Package ID", True, f"New ID: {copied_package.get('id')}")
                    else:
                        self.log_test("Unique Package ID", False, "Package ID not unique")
                    
                    # Verify products were copied
                    copied_products = copied_package.get('products', [])
                    if len(copied_products) == len(package_products_data):
                        self.log_test("Copied Products Count", True, f"Products: {len(copied_products)}")
                        
                        # Verify product quantities are preserved
                        quantities_preserved = True
                        for i, product in enumerate(copied_products):
                            expected_quantity = package_products_data[i]['quantity']
                            actual_quantity = product.get('quantity', 0)
                            if actual_quantity != expected_quantity:
                                quantities_preserved = False
                                self.log_test(f"Product {i+1} Quantity", False, f"Expected: {expected_quantity}, Got: {actual_quantity}")
                            else:
                                self.log_test(f"Product {i+1} Quantity", True, f"Quantity: {actual_quantity}")
                        
                        if quantities_preserved:
                            self.log_test("All Product Quantities Preserved", True, "All quantities match original")
                        
                        # Verify product IDs are preserved but package_id is updated
                        package_refs_correct = True
                        for product in copied_products:
                            if product.get('package_id') != copied_package_id:
                                package_refs_correct = False
                                break
                        
                        if package_refs_correct:
                            self.log_test("Product Package ID References", True, "All package IDs correctly updated")
                        else:
                            self.log_test("Product Package ID References", False, "Some package IDs not updated correctly")
                            
                    else:
                        self.log_test("Copied Products Count", False, f"Expected: {len(package_products_data)}, Got: {len(copied_products)}")
                    
                    # Verify supplies were copied
                    copied_supplies = copied_package.get('supplies', [])
                    if len(created_supply_ids) > 0:
                        if len(copied_supplies) == len(package_supplies_data):
                            self.log_test("Copied Supplies Count", True, f"Supplies: {len(copied_supplies)}")
                            
                            # Verify supply quantities are preserved
                            supply_quantities_preserved = True
                            for i, supply in enumerate(copied_supplies):
                                expected_quantity = package_supplies_data[i]['quantity']
                                actual_quantity = supply.get('quantity', 0)
                                if actual_quantity != expected_quantity:
                                    supply_quantities_preserved = False
                                    self.log_test(f"Supply {i+1} Quantity", False, f"Expected: {expected_quantity}, Got: {actual_quantity}")
                                else:
                                    self.log_test(f"Supply {i+1} Quantity", True, f"Quantity: {actual_quantity}")
                            
                            if supply_quantities_preserved:
                                self.log_test("All Supply Quantities Preserved", True, "All supply quantities match original")
                        else:
                            self.log_test("Copied Supplies Count", False, f"Expected: {len(package_supplies_data)}, Got: {len(copied_supplies)}")
                    
                except Exception as e:
                    self.log_test("Copied Package Data Verification", False, f"Error parsing: {e}")

        # Step 9: Test Copy Validation - Duplicate Name
        print("\n🔍 TESTING PACKAGE COPY VALIDATION")
        print("-" * 50)
        
        duplicate_copy_data = {"new_name": "FAMILY4100_COPY_TEST"}  # Same name as before
        
        success, response = self.run_test(
            "Copy Package - Duplicate Name (Should Fail)",
            "POST",
            f"packages/{original_package_id}/copy",
            400,  # Should return 400 error
            data=duplicate_copy_data
        )
        
        if success and response:
            try:
                error_response = response.json()
                if "Bu isimde bir paket zaten mevcut" in error_response.get('detail', ''):
                    self.log_test("Duplicate Name Rejection", True, "Correctly rejected duplicate name")
                else:
                    self.log_test("Duplicate Name Rejection", False, f"Unexpected error message: {error_response.get('detail')}")
            except Exception as e:
                self.log_test("Duplicate Name Error Response", False, f"Error parsing: {e}")

        # Step 10: Test Copy Validation - Non-existent Package
        fake_package_id = str(uuid.uuid4())
        fake_copy_data = {"new_name": "FAKE_PACKAGE_COPY"}
        
        success, response = self.run_test(
            "Copy Non-existent Package (Should Fail)",
            "POST",
            f"packages/{fake_package_id}/copy",
            404,  # Should return 404 error
            data=fake_copy_data
        )
        
        if success and response:
            try:
                error_response = response.json()
                if "Package not found" in error_response.get('detail', ''):
                    self.log_test("Non-existent Package Rejection", True, "Correctly rejected non-existent package")
                else:
                    self.log_test("Non-existent Package Rejection", False, f"Unexpected error message: {error_response.get('detail')}")
            except Exception as e:
                self.log_test("Non-existent Package Error Response", False, f"Error parsing: {e}")

        # Step 11: Test Copy Validation - Empty Name
        empty_name_data = {"new_name": ""}
        
        success, response = self.run_test(
            "Copy Package - Empty Name (Should Fail)",
            "POST",
            f"packages/{original_package_id}/copy",
            422,  # Should return validation error
            data=empty_name_data
        )
        
        if success:
            self.log_test("Empty Name Rejection", True, "Correctly rejected empty name")
        else:
            # Check if it returned 400 instead of 422
            if response and response.status_code == 400:
                self.log_test("Empty Name Rejection", True, "Correctly rejected empty name (400 status)")
            else:
                self.log_test("Empty Name Rejection", False, f"Expected 422/400, got {response.status_code if response else 'no response'}")

        # Step 12: Verify Original Package Unchanged
        print("\n🔍 TESTING ORIGINAL PACKAGE INTEGRITY")
        print("-" * 50)
        
        success, response = self.run_test(
            "Get Original Package After Copy",
            "GET",
            f"packages/{original_package_id}",
            200
        )
        
        if success and response:
            try:
                original_after_copy = response.json()
                
                # Verify original package data unchanged
                if original_after_copy.get('name') == "FAMILY4100":
                    self.log_test("Original Package Name Unchanged", True, "Name preserved")
                else:
                    self.log_test("Original Package Name Unchanged", False, f"Name changed to: {original_after_copy.get('name')}")
                
                if original_after_copy.get('description') == original_package_data['description']:
                    self.log_test("Original Package Description Unchanged", True, "Description preserved")
                else:
                    self.log_test("Original Package Description Unchanged", False, "Description changed")
                
                # Verify original products unchanged
                original_products_after = original_after_copy.get('products', [])
                if len(original_products_after) == len(package_products_data):
                    self.log_test("Original Package Products Unchanged", True, f"Products count: {len(original_products_after)}")
                else:
                    self.log_test("Original Package Products Unchanged", False, f"Products count changed")
                
                # Verify original supplies unchanged
                original_supplies_after = original_after_copy.get('supplies', [])
                expected_supplies_count = len(package_supplies_data) if created_supply_ids else 0
                if len(original_supplies_after) == expected_supplies_count:
                    self.log_test("Original Package Supplies Unchanged", True, f"Supplies count: {len(original_supplies_after)}")
                else:
                    self.log_test("Original Package Supplies Unchanged", False, f"Supplies count changed")
                
            except Exception as e:
                self.log_test("Original Package Integrity Check", False, f"Error parsing: {e}")

        # Step 13: Test Database Referential Integrity
        print("\n🔍 TESTING DATABASE REFERENTIAL INTEGRITY")
        print("-" * 50)
        
        if copied_package_id:
            # Check that copied products have correct package_id references
            success, response = self.run_test(
                "Verify Copied Products Package References",
                "GET",
                f"packages/{copied_package_id}",
                200
            )
            
            if success and response:
                try:
                    copied_package_details = response.json()
                    copied_products = copied_package_details.get('products', [])
                    
                    all_references_correct = True
                    for product in copied_products:
                        if product.get('package_id') != copied_package_id:
                            all_references_correct = False
                            break
                    
                    if all_references_correct and len(copied_products) > 0:
                        self.log_test("Database Referential Integrity - Products", True, "All product references correct")
                    else:
                        self.log_test("Database Referential Integrity - Products", False, "Some product references incorrect")
                    
                    # Check supplies references
                    copied_supplies = copied_package_details.get('supplies', [])
                    all_supply_references_correct = True
                    for supply in copied_supplies:
                        if supply.get('package_id') != copied_package_id:
                            all_supply_references_correct = False
                            break
                    
                    if all_supply_references_correct:
                        self.log_test("Database Referential Integrity - Supplies", True, "All supply references correct")
                    else:
                        self.log_test("Database Referential Integrity - Supplies", False, "Some supply references incorrect")
                        
                except Exception as e:
                    self.log_test("Database Referential Integrity Check", False, f"Error parsing: {e}")

        return True

    def cleanup_test_data(self):
        """Clean up test data created during testing"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created packages
        for package_id in self.created_packages:
            try:
                success, response = self.run_test(
                    f"Delete Test Package {package_id[:8]}...",
                    "DELETE",
                    f"packages/{package_id}",
                    200
                )
            except Exception as e:
                print(f"   Warning: Could not delete package {package_id}: {e}")
        
        # Delete created products
        for product_id in self.created_products:
            try:
                success, response = self.run_test(
                    f"Delete Test Product {product_id[:8]}...",
                    "DELETE",
                    f"products/{product_id}",
                    200
                )
            except Exception as e:
                print(f"   Warning: Could not delete product {product_id}: {e}")
        
        # Delete created companies
        for company_id in self.created_companies:
            try:
                success, response = self.run_test(
                    f"Delete Test Company {company_id[:8]}...",
                    "DELETE",
                    f"companies/{company_id}",
                    200
                )
            except Exception as e:
                print(f"   Warning: Could not delete company {company_id}: {e}")
        
        print(f"   Attempted to clean up {len(self.created_packages)} packages, {len(self.created_products)} products and {len(self.created_companies)} companies")

    def run_tests(self):
        """Run package copy tests"""
        print("🚀 Starting Package Copy Functionality Tests")
        print(f"🔗 Testing API at: {self.base_url}")
        print("=" * 80)
        
        try:
            # Run comprehensive package copy tests
            self.test_package_copy_comprehensive()
            
        except KeyboardInterrupt:
            print("\n⚠️ Tests interrupted by user")
        except Exception as e:
            print(f"\n❌ Unexpected error during testing: {e}")
        finally:
            # Always try to clean up
            self.cleanup_test_data()
            
            # Print final results
            print("\n" + "=" * 80)
            print("📊 PACKAGE COPY TEST RESULTS")
            print("=" * 80)
            print(f"✅ Tests Passed: {self.tests_passed}")
            print(f"❌ Tests Failed: {self.tests_run - self.tests_passed}")
            print(f"📈 Success Rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
            
            if self.tests_passed == self.tests_run:
                print("🎉 ALL PACKAGE COPY TESTS PASSED!")
                return True
            else:
                print("⚠️ Some tests failed. Check the output above for details.")
                return False

if __name__ == "__main__":
    tester = PackageCopyTester()
    success = tester.run_tests()
    sys.exit(0 if success else 1)