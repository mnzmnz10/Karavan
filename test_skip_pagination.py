#!/usr/bin/env python3
"""
Skip Pagination Feature Test Script
Tests the skip_pagination parameter functionality for the products endpoint
"""

import requests
import sys
import json
import time
from datetime import datetime

class SkipPaginationTester:
    def __init__(self, base_url="http://localhost:8001/api"):
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

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if success:
                try:
                    response_data = response.json()
                    if isinstance(response_data, list):
                        details += f" | Count: {len(response_data)}"
                    else:
                        details += f" | Response: {json.dumps(response_data, indent=2)[:100]}..."
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

    def test_skip_pagination_comprehensive(self):
        """Comprehensive test for skip_pagination parameter functionality"""
        print("\n🔍 Testing Skip Pagination Functionality...")
        
        # Test 1: GET /api/products with skip_pagination=true - should return all products
        print("\n🔍 Testing GET /api/products with skip_pagination=true...")
        
        success, response = self.run_test(
            "Get All Products with skip_pagination=true",
            "GET",
            "products?skip_pagination=true",
            200
        )
        
        all_products_count = 0
        all_products = []
        
        if success and response:
            try:
                products = response.json()
                if isinstance(products, list):
                    all_products_count = len(products)
                    all_products = products
                    self.log_test("Skip Pagination Response Format", True, f"Returned {all_products_count} products as list")
                    
                    # Verify we got products
                    if all_products_count > 0:
                        self.log_test("Skip Pagination Returns Products", True, f"Got {all_products_count} products")
                        
                        # Verify product structure
                        sample_product = products[0]
                        required_fields = ['id', 'name', 'company_id', 'list_price', 'currency']
                        missing_fields = [field for field in required_fields if field not in sample_product]
                        
                        if not missing_fields:
                            self.log_test("Skip Pagination Product Structure", True, "All required fields present in products")
                        else:
                            self.log_test("Skip Pagination Product Structure", False, f"Missing fields: {missing_fields}")
                    else:
                        self.log_test("Skip Pagination Returns Products", False, "No products returned")
                else:
                    self.log_test("Skip Pagination Response Format", False, "Response is not a list")
            except Exception as e:
                self.log_test("Skip Pagination Response Parsing", False, f"Error parsing response: {e}")
        
        # Test 2: Compare with paginated results to verify skip_pagination works
        print("\n🔍 Testing Comparison with Paginated Results...")
        
        success, response = self.run_test(
            "Get Products with Default Pagination (page=1, limit=50)",
            "GET",
            "products?page=1&limit=50",
            200
        )
        
        paginated_count = 0
        if success and response:
            try:
                paginated_products = response.json()
                if isinstance(paginated_products, list):
                    paginated_count = len(paginated_products)
                    
                    # Verify pagination is working (should return max 50 products)
                    if paginated_count <= 50:
                        self.log_test("Default Pagination Working", True, f"Paginated request returned {paginated_count} products (≤50)")
                    else:
                        self.log_test("Default Pagination Working", False, f"Paginated request returned {paginated_count} products (>50)")
                    
                    # Compare with skip_pagination results
                    if all_products_count >= paginated_count:
                        self.log_test("Skip Pagination vs Pagination Comparison", True, f"skip_pagination ({all_products_count}) >= paginated ({paginated_count})")
                    else:
                        self.log_test("Skip Pagination vs Pagination Comparison", False, f"skip_pagination ({all_products_count}) < paginated ({paginated_count})")
                        
                else:
                    self.log_test("Paginated Response Format", False, "Paginated response is not a list")
            except Exception as e:
                self.log_test("Paginated Response Parsing", False, f"Error parsing paginated response: {e}")
        
        # Test 3: GET /api/products with search parameter and skip_pagination=true
        print("\n🔍 Testing GET /api/products with search and skip_pagination=true...")
        
        search_terms = ["solar", "panel", "battery"]
        
        for search_term in search_terms:
            success, response = self.run_test(
                f"Search '{search_term}' with skip_pagination=true",
                "GET",
                f"products?search={search_term}&skip_pagination=true",
                200
            )
            
            if success and response:
                try:
                    search_products = response.json()
                    if isinstance(search_products, list):
                        search_count = len(search_products)
                        self.log_test(f"Search '{search_term}' with Skip Pagination", True, f"Found {search_count} matching products")
                        
                        # Verify search results are relevant (if any results)
                        if search_products:
                            relevant_count = 0
                            for product in search_products[:5]:  # Check first 5 products
                                product_text = f"{product.get('name', '')} {product.get('description', '')} {product.get('brand', '')}".lower()
                                if search_term.lower() in product_text:
                                    relevant_count += 1
                            
                            if len(search_products) <= 5:
                                relevance_percentage = (relevant_count / len(search_products)) * 100
                            else:
                                relevance_percentage = (relevant_count / 5) * 100
                                
                            if relevance_percentage >= 60:  # At least 60% relevant
                                self.log_test(f"Search '{search_term}' Relevance", True, f"{relevance_percentage:.1f}% relevance in sample")
                            else:
                                self.log_test(f"Search '{search_term}' Relevance", False, f"Only {relevance_percentage:.1f}% relevance in sample")
                        
                        # Compare with paginated search
                        success2, response2 = self.run_test(
                            f"Search '{search_term}' with pagination (limit=20)",
                            "GET",
                            f"products?search={search_term}&limit=20",
                            200
                        )
                        
                        if success2 and response2:
                            try:
                                paginated_search = response2.json()
                                if isinstance(paginated_search, list):
                                    paginated_search_count = len(paginated_search)
                                    
                                    if search_count >= paginated_search_count:
                                        self.log_test(f"Search '{search_term}' Skip vs Paginated", True, f"skip_pagination ({search_count}) >= paginated ({paginated_search_count})")
                                    else:
                                        self.log_test(f"Search '{search_term}' Skip vs Paginated", False, f"skip_pagination ({search_count}) < paginated ({paginated_search_count})")
                            except Exception as e:
                                self.log_test(f"Search '{search_term}' Paginated Parsing", False, f"Error: {e}")
                    else:
                        self.log_test(f"Search '{search_term}' Response Format", False, "Response is not a list")
                except Exception as e:
                    self.log_test(f"Search '{search_term}' Response Parsing", False, f"Error: {e}")
        
        # Test 4: GET /api/products with category_id and skip_pagination=true
        print("\n🔍 Testing GET /api/products with category_id and skip_pagination=true...")
        
        # First get available categories
        success, response = self.run_test(
            "Get Categories for Testing",
            "GET",
            "categories",
            200
        )
        
        if success and response:
            try:
                categories = response.json()
                if isinstance(categories, list) and categories:
                    # Test with first category
                    category = categories[0]
                    category_id = category.get('id')
                    category_name = category.get('name', 'Unknown')
                    
                    if category_id:
                        success, response = self.run_test(
                            f"Category '{category_name}' with skip_pagination=true",
                            "GET",
                            f"products?category_id={category_id}&skip_pagination=true",
                            200
                        )
                        
                        if success and response:
                            try:
                                category_products = response.json()
                                if isinstance(category_products, list):
                                    category_count = len(category_products)
                                    self.log_test(f"Category '{category_name}' Skip Pagination", True, f"Found {category_count} products in category")
                                    
                                    # Verify products belong to the category (if any products)
                                    if category_products:
                                        correct_category_count = 0
                                        for product in category_products[:3]:  # Check first 3
                                            if product.get('category_id') == category_id:
                                                correct_category_count += 1
                                        
                                        sample_size = min(len(category_products), 3)
                                        if correct_category_count == sample_size:
                                            self.log_test(f"Category '{category_name}' Filter Accuracy", True, "All sampled products belong to correct category")
                                        else:
                                            self.log_test(f"Category '{category_name}' Filter Accuracy", False, f"Only {correct_category_count}/{sample_size} products in correct category")
                                    
                                    # Compare with paginated category filter
                                    success2, response2 = self.run_test(
                                        f"Category '{category_name}' with pagination (limit=10)",
                                        "GET",
                                        f"products?category_id={category_id}&limit=10",
                                        200
                                    )
                                    
                                    if success2 and response2:
                                        try:
                                            paginated_category = response2.json()
                                            if isinstance(paginated_category, list):
                                                paginated_category_count = len(paginated_category)
                                                
                                                if category_count >= paginated_category_count:
                                                    self.log_test(f"Category '{category_name}' Skip vs Paginated", True, f"skip_pagination ({category_count}) >= paginated ({paginated_category_count})")
                                                else:
                                                    self.log_test(f"Category '{category_name}' Skip vs Paginated", False, f"skip_pagination ({category_count}) < paginated ({paginated_category_count})")
                                        except Exception as e:
                                            self.log_test(f"Category '{category_name}' Paginated Parsing", False, f"Error: {e}")
                                else:
                                    self.log_test(f"Category '{category_name}' Response Format", False, "Response is not a list")
                            except Exception as e:
                                self.log_test(f"Category '{category_name}' Response Parsing", False, f"Error: {e}")
                else:
                    self.log_test("Categories Available for Testing", False, "No categories found or invalid format")
            except Exception as e:
                self.log_test("Categories Retrieval", False, f"Error getting categories: {e}")
        
        # Test 5: Verify response format is correct
        print("\n🔍 Testing Response Format Verification...")
        
        success, response = self.run_test(
            "Skip Pagination Response Format Verification",
            "GET",
            "products?skip_pagination=true&limit=5",  # limit should be ignored when skip_pagination=true
            200
        )
        
        if success and response:
            try:
                products = response.json()
                if isinstance(products, list):
                    # Verify limit is ignored when skip_pagination=true
                    if len(products) > 5:
                        self.log_test("Skip Pagination Ignores Limit Parameter", True, f"Returned {len(products)} products (limit=5 ignored)")
                    elif len(products) == 5:
                        self.log_test("Skip Pagination Ignores Limit Parameter", False, f"Returned exactly 5 products (limit may not be ignored)")
                    else:
                        self.log_test("Skip Pagination Ignores Limit Parameter", True, f"Returned {len(products)} products (less than 5 available)")
                    
                    # Verify response structure
                    if products:
                        sample_product = products[0]
                        expected_fields = ['id', 'name', 'company_id', 'list_price', 'currency']
                        present_fields = [field for field in expected_fields if field in sample_product]
                        
                        if len(present_fields) >= 4:  # Most important fields present
                            self.log_test("Skip Pagination Response Structure", True, f"Product contains {len(present_fields)}/{len(expected_fields)} expected fields")
                        else:
                            self.log_test("Skip Pagination Response Structure", False, f"Product missing important fields: {set(expected_fields) - set(present_fields)}")
                else:
                    self.log_test("Skip Pagination Response Format", False, "Response is not a list")
            except Exception as e:
                self.log_test("Skip Pagination Format Verification", False, f"Error: {e}")
        
        # Test 6: Performance test
        print("\n🔍 Testing Skip Pagination Performance...")
        
        start_time = time.time()
        success, response = self.run_test(
            "Skip Pagination Performance Test",
            "GET",
            "products?skip_pagination=true",
            200
        )
        end_time = time.time()
        
        if success and response:
            response_time = end_time - start_time
            try:
                products = response.json()
                if isinstance(products, list):
                    products_count = len(products)
                    
                    # Performance should be reasonable
                    if response_time < 10.0:  # Should complete within 10 seconds
                        self.log_test("Skip Pagination Performance", True, f"Retrieved {products_count} products in {response_time:.2f}s")
                    else:
                        self.log_test("Skip Pagination Performance", False, f"Slow response: {response_time:.2f}s for {products_count} products")
                        
            except Exception as e:
                self.log_test("Skip Pagination Performance Analysis", False, f"Error: {e}")
        
        return True

    def run_tests(self):
        """Run all skip pagination tests"""
        print("🚀 Starting Skip Pagination Tests...")
        print(f"📡 Backend URL: {self.base_url}")
        print(f"🕐 Test Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        try:
            # Run the comprehensive skip pagination test
            self.test_skip_pagination_comprehensive()
            
        except KeyboardInterrupt:
            print("\n⚠️ Tests interrupted by user")
        except Exception as e:
            print(f"\n❌ Unexpected error during testing: {e}")
        
        # Print summary
        print(f"\n📊 Skip Pagination Test Results Summary:")
        print(f"   Total Tests: {self.tests_run}")
        print(f"   Passed: {self.tests_passed}")
        print(f"   Failed: {self.tests_run - self.tests_passed}")
        if self.tests_run > 0:
            success_rate = (self.tests_passed / self.tests_run) * 100
            print(f"   Success Rate: {success_rate:.1f}%")
            
            if success_rate >= 90:
                print("   🎉 EXCELLENT - Skip pagination functionality working perfectly!")
            elif success_rate >= 75:
                print("   ✅ GOOD - Skip pagination functionality mostly working")
            elif success_rate >= 50:
                print("   ⚠️ FAIR - Skip pagination has some issues")
            else:
                print("   ❌ POOR - Skip pagination functionality needs attention")
        else:
            print("   Success Rate: 0%")
        
        print(f"🕐 Test Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    tester = SkipPaginationTester()
    tester.run_tests()