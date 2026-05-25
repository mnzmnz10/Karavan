#!/usr/bin/env python3
"""
MongoDB Atlas Integration Test Script
Tests all core functionality after Atlas migration
"""

import requests
import sys
import json
import time
from datetime import datetime

class AtlasIntegrationTester:
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

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}" if endpoint else self.base_url
        headers = {'Content-Type': 'application/json'}

        try:
            start_time = time.time()
            
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            
            response_time = time.time() - start_time
            success = response.status_code == expected_status
            
            if success:
                try:
                    response_data = response.json()
                    details = f"Status: {response.status_code} | Time: {response_time:.2f}s"
                    if isinstance(response_data, list):
                        details += f" | Count: {len(response_data)}"
                    elif isinstance(response_data, dict) and 'count' in response_data:
                        details += f" | Count: {response_data['count']}"
                except:
                    details = f"Status: {response.status_code} | Time: {response_time:.2f}s"
            else:
                details = f"Status: {response.status_code} | Expected: {expected_status} | Time: {response_time:.2f}s"

            return self.log_test(name, success, details), response

        except Exception as e:
            return self.log_test(name, False, f"Exception: {str(e)}"), None

    def test_mongodb_atlas_integration(self):
        """Comprehensive MongoDB Atlas integration test"""
        print("🔍 TESTING MONGODB ATLAS INTEGRATION")
        print("=" * 60)
        
        # Test 1: Database Connection
        print("\n1. Database Connection Test")
        success, response = self.run_test(
            "Database Connection",
            "GET",
            "",
            200
        )
        
        if not success:
            print("❌ CRITICAL: Cannot connect to MongoDB Atlas")
            return False
        
        # Test 2: Products API with Count Verification
        print("\n2. Products API Testing")
        
        # Get products count
        success, response = self.run_test(
            "Products Count",
            "GET",
            "products/count",
            200
        )
        
        total_products = 0
        if success and response:
            try:
                count_data = response.json()
                total_products = count_data.get('count', 0)
                
                if total_products == 443:
                    self.log_test("Products Count Verification", True, f"Correct count: {total_products}")
                else:
                    self.log_test("Products Count Verification", False, f"Expected 443, got {total_products}")
            except Exception as e:
                self.log_test("Products Count Parsing", False, f"Error: {e}")
        
        # Get products with pagination
        success, response = self.run_test(
            "Products Pagination",
            "GET",
            "products?page=1&limit=50",
            200
        )
        
        if success and response:
            try:
                products = response.json()
                if isinstance(products, list) and len(products) > 0:
                    # Verify product structure
                    sample_product = products[0]
                    required_fields = ['id', 'name', 'company_id', 'list_price', 'currency']
                    missing_fields = [field for field in required_fields if field not in sample_product]
                    
                    if not missing_fields:
                        self.log_test("Product Structure", True, "All required fields present")
                    else:
                        self.log_test("Product Structure", False, f"Missing: {missing_fields}")
                else:
                    self.log_test("Products Response", False, "Invalid or empty response")
            except Exception as e:
                self.log_test("Products Parsing", False, f"Error: {e}")
        
        # Test search functionality
        search_terms = ["solar", "panel", "battery"]
        for term in search_terms:
            success, response = self.run_test(
                f"Search '{term}'",
                "GET",
                f"products?search={term}",
                200
            )
        
        # Test 3: Companies API
        print("\n3. Companies API Testing")
        success, response = self.run_test(
            "Companies List",
            "GET",
            "companies",
            200
        )
        
        companies_count = 0
        if success and response:
            try:
                companies = response.json()
                companies_count = len(companies)
                
                if companies_count >= 3:
                    self.log_test("Companies Count", True, f"Found {companies_count} companies")
                else:
                    self.log_test("Companies Count", False, f"Expected ≥3, got {companies_count}")
            except Exception as e:
                self.log_test("Companies Parsing", False, f"Error: {e}")
        
        # Test 4: Categories API
        print("\n4. Categories API Testing")
        success, response = self.run_test(
            "Categories List",
            "GET",
            "categories",
            200
        )
        
        categories_count = 0
        if success and response:
            try:
                categories = response.json()
                categories_count = len(categories)
                
                if categories_count >= 6:
                    self.log_test("Categories Count", True, f"Found {categories_count} categories")
                else:
                    self.log_test("Categories Count", False, f"Expected ≥6, got {categories_count}")
            except Exception as e:
                self.log_test("Categories Parsing", False, f"Error: {e}")
        
        # Test 5: Quotes API
        print("\n5. Quotes API Testing")
        success, response = self.run_test(
            "Quotes List",
            "GET",
            "quotes",
            200
        )
        
        quotes_count = 0
        existing_quote_id = None
        if success and response:
            try:
                quotes = response.json()
                quotes_count = len(quotes)
                
                if quotes_count >= 43:
                    self.log_test("Quotes Count", True, f"Found {quotes_count} quotes")
                else:
                    self.log_test("Quotes Count", False, f"Expected ≥43, got {quotes_count}")
                
                # Get a quote ID for PDF testing
                if quotes:
                    existing_quote_id = quotes[0].get('id')
                    
            except Exception as e:
                self.log_test("Quotes Parsing", False, f"Error: {e}")
        
        # Test 6: Exchange Rates API
        print("\n6. Exchange Rates API Testing")
        success, response = self.run_test(
            "Exchange Rates",
            "GET",
            "exchange-rates",
            200
        )
        
        if success and response:
            try:
                rates_data = response.json()
                if rates_data.get('success') and 'rates' in rates_data:
                    rates = rates_data['rates']
                    required_currencies = ['USD', 'EUR', 'TRY', 'GBP']
                    missing_currencies = [curr for curr in required_currencies if curr not in rates]
                    
                    if not missing_currencies:
                        self.log_test("Exchange Rates Data", True, f"All currencies present")
                    else:
                        self.log_test("Exchange Rates Data", False, f"Missing: {missing_currencies}")
                else:
                    self.log_test("Exchange Rates Format", False, "Invalid response format")
            except Exception as e:
                self.log_test("Exchange Rates Parsing", False, f"Error: {e}")
        
        # Test 7: Quote Creation with Atlas
        print("\n7. Quote Creation Testing")
        
        # Get some products for quote creation
        success, response = self.run_test(
            "Get Products for Quote",
            "GET",
            "products?limit=2",
            200
        )
        
        if success and response:
            try:
                products_for_quote = response.json()
                if len(products_for_quote) >= 2:
                    # Create a test quote
                    quote_data = {
                        "name": f"Atlas Test Quote {datetime.now().strftime('%H%M%S')}",
                        "customer_name": "Atlas Test Customer",
                        "discount_percentage": 5.0,
                        "labor_cost": 1000.0,
                        "products": [
                            {"id": products_for_quote[0]["id"], "quantity": 2},
                            {"id": products_for_quote[1]["id"], "quantity": 1}
                        ],
                        "notes": "MongoDB Atlas integration test quote"
                    }
                    
                    success, response = self.run_test(
                        "Create Quote",
                        "POST",
                        "quotes",
                        200,
                        data=quote_data
                    )
                    
                    if success and response:
                        try:
                            quote_response = response.json()
                            created_quote_id = quote_response.get('id')
                            
                            if created_quote_id:
                                self.log_test("Quote Creation", True, f"Quote ID: {created_quote_id}")
                                existing_quote_id = created_quote_id  # Use for PDF test
                            else:
                                self.log_test("Quote Creation", False, "No quote ID returned")
                        except Exception as e:
                            self.log_test("Quote Creation Response", False, f"Error: {e}")
                else:
                    self.log_test("Quote Creation Setup", False, "Not enough products available")
            except Exception as e:
                self.log_test("Quote Creation Setup", False, f"Error: {e}")
        
        # Test 8: PDF Generation
        print("\n8. PDF Generation Testing")
        
        if existing_quote_id:
            try:
                pdf_url = f"{self.base_url}/quotes/{existing_quote_id}/pdf"
                headers = {'Accept': 'application/pdf'}
                
                start_time = time.time()
                pdf_response = requests.get(pdf_url, headers=headers, timeout=60)
                pdf_time = time.time() - start_time
                
                if pdf_response.status_code == 200:
                    if pdf_response.content.startswith(b'%PDF'):
                        pdf_size = len(pdf_response.content)
                        self.log_test("PDF Generation", True, f"Size: {pdf_size} bytes, Time: {pdf_time:.2f}s")
                        
                        # Performance check
                        if pdf_time < 5.0:
                            self.log_test("PDF Performance", True, f"Generated in {pdf_time:.2f}s")
                        else:
                            self.log_test("PDF Performance", False, f"Took {pdf_time:.2f}s (>5s)")
                    else:
                        self.log_test("PDF Generation", False, "Invalid PDF format")
                else:
                    self.log_test("PDF Generation", False, f"HTTP {pdf_response.status_code}")
                    
            except Exception as e:
                self.log_test("PDF Generation", False, f"Error: {e}")
        else:
            self.log_test("PDF Generation", False, "No quote ID available for testing")
        
        # Test 9: Performance Testing
        print("\n9. Performance Testing")
        
        endpoints = [
            ("products", "Products API"),
            ("companies", "Companies API"),
            ("categories", "Categories API"),
            ("quotes", "Quotes API"),
            ("exchange-rates", "Exchange Rates API")
        ]
        
        for endpoint, name in endpoints:
            start_time = time.time()
            success, response = self.run_test(
                f"Performance - {name}",
                "GET",
                endpoint,
                200
            )
            response_time = time.time() - start_time
            
            if success and response_time < 2.0:
                self.log_test(f"Performance OK - {name}", True, f"{response_time:.2f}s")
            elif success:
                self.log_test(f"Performance Slow - {name}", False, f"{response_time:.2f}s (>2s)")
        
        # Test 10: Data Integrity Summary
        print("\n10. Data Integrity Summary")
        
        expected_counts = {
            "Products": (443, total_products),
            "Companies": (3, companies_count),
            "Categories": (6, categories_count),
            "Quotes": (43, quotes_count)
        }
        
        all_correct = True
        for name, (expected, actual) in expected_counts.items():
            if actual >= expected:
                self.log_test(f"{name} Migration", True, f"{actual} (expected ≥{expected})")
            else:
                self.log_test(f"{name} Migration", False, f"{actual} (expected ≥{expected})")
                all_correct = False
        
        if all_correct:
            self.log_test("Atlas Migration Complete", True, "All data successfully migrated")
        else:
            self.log_test("Atlas Migration Complete", False, "Some data missing")
        
        return True

def main():
    """Main test runner for MongoDB Atlas integration"""
    print("🚀 MongoDB Atlas Integration Test")
    print("Testing complete migration and functionality")
    print("=" * 60)
    
    tester = AtlasIntegrationTester()
    
    try:
        tester.test_mongodb_atlas_integration()
        
    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
    
    # Final Results
    print("\n" + "=" * 60)
    print("📊 MONGODB ATLAS INTEGRATION TEST RESULTS")
    print("=" * 60)
    print(f"✅ Tests Passed: {tester.tests_passed}")
    print(f"❌ Tests Failed: {tester.tests_run - tester.tests_passed}")
    print(f"📈 Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 ALL TESTS PASSED! MongoDB Atlas integration is working perfectly.")
        return 0
    else:
        print("⚠️ Some tests failed. Check the results above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())