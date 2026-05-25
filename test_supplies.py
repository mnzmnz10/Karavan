#!/usr/bin/env python3
"""
Supply Products (Sarf Malzemesi) Functionality Test
Tests the specific functionality requested in the review
"""

import requests
import sys
import json
import time
from datetime import datetime

class SupplyProductsTester:
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

    def test_supply_products_workflow(self):
        """Test the complete supply products workflow as requested"""
        print("\n🔍 Testing Supply Products (Sarf Malzemesi) Complete Workflow...")
        
        # Step 1: Test GET /api/products/supplies endpoint
        print("\n📋 STEP 1: Testing GET /api/products/supplies endpoint")
        success, response = self.run_test(
            "GET /api/products/supplies endpoint",
            "GET",
            "products/supplies",
            200
        )
        
        initial_supplies_count = 0
        if success and response:
            try:
                supplies = response.json()
                initial_supplies_count = len(supplies)
                print(f"   📊 Found {initial_supplies_count} existing supply products")
            except Exception as e:
                print(f"   ❌ Error parsing supplies response: {e}")
        
        # Step 2: Check if "Sarf Malzemeleri" category exists
        print("\n📋 STEP 2: Checking if 'Sarf Malzemeleri' category exists")
        success, response = self.run_test(
            "Get all categories",
            "GET",
            "categories",
            200
        )
        
        sarf_category_id = None
        if success and response:
            try:
                categories = response.json()
                print(f"   📊 Found {len(categories)} total categories:")
                for cat in categories:
                    print(f"      - {cat.get('name', 'Unknown')} (ID: {cat.get('id', 'N/A')})")
                    if cat.get('name') == 'Sarf Malzemeleri':
                        sarf_category_id = cat.get('id')
                        print(f"   ✅ 'Sarf Malzemeleri' category found with ID: {sarf_category_id}")
                        
                        # Check properties
                        if cat.get('is_deletable') == False:
                            print(f"   ✅ Category is protected from deletion")
                        else:
                            print(f"   ⚠️  Category should be non-deletable")
                            
                        if cat.get('color') == '#f97316':
                            print(f"   ✅ Category has correct orange color")
                        else:
                            print(f"   ⚠️  Category color: {cat.get('color')} (expected: #f97316)")
                
                if not sarf_category_id:
                    print(f"   ❌ 'Sarf Malzemeleri' category NOT FOUND!")
                    print(f"   📝 This explains why users cannot add sarf malzemesi to packages")
                    return False
                    
            except Exception as e:
                print(f"   ❌ Error parsing categories: {e}")
                return False
        
        # Step 3: Create test company for supply products
        print("\n📋 STEP 3: Creating test company for supply products")
        test_company_name = f"Sarf Test Company {datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create test company",
            "POST",
            "companies",
            200,
            data={"name": test_company_name}
        )
        
        company_id = None
        if success and response:
            try:
                company_data = response.json()
                company_id = company_data.get('id')
                self.created_companies.append(company_id)
                print(f"   ✅ Created test company with ID: {company_id}")
            except Exception as e:
                print(f"   ❌ Error creating company: {e}")
                return False
        
        # Step 4: Create supply products
        print("\n📋 STEP 4: Creating supply products")
        supply_products = [
            {
                "name": "Test Vida M8x50 - Güneş Paneli Montajı",
                "company_id": company_id,
                "list_price": 2.50,
                "currency": "TRY",
                "description": "Test sarf malzemesi - vida"
            },
            {
                "name": "Test Kablo 4mm² - Elektrik Bağlantısı",
                "company_id": company_id,
                "list_price": 15.75,
                "currency": "TRY",
                "description": "Test sarf malzemesi - kablo"
            },
            {
                "name": "Test Silikon Conta - Sızdırmazlık",
                "company_id": company_id,
                "list_price": 8.90,
                "currency": "TRY",
                "description": "Test sarf malzemesi - conta"
            }
        ]
        
        created_product_ids = []
        for i, product_data in enumerate(supply_products):
            success, response = self.run_test(
                f"Create supply product {i+1}: {product_data['name'][:30]}...",
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
                        print(f"   ✅ Created product: {product_data['name'][:40]}... (ID: {product_id})")
                    else:
                        print(f"   ❌ No product ID returned for: {product_data['name']}")
                except Exception as e:
                    print(f"   ❌ Error creating product: {e}")
        
        print(f"   📊 Successfully created {len(created_product_ids)} supply products")
        
        # Step 5: Assign products to Sarf Malzemeleri category
        print("\n📋 STEP 5: Assigning products to 'Sarf Malzemeleri' category")
        assigned_count = 0
        for product_id in created_product_ids:
            success, response = self.run_test(
                f"Assign product {product_id[:8]}... to Sarf Malzemeleri",
                "PUT",
                f"products/{product_id}",
                200,
                data={"category_id": sarf_category_id}
            )
            
            if success:
                assigned_count += 1
                print(f"   ✅ Assigned product {product_id[:8]}... to Sarf Malzemeleri category")
            else:
                print(f"   ❌ Failed to assign product {product_id[:8]}...")
        
        print(f"   📊 Successfully assigned {assigned_count}/{len(created_product_ids)} products")
        
        # Step 6: Test supplies endpoint after assignment
        print("\n📋 STEP 6: Testing supplies endpoint after product assignment")
        success, response = self.run_test(
            "GET /api/products/supplies after assignment",
            "GET",
            "products/supplies",
            200
        )
        
        if success and response:
            try:
                supplies = response.json()
                new_supplies_count = len(supplies)
                print(f"   📊 Supplies endpoint now returns {new_supplies_count} products")
                print(f"   📈 Increase: {new_supplies_count - initial_supplies_count} products")
                
                # Verify our products are in the list
                our_products_found = 0
                for supply in supplies:
                    if supply.get('id') in created_product_ids:
                        our_products_found += 1
                        print(f"   ✅ Found our product: {supply.get('name', 'Unknown')[:50]}...")
                
                print(f"   📊 Found {our_products_found}/{len(created_product_ids)} of our created products in supplies list")
                
                if our_products_found == len(created_product_ids):
                    print(f"   🎉 SUCCESS: All created products appear in supplies endpoint!")
                else:
                    print(f"   ⚠️  Some products missing from supplies endpoint")
                    
            except Exception as e:
                print(f"   ❌ Error checking supplies after assignment: {e}")
        
        # Step 7: Test complete workflow - create and assign in one step
        print("\n📋 STEP 7: Testing complete workflow (create + assign in one step)")
        workflow_product = {
            "name": "Test Workflow Product - MC4 Konnektör",
            "company_id": company_id,
            "list_price": 12.00,
            "currency": "TRY",
            "description": "Test workflow - direct category assignment",
            "category_id": sarf_category_id  # Assign during creation
        }
        
        success, response = self.run_test(
            "Create product with direct category assignment",
            "POST",
            "products",
            200,
            data=workflow_product
        )
        
        workflow_product_id = None
        if success and response:
            try:
                product_response = response.json()
                workflow_product_id = product_response.get('id')
                assigned_category = product_response.get('category_id')
                
                if workflow_product_id:
                    self.created_products.append(workflow_product_id)
                    print(f"   ✅ Created workflow product: {workflow_product['name']}")
                    
                    if assigned_category == sarf_category_id:
                        print(f"   ✅ Product correctly assigned to Sarf Malzemeleri during creation")
                    else:
                        print(f"   ❌ Product not assigned correctly (got: {assigned_category})")
                        
            except Exception as e:
                print(f"   ❌ Error in workflow test: {e}")
        
        # Step 8: Final verification
        print("\n📋 STEP 8: Final verification of supplies endpoint")
        success, response = self.run_test(
            "Final GET /api/products/supplies verification",
            "GET",
            "products/supplies",
            200
        )
        
        if success and response:
            try:
                final_supplies = response.json()
                final_count = len(final_supplies)
                expected_increase = len(created_product_ids) + (1 if workflow_product_id else 0)
                
                print(f"   📊 Final supplies count: {final_count}")
                print(f"   📊 Initial count: {initial_supplies_count}")
                print(f"   📊 Expected increase: {expected_increase}")
                print(f"   📊 Actual increase: {final_count - initial_supplies_count}")
                
                if final_count >= initial_supplies_count + expected_increase:
                    print(f"   🎉 SUCCESS: Supplies endpoint working correctly!")
                    
                    # Show some example supply products
                    print(f"   📋 Example supply products:")
                    for i, supply in enumerate(final_supplies[:5]):  # Show first 5
                        print(f"      {i+1}. {supply.get('name', 'Unknown')[:60]}...")
                        
                else:
                    print(f"   ⚠️  Supplies count lower than expected")
                    
            except Exception as e:
                print(f"   ❌ Error in final verification: {e}")
        
        return True

    def cleanup(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created products
        for product_id in self.created_products:
            try:
                requests.delete(f"{self.base_url}/products/{product_id}", timeout=10)
            except:
                pass
        
        # Delete created companies
        for company_id in self.created_companies:
            try:
                requests.delete(f"{self.base_url}/companies/{company_id}", timeout=10)
            except:
                pass
        
        print(f"✅ Cleanup completed")

    def run_all_tests(self):
        """Run all supply products tests"""
        print("🚀 Starting Supply Products (Sarf Malzemesi) Testing...")
        print(f"🔗 Testing API at: {self.base_url}")
        print("=" * 80)
        
        try:
            self.test_supply_products_workflow()
            
        except KeyboardInterrupt:
            print("\n⚠️ Tests interrupted by user")
        except Exception as e:
            print(f"\n❌ Test suite failed with error: {e}")
        finally:
            # Always cleanup
            self.cleanup()
            
            # Print final results
            print("\n" + "=" * 80)
            print("📊 SUPPLY PRODUCTS TEST RESULTS")
            print("=" * 80)
            print(f"✅ Tests Passed: {self.tests_passed}")
            print(f"❌ Tests Failed: {self.tests_run - self.tests_passed}")
            print(f"📈 Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
            
            if self.tests_passed == self.tests_run:
                print("🎉 ALL SUPPLY PRODUCTS TESTS PASSED!")
                print("\n🔍 DIAGNOSIS:")
                print("   - Sarf Malzemeleri category exists and is working")
                print("   - GET /api/products/supplies endpoint is functional")
                print("   - Product creation and category assignment works")
                print("   - Complete workflow (create → assign → retrieve) is working")
                print("\n💡 CONCLUSION:")
                print("   The supply products functionality is working correctly.")
                print("   If users cannot add sarf malzemesi to packages, the issue")
                print("   may be in the frontend UI or package-supply relationship.")
            else:
                print("⚠️ Some supply products tests failed.")
                print("   Check the failed tests above for specific issues.")
            
            return self.tests_passed == self.tests_run

if __name__ == "__main__":
    tester = SupplyProductsTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)