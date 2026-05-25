#!/usr/bin/env python3
"""
Test script for new search and category features
"""

import requests
import sys
import json
from datetime import datetime

class NewFeaturesAPITester:
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

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if success:
                try:
                    response_data = response.json()
                    return self.log_test(name, success, details), response_data
                except:
                    return self.log_test(name, success, details), {}
            else:
                details += f" | Expected: {expected_status}"
                try:
                    error_data = response.json()
                    details += f" | Error: {error_data}"
                except:
                    details += f" | Error: {response.text[:100]}"
                return self.log_test(name, success, details), {}

        except Exception as e:
            return self.log_test(name, False, f"Exception: {str(e)}"), {}

    def test_product_search(self):
        """Test product search functionality"""
        print("\n🔍 Testing Product Search System...")
        
        # Test search for "solar" products
        success, products = self.run_test(
            "Search for 'solar' products",
            "GET",
            "products",
            200,
            params={"search": "solar"}
        )
        
        if success and isinstance(products, list):
            solar_count = len(products)
            print(f"   Found {solar_count} products matching 'solar'")
            
            # Show some examples
            for i, product in enumerate(products[:3]):
                name = product.get('name', 'Unknown')[:60]
                print(f"   - {name}...")
            
            # Verify search is working (should find products with "solar" in name)
            if solar_count > 0:
                solar_products = [p for p in products if 'solar' in p.get('name', '').lower()]
                if len(solar_products) > 0:
                    self.log_test("Search functionality working", True, f"Found {len(solar_products)} products with 'solar' in name")
                else:
                    self.log_test("Search functionality working", False, "No products with 'solar' in name found")
            else:
                self.log_test("Search results", False, "No products found for 'solar' search")
        
        # Test search for "panel" products
        success, products = self.run_test(
            "Search for 'panel' products",
            "GET",
            "products",
            200,
            params={"search": "panel"}
        )
        
        if success and isinstance(products, list):
            panel_count = len(products)
            print(f"   Found {panel_count} products matching 'panel'")
        
        # Test search for "kablo" products
        success, products = self.run_test(
            "Search for 'kablo' products",
            "GET",
            "products",
            200,
            params={"search": "kablo"}
        )
        
        if success and isinstance(products, list):
            kablo_count = len(products)
            print(f"   Found {kablo_count} products matching 'kablo'")
            
            # Check if "4MM Solar Kablo" is found
            kablo_products = [p for p in products if '4mm' in p.get('name', '').lower() and 'solar' in p.get('name', '').lower()]
            if kablo_products:
                self.log_test("4MM Solar Kablo found in search", True, f"Found {len(kablo_products)} matching products")
            else:
                self.log_test("4MM Solar Kablo found in search", False, "Expected product not found")

    def test_category_management(self):
        """Test category CRUD operations"""
        print("\n🔍 Testing Category Management...")
        
        # Get existing categories
        success, categories = self.run_test(
            "Get existing categories",
            "GET",
            "categories",
            200
        )
        
        if success and isinstance(categories, list):
            print(f"   Found {len(categories)} existing categories:")
            for cat in categories:
                name = cat.get('name', 'Unknown')
                cat_id = cat.get('id', 'Unknown')
                color = cat.get('color', 'Unknown')
                print(f"   - {name} (ID: {cat_id[:8]}..., Color: {color})")
            
            # Check if "Güneş Panelleri" category exists
            gunes_panelleri = [c for c in categories if 'güneş' in c.get('name', '').lower()]
            if gunes_panelleri:
                self.log_test("Güneş Panelleri category exists", True, f"Found category: {gunes_panelleri[0]['name']}")
            else:
                self.log_test("Güneş Panelleri category exists", False, "Expected category not found")
        
        # Create a new test category
        test_category_name = f"Test Kategori {datetime.now().strftime('%H%M%S')}"
        success, category = self.run_test(
            "Create new category",
            "POST",
            "categories",
            200,
            data={
                "name": test_category_name,
                "description": "Test kategorisi - arama ve filtreleme testi için",
                "color": "#FF6B35"
            }
        )
        
        category_id = None
        if success and 'id' in category:
            category_id = category['id']
            self.created_categories.append(category_id)
            print(f"   Created category ID: {category_id}")
        
        # Test category update
        if category_id:
            success, updated_category = self.run_test(
                "Update category",
                "PATCH",
                f"categories/{category_id}",
                200,
                data={
                    "name": f"Updated {test_category_name}",
                    "description": "Güncellenmiş açıklama"
                }
            )
        
        return category_id

    def test_product_category_assignment(self):
        """Test product-category relationship"""
        print("\n🔍 Testing Product-Category Assignment...")
        
        # Get some products first
        success, products = self.run_test(
            "Get products for category assignment",
            "GET",
            "products",
            200
        )
        
        if not success or not isinstance(products, list) or len(products) == 0:
            self.log_test("Product-Category Assignment", False, "No products available for testing")
            return
        
        # Get categories
        success, categories = self.run_test(
            "Get categories for assignment",
            "GET",
            "categories",
            200
        )
        
        if not success or not isinstance(categories, list) or len(categories) == 0:
            self.log_test("Product-Category Assignment", False, "No categories available for testing")
            return
        
        # Find a product and assign it to a category
        test_product = products[0]
        test_category = categories[0]
        
        success, result = self.run_test(
            "Assign product to category",
            "PATCH",
            f"products/{test_product['id']}",
            200,
            data={"category_id": test_category['id']}
        )
        
        if success:
            # Verify the assignment by filtering products by category
            success, filtered_products = self.run_test(
                "Filter products by category",
                "GET",
                "products",
                200,
                params={"category_id": test_category['id']}
            )
            
            if success and isinstance(filtered_products, list):
                assigned_product = next((p for p in filtered_products if p['id'] == test_product['id']), None)
                if assigned_product and assigned_product.get('category_id') == test_category['id']:
                    self.log_test("Category assignment verification", True, f"Product successfully assigned to category")
                else:
                    self.log_test("Category assignment verification", False, "Product not found in category filter")
                
                print(f"   Found {len(filtered_products)} products in category '{test_category['name']}'")

    def test_category_filtering(self):
        """Test category filtering functionality"""
        print("\n🔍 Testing Category Filtering...")
        
        # Get all categories
        success, categories = self.run_test(
            "Get categories for filtering test",
            "GET",
            "categories",
            200
        )
        
        if success and isinstance(categories, list) and len(categories) > 0:
            for category in categories[:2]:  # Test first 2 categories
                category_name = category.get('name', 'Unknown')
                category_id = category.get('id')
                
                success, filtered_products = self.run_test(
                    f"Filter by category: {category_name}",
                    "GET",
                    "products",
                    200,
                    params={"category_id": category_id}
                )
                
                if success and isinstance(filtered_products, list):
                    print(f"   Category '{category_name}': {len(filtered_products)} products")
                    
                    # Show some examples
                    for product in filtered_products[:2]:
                        name = product.get('name', 'Unknown')[:50]
                        print(f"     - {name}...")
        else:
            self.log_test("Category filtering test", False, "No categories available for filtering")

    def test_combined_search_and_filter(self):
        """Test combined search and category filtering"""
        print("\n🔍 Testing Combined Search and Category Filter...")
        
        # Get categories
        success, categories = self.run_test(
            "Get categories for combined test",
            "GET",
            "categories",
            200
        )
        
        if success and isinstance(categories, list) and len(categories) > 0:
            category = categories[0]
            category_id = category.get('id')
            category_name = category.get('name', 'Unknown')
            
            # Test search within a specific category
            success, results = self.run_test(
                f"Search 'solar' in category '{category_name}'",
                "GET",
                "products",
                200,
                params={"search": "solar", "category_id": category_id}
            )
            
            if success and isinstance(results, list):
                print(f"   Found {len(results)} products matching 'solar' in category '{category_name}'")
                
                # Verify all results belong to the category and contain search term
                valid_results = 0
                for product in results:
                    if (product.get('category_id') == category_id and 
                        'solar' in product.get('name', '').lower()):
                        valid_results += 1
                
                if len(results) == 0:
                    self.log_test("Combined search and filter", True, "No results found (expected for specific combination)")
                elif valid_results == len(results):
                    self.log_test("Combined search and filter", True, f"All {len(results)} results are valid")
                else:
                    self.log_test("Combined search and filter", False, f"Only {valid_results}/{len(results)} results are valid")

    def cleanup(self):
        """Clean up created test data"""
        print("\n🧹 Cleaning up test data...")
        
        for category_id in self.created_categories:
            try:
                success, response = self.run_test(
                    f"Delete test category",
                    "DELETE",
                    f"categories/{category_id}",
                    200
                )
            except Exception as e:
                print(f"⚠️  Error deleting category {category_id}: {e}")

    def run_all_tests(self):
        """Run all new feature tests"""
        print("🚀 Testing New Search and Category Features")
        print(f"🌐 Testing against: {self.base_url}")
        print("=" * 60)
        
        try:
            # Test product search system
            self.test_product_search()
            
            # Test category management
            category_id = self.test_category_management()
            
            # Test product-category assignment
            self.test_product_category_assignment()
            
            # Test category filtering
            self.test_category_filtering()
            
            # Test combined search and filtering
            self.test_combined_search_and_filter()
            
        finally:
            # Always cleanup
            self.cleanup()
        
        # Print final results
        print("\n" + "=" * 60)
        print("📊 NEW FEATURES TEST RESULTS")
        print("=" * 60)
        print(f"Total Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 ALL NEW FEATURES WORKING!")
            return 0
        else:
            print("⚠️  SOME NEW FEATURES HAVE ISSUES!")
            return 1

def main():
    """Main test runner"""
    tester = NewFeaturesAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())