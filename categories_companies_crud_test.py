#!/usr/bin/env python3
"""
Categories and Companies CRUD System Comprehensive Testing
Tests the specific issues reported by the user:
- "Firma eklerken sorun yok, silince silindi yazıyor ama göstermeye devam ediyor"
- "Kategori kısmında kategori eklerken eklendi yazıyor ancak göstermiyor"
- "Mevcut kategorilerden sildiğimde silindi yazıyor ancak göstermeye devam ediyor"
"""

import requests
import sys
import json
import time
import uuid
from datetime import datetime

class CategoriesCompaniesCRUDTester:
    def __init__(self, base_url="https://quotemate-3.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_categories = []
        self.created_companies = []

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

    def test_categories_crud_comprehensive(self):
        """Comprehensive test for Categories CRUD operations"""
        print("\n🔍 TESTING CATEGORIES CRUD SYSTEM...")
        print("🎯 Focus: User reported issues with category add/delete operations")
        
        # Test 1: GET /api/categories - Initial state
        print("\n📋 Step 1: Get initial categories list")
        success, response = self.run_test(
            "GET Categories - Initial State",
            "GET",
            "categories",
            200
        )
        
        initial_categories = []
        initial_count = 0
        if success and response:
            try:
                initial_categories = response.json()
                initial_count = len(initial_categories)
                self.log_test("Initial Categories Count", True, f"Found {initial_count} categories")
                
                # Log existing categories for reference
                for cat in initial_categories[:5]:  # Show first 5
                    print(f"   📁 Existing: {cat.get('name', 'Unknown')} (ID: {cat.get('id', 'Unknown')[:8]}...)")
                    
            except Exception as e:
                self.log_test("Initial Categories Parsing", False, f"Error: {e}")
        
        # Test 2: POST /api/categories - Create new category
        print("\n➕ Step 2: Create new category")
        test_category_name = f"Test Kategori {datetime.now().strftime('%H%M%S')}"
        category_data = {
            "name": test_category_name,
            "description": "Test kategorisi - CRUD testi için oluşturuldu",
            "color": "#FF5733"
        }
        
        success, response = self.run_test(
            "POST Categories - Create New Category",
            "POST",
            "categories",
            200,
            data=category_data
        )
        
        created_category_id = None
        if success and response:
            try:
                category_response = response.json()
                created_category_id = category_response.get('id')
                if created_category_id:
                    self.created_categories.append(created_category_id)
                    self.log_test("Category Creation Success", True, f"Created category ID: {created_category_id}")
                    
                    # Verify response contains expected fields
                    expected_fields = ['id', 'name', 'description', 'color', 'created_at']
                    missing_fields = [field for field in expected_fields if field not in category_response]
                    if not missing_fields:
                        self.log_test("Category Response Structure", True, "All expected fields present")
                    else:
                        self.log_test("Category Response Structure", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test("Category Creation Success", False, "No category ID returned")
            except Exception as e:
                self.log_test("Category Creation Response", False, f"Error parsing: {e}")
        
        # Test 3: GET /api/categories - Verify new category appears
        print("\n🔍 Step 3: Verify new category appears in list")
        success, response = self.run_test(
            "GET Categories - After Creation",
            "GET",
            "categories",
            200
        )
        
        category_found_in_list = False
        new_count = 0
        if success and response:
            try:
                categories_after_create = response.json()
                new_count = len(categories_after_create)
                
                # Check if count increased
                if new_count == initial_count + 1:
                    self.log_test("Categories Count After Creation", True, f"Count increased from {initial_count} to {new_count}")
                else:
                    self.log_test("Categories Count After Creation", False, f"Expected {initial_count + 1}, got {new_count}")
                
                # Check if our category is in the list
                if created_category_id:
                    category_found_in_list = any(cat.get('id') == created_category_id for cat in categories_after_create)
                    if category_found_in_list:
                        self.log_test("New Category Found in List", True, f"Category {test_category_name} found in list")
                    else:
                        self.log_test("New Category Found in List", False, f"Category {test_category_name} NOT found in list")
                        # This addresses user issue: "kategori eklerken eklendi yazıyor ancak göstermiyor"
                        
            except Exception as e:
                self.log_test("Categories After Creation Parsing", False, f"Error: {e}")
        
        # Test 4: Cache consistency check - Multiple GET requests
        print("\n🔄 Step 4: Cache consistency check")
        for i in range(3):
            time.sleep(1)  # Small delay between requests
            success, response = self.run_test(
                f"GET Categories - Cache Check {i+1}",
                "GET",
                "categories",
                200
            )
            
            if success and response:
                try:
                    categories = response.json()
                    current_count = len(categories)
                    category_still_found = any(cat.get('id') == created_category_id for cat in categories) if created_category_id else False
                    
                    if current_count == new_count and category_still_found:
                        self.log_test(f"Cache Consistency Check {i+1}", True, f"Count: {current_count}, Category found: {category_still_found}")
                    else:
                        self.log_test(f"Cache Consistency Check {i+1}", False, f"Count: {current_count} (expected {new_count}), Category found: {category_still_found}")
                except Exception as e:
                    self.log_test(f"Cache Check {i+1}", False, f"Error: {e}")
        
        # Test 5: DELETE /api/categories/{id} - Delete the category
        print("\n🗑️ Step 5: Delete the created category")
        if created_category_id:
            success, response = self.run_test(
                "DELETE Category",
                "DELETE",
                f"categories/{created_category_id}",
                200
            )
            
            if success and response:
                try:
                    delete_response = response.json()
                    if delete_response.get('success'):
                        self.log_test("Category Deletion Success", True, f"Category deleted successfully")
                        
                        # Check for Turkish success message
                        message = delete_response.get('message', '')
                        if 'silindi' in message.lower() or 'başarıyla' in message.lower():
                            self.log_test("Turkish Delete Message", True, f"Message: {message}")
                        else:
                            self.log_test("Turkish Delete Message", False, f"Expected Turkish message, got: {message}")
                    else:
                        self.log_test("Category Deletion Success", False, "Delete response indicates failure")
                except Exception as e:
                    self.log_test("Category Deletion Response", False, f"Error parsing: {e}")
        else:
            self.log_test("Category Deletion", False, "No category ID to delete")
        
        # Test 6: GET /api/categories - Verify category is removed
        print("\n🔍 Step 6: Verify category is removed from list")
        success, response = self.run_test(
            "GET Categories - After Deletion",
            "GET",
            "categories",
            200
        )
        
        if success and response:
            try:
                categories_after_delete = response.json()
                final_count = len(categories_after_delete)
                
                # Check if count decreased
                if final_count == initial_count:
                    self.log_test("Categories Count After Deletion", True, f"Count returned to initial: {final_count}")
                else:
                    self.log_test("Categories Count After Deletion", False, f"Expected {initial_count}, got {final_count}")
                    # This addresses user issue: "sildiğimde silindi yazıyor ancak göstermeye devam ediyor"
                
                # Check if our category is still in the list (should NOT be)
                if created_category_id:
                    category_still_in_list = any(cat.get('id') == created_category_id for cat in categories_after_delete)
                    if not category_still_in_list:
                        self.log_test("Deleted Category Removed from List", True, f"Category {test_category_name} properly removed")
                    else:
                        self.log_test("Deleted Category Removed from List", False, f"Category {test_category_name} STILL in list after deletion")
                        # This is the exact issue user reported
                        
            except Exception as e:
                self.log_test("Categories After Deletion Parsing", False, f"Error: {e}")
        
        # Test 7: Cache invalidation check - Multiple GET requests after deletion
        print("\n🔄 Step 7: Cache invalidation check after deletion")
        for i in range(3):
            time.sleep(1)  # Small delay between requests
            success, response = self.run_test(
                f"GET Categories - Cache Invalidation Check {i+1}",
                "GET",
                "categories",
                200
            )
            
            if success and response:
                try:
                    categories = response.json()
                    current_count = len(categories)
                    category_still_found = any(cat.get('id') == created_category_id for cat in categories) if created_category_id else False
                    
                    if current_count == initial_count and not category_still_found:
                        self.log_test(f"Cache Invalidation Check {i+1}", True, f"Count: {current_count}, Category removed: {not category_still_found}")
                    else:
                        self.log_test(f"Cache Invalidation Check {i+1}", False, f"Count: {current_count} (expected {initial_count}), Category still found: {category_still_found}")
                except Exception as e:
                    self.log_test(f"Cache Invalidation Check {i+1}", False, f"Error: {e}")
        
        # Test 8: Error handling - Delete non-existent category
        print("\n❌ Step 8: Error handling - Delete non-existent category")
        fake_category_id = str(uuid.uuid4())
        success, response = self.run_test(
            "DELETE Non-existent Category",
            "DELETE",
            f"categories/{fake_category_id}",
            404
        )
        
        if success and response:
            try:
                error_response = response.json()
                if 'bulunamadı' in error_response.get('detail', '').lower():
                    self.log_test("404 Error Message in Turkish", True, f"Error: {error_response.get('detail')}")
                else:
                    self.log_test("404 Error Message in Turkish", False, f"Expected Turkish error, got: {error_response}")
            except Exception as e:
                self.log_test("404 Error Response", False, f"Error parsing: {e}")
        
        # Test 9: Validation - Create category with empty name
        print("\n❌ Step 9: Validation - Create category with empty name")
        invalid_category_data = {
            "name": "",
            "description": "Invalid category test"
        }
        
        success, response = self.run_test(
            "POST Categories - Empty Name Validation",
            "POST",
            "categories",
            422  # Expecting validation error
        )
        
        if success and response:
            try:
                error_response = response.json()
                self.log_test("Empty Name Validation", True, f"Validation error returned: {error_response}")
            except Exception as e:
                self.log_test("Empty Name Validation Response", False, f"Error parsing: {e}")
        
        return True

    def test_companies_crud_comprehensive(self):
        """Comprehensive test for Companies CRUD operations"""
        print("\n🔍 TESTING COMPANIES CRUD SYSTEM...")
        print("🎯 Focus: User reported issue - 'Firma eklerken sorun yok, silince silindi yazıyor ama göstermeye devam ediyor'")
        
        # Test 1: GET /api/companies - Initial state
        print("\n📋 Step 1: Get initial companies list")
        success, response = self.run_test(
            "GET Companies - Initial State",
            "GET",
            "companies",
            200
        )
        
        initial_companies = []
        initial_count = 0
        if success and response:
            try:
                initial_companies = response.json()
                initial_count = len(initial_companies)
                self.log_test("Initial Companies Count", True, f"Found {initial_count} companies")
                
                # Log existing companies for reference
                for comp in initial_companies[:5]:  # Show first 5
                    print(f"   🏢 Existing: {comp.get('name', 'Unknown')} (ID: {comp.get('id', 'Unknown')[:8]}...)")
                    
            except Exception as e:
                self.log_test("Initial Companies Parsing", False, f"Error: {e}")
        
        # Test 2: POST /api/companies - Create new company
        print("\n➕ Step 2: Create new company")
        test_company_name = f"Test Firma {datetime.now().strftime('%H%M%S')}"
        company_data = {
            "name": test_company_name
        }
        
        success, response = self.run_test(
            "POST Companies - Create New Company",
            "POST",
            "companies",
            200,
            data=company_data
        )
        
        created_company_id = None
        if success and response:
            try:
                company_response = response.json()
                created_company_id = company_response.get('id')
                if created_company_id:
                    self.created_companies.append(created_company_id)
                    self.log_test("Company Creation Success", True, f"Created company ID: {created_company_id}")
                    
                    # Verify response contains expected fields
                    expected_fields = ['id', 'name', 'created_at']
                    missing_fields = [field for field in expected_fields if field not in company_response]
                    if not missing_fields:
                        self.log_test("Company Response Structure", True, "All expected fields present")
                    else:
                        self.log_test("Company Response Structure", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test("Company Creation Success", False, "No company ID returned")
            except Exception as e:
                self.log_test("Company Creation Response", False, f"Error parsing: {e}")
        
        # Test 3: GET /api/companies - Verify new company appears
        print("\n🔍 Step 3: Verify new company appears in list")
        success, response = self.run_test(
            "GET Companies - After Creation",
            "GET",
            "companies",
            200
        )
        
        company_found_in_list = False
        new_count = 0
        if success and response:
            try:
                companies_after_create = response.json()
                new_count = len(companies_after_create)
                
                # Check if count increased
                if new_count == initial_count + 1:
                    self.log_test("Companies Count After Creation", True, f"Count increased from {initial_count} to {new_count}")
                else:
                    self.log_test("Companies Count After Creation", False, f"Expected {initial_count + 1}, got {new_count}")
                
                # Check if our company is in the list
                if created_company_id:
                    company_found_in_list = any(comp.get('id') == created_company_id for comp in companies_after_create)
                    if company_found_in_list:
                        self.log_test("New Company Found in List", True, f"Company {test_company_name} found in list")
                    else:
                        self.log_test("New Company Found in List", False, f"Company {test_company_name} NOT found in list")
                        
            except Exception as e:
                self.log_test("Companies After Creation Parsing", False, f"Error: {e}")
        
        # Test 4: Cache consistency check - Multiple GET requests
        print("\n🔄 Step 4: Cache consistency check")
        for i in range(3):
            time.sleep(1)  # Small delay between requests
            success, response = self.run_test(
                f"GET Companies - Cache Check {i+1}",
                "GET",
                "companies",
                200
            )
            
            if success and response:
                try:
                    companies = response.json()
                    current_count = len(companies)
                    company_still_found = any(comp.get('id') == created_company_id for comp in companies) if created_company_id else False
                    
                    if current_count == new_count and company_still_found:
                        self.log_test(f"Cache Consistency Check {i+1}", True, f"Count: {current_count}, Company found: {company_still_found}")
                    else:
                        self.log_test(f"Cache Consistency Check {i+1}", False, f"Count: {current_count} (expected {new_count}), Company found: {company_still_found}")
                except Exception as e:
                    self.log_test(f"Cache Check {i+1}", False, f"Error: {e}")
        
        # Test 5: DELETE /api/companies/{id} - Delete the company
        print("\n🗑️ Step 5: Delete the created company")
        if created_company_id:
            success, response = self.run_test(
                "DELETE Company",
                "DELETE",
                f"companies/{created_company_id}",
                200
            )
            
            if success and response:
                try:
                    delete_response = response.json()
                    if delete_response.get('success'):
                        self.log_test("Company Deletion Success", True, f"Company deleted successfully")
                        
                        # Check for Turkish success message
                        message = delete_response.get('message', '')
                        if 'silindi' in message.lower() or 'başarıyla' in message.lower():
                            self.log_test("Turkish Delete Message", True, f"Message: {message}")
                        else:
                            self.log_test("Turkish Delete Message", False, f"Expected Turkish message, got: {message}")
                    else:
                        self.log_test("Company Deletion Success", False, "Delete response indicates failure")
                except Exception as e:
                    self.log_test("Company Deletion Response", False, f"Error parsing: {e}")
        else:
            self.log_test("Company Deletion", False, "No company ID to delete")
        
        # Test 6: GET /api/companies - Verify company is removed
        print("\n🔍 Step 6: Verify company is removed from list")
        success, response = self.run_test(
            "GET Companies - After Deletion",
            "GET",
            "companies",
            200
        )
        
        if success and response:
            try:
                companies_after_delete = response.json()
                final_count = len(companies_after_delete)
                
                # Check if count decreased
                if final_count == initial_count:
                    self.log_test("Companies Count After Deletion", True, f"Count returned to initial: {final_count}")
                else:
                    self.log_test("Companies Count After Deletion", False, f"Expected {initial_count}, got {final_count}")
                    # This addresses user issue: "silince silindi yazıyor ama göstermeye devam ediyor"
                
                # Check if our company is still in the list (should NOT be)
                if created_company_id:
                    company_still_in_list = any(comp.get('id') == created_company_id for comp in companies_after_delete)
                    if not company_still_in_list:
                        self.log_test("Deleted Company Removed from List", True, f"Company {test_company_name} properly removed")
                    else:
                        self.log_test("Deleted Company Removed from List", False, f"Company {test_company_name} STILL in list after deletion")
                        # This is the exact issue user reported
                        
            except Exception as e:
                self.log_test("Companies After Deletion Parsing", False, f"Error: {e}")
        
        # Test 7: Cache invalidation check - Multiple GET requests after deletion
        print("\n🔄 Step 7: Cache invalidation check after deletion")
        for i in range(3):
            time.sleep(1)  # Small delay between requests
            success, response = self.run_test(
                f"GET Companies - Cache Invalidation Check {i+1}",
                "GET",
                "companies",
                200
            )
            
            if success and response:
                try:
                    companies = response.json()
                    current_count = len(companies)
                    company_still_found = any(comp.get('id') == created_company_id for comp in companies) if created_company_id else False
                    
                    if current_count == initial_count and not company_still_found:
                        self.log_test(f"Cache Invalidation Check {i+1}", True, f"Count: {current_count}, Company removed: {not company_still_found}")
                    else:
                        self.log_test(f"Cache Invalidation Check {i+1}", False, f"Count: {current_count} (expected {initial_count}), Company still found: {company_still_found}")
                except Exception as e:
                    self.log_test(f"Cache Invalidation Check {i+1}", False, f"Error: {e}")
        
        # Test 8: Error handling - Delete non-existent company
        print("\n❌ Step 8: Error handling - Delete non-existent company")
        fake_company_id = str(uuid.uuid4())
        success, response = self.run_test(
            "DELETE Non-existent Company",
            "DELETE",
            f"companies/{fake_company_id}",
            404
        )
        
        if success and response:
            try:
                error_response = response.json()
                if 'bulunamadı' in error_response.get('detail', '').lower():
                    self.log_test("404 Error Message in Turkish", True, f"Error: {error_response.get('detail')}")
                else:
                    self.log_test("404 Error Message in Turkish", False, f"Expected Turkish error, got: {error_response}")
            except Exception as e:
                self.log_test("404 Error Response", False, f"Error parsing: {e}")
        
        # Test 9: Validation - Create company with empty name
        print("\n❌ Step 9: Validation - Create company with empty name")
        invalid_company_data = {
            "name": ""
        }
        
        success, response = self.run_test(
            "POST Companies - Empty Name Validation",
            "POST",
            "companies",
            422,  # Expecting validation error
            data=invalid_company_data
        )
        
        if success and response:
            try:
                error_response = response.json()
                self.log_test("Empty Name Validation", True, f"Validation error returned: {error_response}")
            except Exception as e:
                self.log_test("Empty Name Validation Response", False, f"Error parsing: {e}")
        
        return True

    def test_database_persistence(self):
        """Test that CRUD operations are actually persisted in database"""
        print("\n🔍 TESTING DATABASE PERSISTENCE...")
        print("🎯 Focus: Verify changes are permanent in database, not just cache issues")
        
        # Create a category and company for persistence testing
        test_category_name = f"Persistence Test Kategori {datetime.now().strftime('%H%M%S')}"
        test_company_name = f"Persistence Test Firma {datetime.now().strftime('%H%M%S')}"
        
        # Create category
        success, response = self.run_test(
            "Create Category for Persistence Test",
            "POST",
            "categories",
            200,
            data={"name": test_category_name, "description": "Persistence test"}
        )
        
        persistence_category_id = None
        if success and response:
            try:
                category_response = response.json()
                persistence_category_id = category_response.get('id')
                if persistence_category_id:
                    self.created_categories.append(persistence_category_id)
                    self.log_test("Persistence Category Created", True, f"ID: {persistence_category_id}")
            except Exception as e:
                self.log_test("Persistence Category Creation", False, f"Error: {e}")
        
        # Create company
        success, response = self.run_test(
            "Create Company for Persistence Test",
            "POST",
            "companies",
            200,
            data={"name": test_company_name}
        )
        
        persistence_company_id = None
        if success and response:
            try:
                company_response = response.json()
                persistence_company_id = company_response.get('id')
                if persistence_company_id:
                    self.created_companies.append(persistence_company_id)
                    self.log_test("Persistence Company Created", True, f"ID: {persistence_company_id}")
            except Exception as e:
                self.log_test("Persistence Company Creation", False, f"Error: {e}")
        
        # Wait a moment to ensure database write
        time.sleep(2)
        
        # Verify both items exist in multiple requests (simulating different user sessions)
        for i in range(3):
            time.sleep(1)
            
            # Check category persistence
            if persistence_category_id:
                success, response = self.run_test(
                    f"Persistence Check Categories {i+1}",
                    "GET",
                    "categories",
                    200
                )
                
                if success and response:
                    try:
                        categories = response.json()
                        category_found = any(cat.get('id') == persistence_category_id for cat in categories)
                        self.log_test(f"Category Persistence Check {i+1}", category_found, f"Category found: {category_found}")
                    except Exception as e:
                        self.log_test(f"Category Persistence Check {i+1}", False, f"Error: {e}")
            
            # Check company persistence
            if persistence_company_id:
                success, response = self.run_test(
                    f"Persistence Check Companies {i+1}",
                    "GET",
                    "companies",
                    200
                )
                
                if success and response:
                    try:
                        companies = response.json()
                        company_found = any(comp.get('id') == persistence_company_id for comp in companies)
                        self.log_test(f"Company Persistence Check {i+1}", company_found, f"Company found: {company_found}")
                    except Exception as e:
                        self.log_test(f"Company Persistence Check {i+1}", False, f"Error: {e}")
        
        # Now delete both and verify deletion persistence
        if persistence_category_id:
            success, response = self.run_test(
                "Delete Persistence Test Category",
                "DELETE",
                f"categories/{persistence_category_id}",
                200
            )
            
            if success:
                self.log_test("Persistence Category Deletion", True, "Category deleted")
            
        if persistence_company_id:
            success, response = self.run_test(
                "Delete Persistence Test Company",
                "DELETE",
                f"companies/{persistence_company_id}",
                200
            )
            
            if success:
                self.log_test("Persistence Company Deletion", True, "Company deleted")
        
        # Wait for database write
        time.sleep(2)
        
        # Verify deletion persistence
        for i in range(3):
            time.sleep(1)
            
            # Check category deletion persistence
            if persistence_category_id:
                success, response = self.run_test(
                    f"Deletion Persistence Check Categories {i+1}",
                    "GET",
                    "categories",
                    200
                )
                
                if success and response:
                    try:
                        categories = response.json()
                        category_found = any(cat.get('id') == persistence_category_id for cat in categories)
                        self.log_test(f"Category Deletion Persistence Check {i+1}", not category_found, f"Category removed: {not category_found}")
                    except Exception as e:
                        self.log_test(f"Category Deletion Persistence Check {i+1}", False, f"Error: {e}")
            
            # Check company deletion persistence
            if persistence_company_id:
                success, response = self.run_test(
                    f"Deletion Persistence Check Companies {i+1}",
                    "GET",
                    "companies",
                    200
                )
                
                if success and response:
                    try:
                        companies = response.json()
                        company_found = any(comp.get('id') == persistence_company_id for comp in companies)
                        self.log_test(f"Company Deletion Persistence Check {i+1}", not company_found, f"Company removed: {not company_found}")
                    except Exception as e:
                        self.log_test(f"Company Deletion Persistence Check {i+1}", False, f"Error: {e}")
        
        return True

    def cleanup_test_data(self):
        """Clean up any test data created during testing"""
        print("\n🧹 CLEANING UP TEST DATA...")
        
        # Clean up categories
        for category_id in self.created_categories:
            try:
                success, response = self.run_test(
                    f"Cleanup Category {category_id[:8]}...",
                    "DELETE",
                    f"categories/{category_id}",
                    200
                )
            except:
                pass  # Ignore cleanup errors
        
        # Clean up companies
        for company_id in self.created_companies:
            try:
                success, response = self.run_test(
                    f"Cleanup Company {company_id[:8]}...",
                    "DELETE",
                    f"companies/{company_id}",
                    200
                )
            except:
                pass  # Ignore cleanup errors
        
        print(f"🧹 Cleanup completed: {len(self.created_categories)} categories, {len(self.created_companies)} companies")

    def run_all_tests(self):
        """Run all CRUD tests"""
        print("🚀 STARTING CATEGORIES AND COMPANIES CRUD COMPREHENSIVE TESTING")
        print("=" * 80)
        
        try:
            # Test Categories CRUD
            self.test_categories_crud_comprehensive()
            
            # Test Companies CRUD  
            self.test_companies_crud_comprehensive()
            
            # Test Database Persistence
            self.test_database_persistence()
            
        finally:
            # Always cleanup
            self.cleanup_test_data()
        
        # Print final summary
        print("\n" + "=" * 80)
        print("📊 FINAL TEST SUMMARY")
        print("=" * 80)
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        print(f"✅ Tests Passed: {self.tests_passed}")
        print(f"❌ Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"📊 Total Tests: {self.tests_run}")
        print(f"🎯 Success Rate: {success_rate:.1f}%")
        
        if success_rate >= 90:
            print("🎉 EXCELLENT: Categories and Companies CRUD system working well!")
        elif success_rate >= 75:
            print("✅ GOOD: Most functionality working, minor issues found")
        elif success_rate >= 50:
            print("⚠️ MODERATE: Some significant issues found")
        else:
            print("❌ CRITICAL: Major issues found in CRUD operations")
        
        print("\n🎯 USER ISSUES ADDRESSED:")
        print("   - 'Firma eklerken sorun yok, silince silindi yazıyor ama göstermeye devam ediyor'")
        print("   - 'Kategori kısmında kategori eklerken eklendi yazıyor ancak göstermiyor'")
        print("   - 'Mevcut kategorilerden sildiğimde silindi yazıyor ancak göstermeye devam ediyor'")
        
        return success_rate >= 75

if __name__ == "__main__":
    tester = CategoriesCompaniesCRUDTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)