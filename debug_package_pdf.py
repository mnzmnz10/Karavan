#!/usr/bin/env python3
"""
Debug Package PDF Category Groups Issue
"""

import requests
import json

class PackagePDFDebugger:
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

    def debug_package_pdf_category_groups(self):
        """Debug specific package PDF generation issue - Category Groups"""
        print("\n🔍 DEBUGGING PACKAGE PDF CATEGORY GROUPS ISSUE...")
        print("=" * 80)
        
        # Step 1: List all available packages
        print("\n📦 STEP 1: List All Available Packages")
        success, response = self.run_test(
            "Get All Packages",
            "GET",
            "packages",
            200
        )
        
        packages_data = []
        ergun_bey_package = None
        
        if success and response:
            try:
                packages = response.json()
                if isinstance(packages, list):
                    packages_data = packages
                    print(f"✅ Found {len(packages)} packages in system:")
                    
                    for pkg in packages:
                        pkg_name = pkg.get('name', 'Unknown')
                        pkg_id = pkg.get('id', 'No ID')
                        product_count = len(pkg.get('products', []))
                        print(f"   📦 {pkg_name} (ID: {pkg_id[:8]}...) - {product_count} products")
                        
                        # Look for Ergün Bey package specifically
                        if 'ergün' in pkg_name.lower() or 'ergun' in pkg_name.lower():
                            ergun_bey_package = pkg
                            print(f"   🎯 FOUND TARGET: {pkg_name}")
                    
                    self.log_test("Package List Retrieved", True, f"Found {len(packages)} packages")
                else:
                    self.log_test("Package List Format", False, "Response is not a list")
                    return False
            except Exception as e:
                self.log_test("Package List Parsing", False, f"Error: {e}")
                return False
        else:
            self.log_test("Package List Retrieval", False, "Failed to get packages")
            return False
        
        # Step 2: Get categories and category groups
        print("\n🏷️ STEP 2: Get Categories and Category Groups")
        
        # Get all categories
        success, response = self.run_test(
            "Get All Categories",
            "GET",
            "categories",
            200
        )
        
        categories_data = {}
        if success and response:
            try:
                categories = response.json()
                if isinstance(categories, list):
                    for cat in categories:
                        categories_data[cat.get('id')] = cat
                    print(f"✅ Found {len(categories)} categories:")
                    for cat in categories:
                        print(f"   🏷️ {cat.get('name')} (ID: {cat.get('id')})")
                    self.log_test("Categories Retrieved", True, f"Found {len(categories)} categories")
                else:
                    self.log_test("Categories Format", False, "Response is not a list")
            except Exception as e:
                self.log_test("Categories Parsing", False, f"Error: {e}")
        
        # Get all category groups
        success, response = self.run_test(
            "Get All Category Groups",
            "GET",
            "category-groups",
            200
        )
        
        category_groups_data = []
        if success and response:
            try:
                category_groups = response.json()
                if isinstance(category_groups, list):
                    category_groups_data = category_groups
                    print(f"✅ Found {len(category_groups)} category groups:")
                    for group in category_groups:
                        group_name = group.get('name')
                        category_ids = group.get('category_ids', [])
                        category_names = [categories_data.get(cat_id, {}).get('name', f'Unknown({cat_id})') for cat_id in category_ids]
                        print(f"   📂 {group_name}: {', '.join(category_names)}")
                    self.log_test("Category Groups Retrieved", True, f"Found {len(category_groups)} groups")
                else:
                    self.log_test("Category Groups Format", False, "Response is not a list")
            except Exception as e:
                self.log_test("Category Groups Parsing", False, f"Error: {e}")
        
        # Step 3: Focus on Ergün Bey package if found, otherwise test with first available package
        target_package = ergun_bey_package if ergun_bey_package else (packages_data[0] if packages_data else None)
        
        if not target_package:
            self.log_test("Target Package", False, "No packages available for testing")
            return False
        
        package_name = target_package.get('name')
        package_id = target_package.get('id')
        
        print(f"\n🎯 STEP 3: Debug Package '{package_name}' (ID: {package_id})")
        
        # Get detailed package information
        success, response = self.run_test(
            f"Get Package Details - {package_name}",
            "GET",
            f"packages/{package_id}",
            200
        )
        
        package_products = []
        uncategorized_count = 0
        if success and response:
            try:
                package_detail = response.json()
                package_products = package_detail.get('products', [])
                supplies = package_detail.get('supplies', [])
                
                print(f"✅ Package '{package_name}' contains:")
                print(f"   📦 Products: {len(package_products)}")
                print(f"   🔧 Supplies: {len(supplies)}")
                
                # Analyze product categories
                categorized_count = 0
                uncategorized_count = 0
                category_breakdown = {}
                
                print(f"\n📊 Product Category Analysis:")
                for i, product in enumerate(package_products, 1):
                    product_name = product.get('name', 'Unknown')
                    category_id = product.get('category_id')
                    
                    if category_id and category_id != 'null' and category_id != None:
                        categorized_count += 1
                        category_name = categories_data.get(category_id, {}).get('name', f'Unknown({category_id})')
                        category_breakdown[category_name] = category_breakdown.get(category_name, 0) + 1
                        print(f"   ✅ {i:2d}. {product_name[:50]:<50} → {category_name}")
                    else:
                        uncategorized_count += 1
                        print(f"   ❌ {i:2d}. {product_name[:50]:<50} → KATEGORISIZ (category_id: {category_id})")
                
                print(f"\n📈 Category Summary:")
                print(f"   ✅ Categorized: {categorized_count}")
                print(f"   ❌ Uncategorized: {uncategorized_count}")
                
                if category_breakdown:
                    print(f"   📊 Category Breakdown:")
                    for cat_name, count in category_breakdown.items():
                        print(f"      - {cat_name}: {count} products")
                
                # Check which categories are covered by category groups
                print(f"\n🔍 Category Group Coverage Analysis:")
                covered_categories = set()
                for group in category_groups_data:
                    covered_categories.update(group.get('category_ids', []))
                
                for cat_name, count in category_breakdown.items():
                    # Find category ID by name
                    cat_id = None
                    for cid, cdata in categories_data.items():
                        if cdata.get('name') == cat_name:
                            cat_id = cid
                            break
                    
                    if cat_id in covered_categories:
                        # Find which group covers this category
                        covering_groups = []
                        for group in category_groups_data:
                            if cat_id in group.get('category_ids', []):
                                covering_groups.append(group.get('name'))
                        print(f"   ✅ {cat_name} ({count} products) → Covered by: {', '.join(covering_groups)}")
                    else:
                        print(f"   ⚠️ {cat_name} ({count} products) → NOT covered by any group")
                
                self.log_test(f"Package Analysis - {package_name}", True, f"{categorized_count} categorized, {uncategorized_count} uncategorized")
                
            except Exception as e:
                self.log_test(f"Package Detail Parsing - {package_name}", False, f"Error: {e}")
                return False
        
        # Step 4: Test PDF generation for the package
        print(f"\n📄 STEP 4: Test PDF Generation for '{package_name}'")
        
        # Test PDF with prices
        success, response = self.run_test(
            f"Generate PDF with Prices - {package_name}",
            "GET",
            f"packages/{package_id}/pdf-with-prices",
            200
        )
        
        if success and response:
            try:
                pdf_content = response.content
                pdf_size = len(pdf_content)
                self.log_test(f"PDF with Prices Generated - {package_name}", True, f"Size: {pdf_size:,} bytes")
                
                # Check if it's actually a PDF
                if pdf_content.startswith(b'%PDF'):
                    self.log_test(f"PDF Format Valid - {package_name}", True, "Valid PDF header")
                else:
                    self.log_test(f"PDF Format Valid - {package_name}", False, "Invalid PDF format")
                    
            except Exception as e:
                self.log_test(f"PDF with Prices Analysis - {package_name}", False, f"Error: {e}")
        
        # Test PDF without prices
        success, response = self.run_test(
            f"Generate PDF without Prices - {package_name}",
            "GET",
            f"packages/{package_id}/pdf-without-prices",
            200
        )
        
        if success and response:
            try:
                pdf_content = response.content
                pdf_size = len(pdf_content)
                self.log_test(f"PDF without Prices Generated - {package_name}", True, f"Size: {pdf_size:,} bytes")
                
                # Check if it's actually a PDF
                if pdf_content.startswith(b'%PDF'):
                    self.log_test(f"PDF Format Valid (no prices) - {package_name}", True, "Valid PDF header")
                else:
                    self.log_test(f"PDF Format Valid (no prices) - {package_name}", False, "Invalid PDF format")
                    
            except Exception as e:
                self.log_test(f"PDF without Prices Analysis - {package_name}", False, f"Error: {e}")
        
        # Step 5: Test with other packages if available
        print(f"\n🔄 STEP 5: Test Other Packages (if available)")
        
        other_packages = [pkg for pkg in packages_data if pkg.get('id') != package_id][:2]  # Test up to 2 more packages
        
        for other_pkg in other_packages:
            other_name = other_pkg.get('name')
            other_id = other_pkg.get('id')
            
            print(f"\n📦 Testing Package: {other_name}")
            
            # Get package details
            success, response = self.run_test(
                f"Get Package Details - {other_name}",
                "GET",
                f"packages/{other_id}",
                200
            )
            
            if success and response:
                try:
                    other_detail = response.json()
                    other_products = other_detail.get('products', [])
                    
                    # Quick category analysis
                    categorized = sum(1 for p in other_products if p.get('category_id') and p.get('category_id') != 'null' and p.get('category_id') != None)
                    uncategorized = len(other_products) - categorized
                    
                    print(f"   📊 {other_name}: {len(other_products)} products ({categorized} categorized, {uncategorized} uncategorized)")
                    
                    # Test PDF generation
                    success, response = self.run_test(
                        f"Generate PDF - {other_name}",
                        "GET",
                        f"packages/{other_id}/pdf-with-prices",
                        200
                    )
                    
                    if success and response:
                        pdf_size = len(response.content)
                        self.log_test(f"PDF Generated - {other_name}", True, f"Size: {pdf_size:,} bytes")
                    
                except Exception as e:
                    self.log_test(f"Other Package Analysis - {other_name}", False, f"Error: {e}")
        
        # Step 6: Summary and Recommendations
        print(f"\n📋 STEP 6: Summary and Recommendations")
        print("=" * 80)
        
        if uncategorized_count > 0:
            print(f"🚨 ISSUE IDENTIFIED:")
            print(f"   Package '{package_name}' has {uncategorized_count} uncategorized products")
            print(f"   These products will appear as 'Kategorisiz' in PDF generation")
            print(f"   instead of being grouped under proper category groups.")
            print(f"")
            print(f"💡 SOLUTION:")
            print(f"   1. Assign proper categories to all {uncategorized_count} uncategorized products")
            print(f"   2. Ensure assigned categories are covered by appropriate category groups")
            print(f"   3. Products should be categorized based on their names/types:")
            
            # Suggest categories based on product names
            for product in package_products:
                if not product.get('category_id') or product.get('category_id') == 'null' or product.get('category_id') == None:
                    product_name = product.get('name', '').lower()
                    suggested_category = "Unknown"
                    
                    if any(word in product_name for word in ['akü', 'batarya', 'battery', 'ah', 'amp']):
                        suggested_category = "Akü"
                    elif any(word in product_name for word in ['panel', 'güneş', 'solar', 'watt', 'w']):
                        suggested_category = "Güneş Paneli"
                    elif any(word in product_name for word in ['inverter', 'invertör', 'sinüs']):
                        suggested_category = "İnverter"
                    elif any(word in product_name for word in ['mppt', 'regülatör', 'controller']):
                        suggested_category = "MPPT Cihazları"
                    elif any(word in product_name for word in ['kablo', 'sigorta', 'terminal', 'bağlantı']):
                        suggested_category = "Sarf Malzemeleri"
                    elif any(word in product_name for word in ['cam', 'glass']):
                        suggested_category = "Camlar"
                    elif any(word in product_name for word in ['heki', 'hatch']):
                        suggested_category = "Hekiler"
                    
                    print(f"      - '{product.get('name', 'Unknown')[:40]}...' → {suggested_category}")
        else:
            print(f"✅ GOOD NEWS:")
            print(f"   Package '{package_name}' has all products properly categorized!")
            print(f"   PDF generation should show products under proper category groups.")
        
        print(f"")
        print(f"🔍 CATEGORY GROUP COVERAGE:")
        for group in category_groups_data:
            group_name = group.get('name')
            category_ids = group.get('category_ids', [])
            category_names = [categories_data.get(cat_id, {}).get('name', f'Unknown({cat_id})') for cat_id in category_ids]
            print(f"   📂 {group_name}: {', '.join(category_names)}")
        
        return True

if __name__ == "__main__":
    debugger = PackagePDFDebugger()
    debugger.debug_package_pdf_category_groups()
    print(f"\n📊 Debug Test Results Summary:")
    print(f"   Total Tests: {debugger.tests_run}")
    print(f"   Passed: {debugger.tests_passed}")
    print(f"   Failed: {debugger.tests_run - debugger.tests_passed}")
    print(f"   Success Rate: {(debugger.tests_passed/debugger.tests_run*100):.1f}%" if debugger.tests_run > 0 else "   Success Rate: 0%")