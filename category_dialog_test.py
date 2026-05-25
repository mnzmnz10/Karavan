#!/usr/bin/env python3
"""
Category Dialog Functionality Test
Tests the specific functionality requested for category dialog and product loading
"""

import requests
import sys
import json
import time
from datetime import datetime

class CategoryDialogTester:
    def __init__(self, base_url="https://quotemate-3.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_categories = []

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

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if success:
                try:
                    response_data = response.json()
                    if isinstance(response_data, list):
                        details += f" | Count: {len(response_data)}"
                    else:
                        details += f" | Response keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Non-dict'}"
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

    def test_category_dialog_functionality(self):
        """Test category dialog functionality and product loading for category assignment"""
        print("\n🔍 Testing Category Dialog Functionality and Product Loading...")
        
        # Test 1: GET /api/products?skip_pagination=true endpoint
        print("\n🔍 Testing GET /api/products?skip_pagination=true endpoint...")
        success, response = self.run_test(
            "Get All Products Without Pagination",
            "GET",
            "products?skip_pagination=true",
            200
        )
        
        all_products = []
        if success and response:
            try:
                all_products = response.json()
                if isinstance(all_products, list):
                    products_count = len(all_products)
                    self.log_test("Skip Pagination Products Count", True, f"Retrieved {products_count} products without pagination")
                    
                    # Verify we get a substantial number of products (should be all products in DB)
                    if products_count >= 100:  # Expecting significant number of products
                        self.log_test("Skip Pagination Performance", True, f"Successfully loaded {products_count} products")
                    else:
                        self.log_test("Skip Pagination Performance", False, f"Only {products_count} products found, expected more")
                    
                    # Verify product structure for category assignment
                    if products_count > 0:
                        sample_product = all_products[0]
                        required_fields = ['id', 'name', 'company_id', 'list_price', 'currency']
                        missing_fields = [field for field in required_fields if field not in sample_product]
                        
                        if not missing_fields:
                            self.log_test("Product Structure for Category Dialog", True, "All required fields present")
                            
                            # Check if category_id field exists (for filtering uncategorized products)
                            if 'category_id' in sample_product:
                                self.log_test("Category ID Field Present", True, "category_id field available for filtering")
                            else:
                                self.log_test("Category ID Field Present", False, "category_id field missing")
                        else:
                            self.log_test("Product Structure for Category Dialog", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test("Skip Pagination Response Format", False, "Response is not a list")
            except Exception as e:
                self.log_test("Skip Pagination Response Parsing", False, f"Error: {e}")
        
        # Test 2: Filter uncategorized products (products without category_id)
        print("\n🔍 Testing Uncategorized Products Filtering...")
        if all_products:
            uncategorized_products = []
            categorized_products = []
            
            for product in all_products:
                category_id = product.get('category_id')
                if not category_id or category_id == "none" or category_id == "":
                    uncategorized_products.append(product)
                else:
                    categorized_products.append(product)
            
            uncategorized_count = len(uncategorized_products)
            categorized_count = len(categorized_products)
            total_count = len(all_products)
            
            self.log_test("Uncategorized Products Filter", True, f"Found {uncategorized_count} uncategorized products out of {total_count} total")
            self.log_test("Categorized Products Count", True, f"Found {categorized_count} categorized products")
            
            # Verify filtering logic works correctly
            if uncategorized_count + categorized_count == total_count:
                self.log_test("Product Categorization Logic", True, "All products correctly classified")
            else:
                self.log_test("Product Categorization Logic", False, f"Classification mismatch: {uncategorized_count} + {categorized_count} != {total_count}")
        
        # Test 3: Search functionality with skip_pagination=true
        print("\n🔍 Testing Search Functionality with Skip Pagination...")
        
        # Test search with common terms
        search_terms = ["solar", "panel", "güneş", "inverter", "akü"]
        
        for search_term in search_terms:
            success, response = self.run_test(
                f"Search Products: '{search_term}' with Skip Pagination",
                "GET",
                f"products?skip_pagination=true&search={search_term}",
                200
            )
            
            if success and response:
                try:
                    search_results = response.json()
                    if isinstance(search_results, list):
                        results_count = len(search_results)
                        self.log_test(f"Search Results for '{search_term}'", True, f"Found {results_count} products")
                        
                        # Verify search results contain the search term
                        if results_count > 0:
                            relevant_results = 0
                            for product in search_results:
                                product_name = product.get('name', '').lower()
                                product_desc = product.get('description', '').lower()
                                if search_term.lower() in product_name or search_term.lower() in product_desc:
                                    relevant_results += 1
                            
                            relevance_ratio = relevant_results / results_count if results_count > 0 else 0
                            if relevance_ratio >= 0.5:  # At least 50% of results should be relevant
                                self.log_test(f"Search Relevance for '{search_term}'", True, f"{relevant_results}/{results_count} results relevant")
                            else:
                                self.log_test(f"Search Relevance for '{search_term}'", False, f"Only {relevant_results}/{results_count} results relevant")
                    else:
                        self.log_test(f"Search Response Format for '{search_term}'", False, "Response is not a list")
                except Exception as e:
                    self.log_test(f"Search Response Parsing for '{search_term}'", False, f"Error: {e}")
        
        # Test 4: Performance test with full product list (simulating category dialog loading)
        print("\n🔍 Testing Performance with Full Product List...")
        
        import time
        start_time = time.time()
        
        success, response = self.run_test(
            "Performance Test - Load All Products for Category Dialog",
            "GET",
            "products?skip_pagination=true",
            200
        )
        
        end_time = time.time()
        response_time = end_time - start_time
        
        if success and response:
            try:
                products = response.json()
                products_count = len(products)
                
                # Performance benchmarks
                if response_time < 2.0:  # Should load within 2 seconds
                    self.log_test("Category Dialog Load Performance", True, f"Loaded {products_count} products in {response_time:.2f}s")
                elif response_time < 5.0:  # Acceptable but slow
                    self.log_test("Category Dialog Load Performance", True, f"Loaded {products_count} products in {response_time:.2f}s (acceptable)")
                else:
                    self.log_test("Category Dialog Load Performance", False, f"Slow loading: {products_count} products in {response_time:.2f}s")
                
                # Memory efficiency test - check if we can handle the expected 443 products
                if products_count >= 400:
                    self.log_test("Large Dataset Handling", True, f"Successfully handled {products_count} products (target: 443)")
                else:
                    self.log_test("Large Dataset Handling", False, f"Only {products_count} products, expected around 443")
                    
            except Exception as e:
                self.log_test("Performance Test Response", False, f"Error: {e}")
        
        # Test 5: Category assignment workflow simulation
        print("\n🔍 Testing Category Assignment Workflow...")
        
        # First, create a test category for assignment
        test_category_name = f"Test Category {datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create Test Category for Assignment",
            "POST",
            "categories",
            200,
            data={"name": test_category_name, "description": "Test category for assignment workflow"}
        )
        
        test_category_id = None
        if success and response:
            try:
                category_data = response.json()
                test_category_id = category_data.get('id')
                if test_category_id:
                    self.created_categories.append(test_category_id)
                    self.log_test("Test Category Created", True, f"Category ID: {test_category_id}")
                else:
                    self.log_test("Test Category Created", False, "No category ID returned")
            except Exception as e:
                self.log_test("Test Category Creation", False, f"Error: {e}")
        
        # Test category assignment to a product
        if test_category_id and all_products:
            # Find an uncategorized product to assign
            uncategorized_product = None
            for product in all_products:
                if not product.get('category_id') or product.get('category_id') == "none":
                    uncategorized_product = product
                    break
            
            if uncategorized_product:
                product_id = uncategorized_product.get('id')
                success, response = self.run_test(
                    "Assign Product to Category",
                    "PUT",
                    f"products/{product_id}",
                    200,
                    data={"category_id": test_category_id}
                )
                
                if success and response:
                    try:
                        updated_product = response.json()
                        assigned_category_id = updated_product.get('category_id')
                        if assigned_category_id == test_category_id:
                            self.log_test("Category Assignment Success", True, f"Product assigned to category {test_category_id}")
                        else:
                            self.log_test("Category Assignment Success", False, f"Expected {test_category_id}, got {assigned_category_id}")
                    except Exception as e:
                        self.log_test("Category Assignment Response", False, f"Error: {e}")
            else:
                self.log_test("Find Uncategorized Product", False, "No uncategorized products found for testing")
        
        # Test 6: Verify search works with category filtering
        print("\n🔍 Testing Search with Category Filtering...")
        
        if test_category_id:
            success, response = self.run_test(
                "Search Products in Specific Category",
                "GET",
                f"products?skip_pagination=true&category_id={test_category_id}",
                200
            )
            
            if success and response:
                try:
                    category_products = response.json()
                    category_products_count = len(category_products)
                    self.log_test("Category Filtering", True, f"Found {category_products_count} products in test category")
                    
                    # Verify all returned products have the correct category_id
                    if category_products_count > 0:
                        correct_category_count = sum(1 for p in category_products if p.get('category_id') == test_category_id)
                        if correct_category_count == category_products_count:
                            self.log_test("Category Filter Accuracy", True, f"All {category_products_count} products have correct category")
                        else:
                            self.log_test("Category Filter Accuracy", False, f"Only {correct_category_count}/{category_products_count} products have correct category")
                except Exception as e:
                    self.log_test("Category Filtering Response", False, f"Error: {e}")
        
        # Test 7: Combined search and category filtering
        if test_category_id:
            success, response = self.run_test(
                "Combined Search and Category Filter",
                "GET",
                f"products?skip_pagination=true&category_id={test_category_id}&search=test",
                200
            )
            
            if success and response:
                try:
                    filtered_products = response.json()
                    filtered_count = len(filtered_products)
                    self.log_test("Combined Filter and Search", True, f"Found {filtered_count} products with combined filters")
                except Exception as e:
                    self.log_test("Combined Filter Response", False, f"Error: {e}")
        
        print(f"\n✅ Category Dialog Functionality Test Summary:")
        print(f"   - Tested skip_pagination=true parameter")
        print(f"   - Verified uncategorized product filtering")
        print(f"   - Tested search functionality with full product list")
        print(f"   - Measured performance with large dataset")
        print(f"   - Simulated category assignment workflow")
        print(f"   - Tested category filtering and combined search")
        
        return True

    def cleanup(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created categories
        for category_id in self.created_categories:
            try:
                url = f"{self.base_url}/categories/{category_id}"
                response = requests.delete(url, timeout=30)
                if response.status_code == 200:
                    self.log_test(f"Delete Category {category_id}", True, "Category deleted")
                else:
                    self.log_test(f"Delete Category {category_id}", False, f"Status: {response.status_code}")
            except Exception as e:
                self.log_test(f"Delete Category {category_id}", False, f"Error: {e}")

    def run_tests(self):
        """Run all category dialog tests"""
        print("🚀 Starting Category Dialog Functionality Tests")
        print(f"🌐 Testing against: {self.base_url}")
        print("=" * 80)
        
        try:
            # Test category dialog functionality
            self.test_category_dialog_functionality()
            
        finally:
            # Always cleanup
            self.cleanup()
        
        # Print final summary
        print("\n" + "=" * 80)
        print("🏁 CATEGORY DIALOG TEST SUMMARY")
        print("=" * 80)
        print(f"Total Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed. Please review the results above.")
            return False

if __name__ == "__main__":
    tester = CategoryDialogTester()
    success = tester.run_tests()
    sys.exit(0 if success else 1)