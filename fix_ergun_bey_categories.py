#!/usr/bin/env python3
"""
Fix Ergün Bey Package Category Assignment
Assigns proper categories to all products in the Ergün Bey package
"""

import requests
import json
import sys

class ErgunBeyPackageFixer:
    def __init__(self, base_url="https://quotemate-3.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
    def log(self, message, success=True):
        """Log messages with status"""
        status = "✅" if success else "❌"
        print(f"{status} {message}")
        
    def get_ergun_bey_package(self):
        """Get the Ergün Bey package details"""
        try:
            # Get all packages
            response = self.session.get(f"{self.base_url}/packages")
            response.raise_for_status()
            packages = response.json()
            
            # Find Ergün Bey package
            ergun_bey_package = None
            for package in packages:
                if 'Ergün Bey' in package.get('name', ''):
                    ergun_bey_package = package
                    break
            
            if not ergun_bey_package:
                self.log("Ergün Bey package not found", False)
                return None
                
            package_id = ergun_bey_package['id']
            self.log(f"Found Ergün Bey package: {package_id}")
            
            # Get package details with products
            response = self.session.get(f"{self.base_url}/packages/{package_id}")
            response.raise_for_status()
            package_details = response.json()
            
            products = package_details.get('products', [])
            self.log(f"Package contains {len(products)} products")
            
            return package_details
            
        except Exception as e:
            self.log(f"Error getting package: {e}", False)
            return None
    
    def get_categories(self):
        """Get all available categories"""
        try:
            response = self.session.get(f"{self.base_url}/categories")
            response.raise_for_status()
            categories_list = response.json()
            
            # Create name to ID mapping
            categories = {}
            for category in categories_list:
                categories[category.get('name')] = category.get('id')
            
            self.log(f"Found {len(categories)} categories: {list(categories.keys())}")
            return categories
            
        except Exception as e:
            self.log(f"Error getting categories: {e}", False)
            return {}
    
    def categorize_product(self, product_name):
        """Determine the appropriate category for a product based on its name"""
        name_lower = product_name.lower()
        
        # Battery products (containing "akü", "ah", "amp")
        if any(keyword in name_lower for keyword in ['akü', 'ah', 'amp', 'battery', 'lityum']):
            return 'Akü'
        
        # Solar panel products (containing "panel", "solar", "güneş", "watt")
        elif any(keyword in name_lower for keyword in ['panel', 'solar', 'güneş', 'watt', 'w ', 'halfcut']):
            return 'Güneş Paneli'
        
        # Inverter products (containing "inverter", "sinüs")
        elif any(keyword in name_lower for keyword in ['inverter', 'sinüs', 'invertör', 'apex tam', 'fs ']):
            return 'İnverter'
        
        # MPPT products (containing "mppt", "regülatör")
        elif any(keyword in name_lower for keyword in ['mppt', 'regülatör', 'controller']):
            return 'MPPT Cihazları'
        
        # Cable products (containing "kablo")
        elif any(keyword in name_lower for keyword in ['kablo', 'cable']):
            return 'Sarf Malzemeleri'
        
        # Glass products
        elif any(keyword in name_lower for keyword in ['cam', 'glass']):
            return 'Camlar'
        
        # Hatch/vent products
        elif any(keyword in name_lower for keyword in ['heki', 'hatch', 'vent']):
            return 'Hekiler'
        
        # Fuse boxes, terminals, connectors - supplies
        elif any(keyword in name_lower for keyword in ['sigorta', 'terminal', 'konnektör', 'bara', 'fuse']):
            return 'Sarf Malzemeleri'
        
        # Default to supplies
        else:
            return 'Sarf Malzemeleri'
    
    def assign_category_to_product(self, product_id, category_id, product_name, category_name):
        """Assign a category to a specific product"""
        try:
            update_data = {"category_id": category_id}
            response = self.session.put(f"{self.base_url}/products/{product_id}", json=update_data)
            response.raise_for_status()
            
            self.log(f"Assigned '{product_name[:40]}...' → {category_name}")
            return True
            
        except Exception as e:
            self.log(f"Failed to assign '{product_name[:40]}...' → {category_name}: {e}", False)
            return False
    
    def fix_all_categories(self):
        """Fix categories for all products in Ergün Bey package"""
        print("🔧 Starting Ergün Bey Package Category Fix...")
        print("=" * 60)
        
        # Get package details
        package = self.get_ergun_bey_package()
        if not package:
            return False
        
        products = package.get('products', [])
        if not products:
            self.log("No products found in package", False)
            return False
        
        # Get available categories
        categories = self.get_categories()
        if not categories:
            return False
        
        # Check for required categories
        required_categories = ['Akü', 'Güneş Paneli', 'İnverter', 'MPPT Cihazları', 'Sarf Malzemeleri', 'Camlar', 'Hekiler']
        missing_categories = [cat for cat in required_categories if cat not in categories]
        
        if missing_categories:
            self.log(f"Missing required categories: {missing_categories}", False)
            return False
        
        print(f"\n🏷️ Analyzing and assigning categories for {len(products)} products...")
        print("-" * 60)
        
        successful_assignments = 0
        failed_assignments = 0
        
        for i, product in enumerate(products, 1):
            product_id = product.get('id')
            product_name = product.get('name', 'Unknown')
            current_category = product.get('category_id')
            
            # Skip if already has a category
            if current_category:
                self.log(f"[{i:2d}] '{product_name[:40]}...' already has category, skipping")
                continue
            
            # Determine appropriate category
            suggested_category_name = self.categorize_product(product_name)
            suggested_category_id = categories.get(suggested_category_name)
            
            if not suggested_category_id:
                self.log(f"[{i:2d}] No category ID found for '{suggested_category_name}'", False)
                failed_assignments += 1
                continue
            
            # Assign the category
            print(f"[{i:2d}] Processing: {product_name[:40]}...")
            if self.assign_category_to_product(product_id, suggested_category_id, product_name, suggested_category_name):
                successful_assignments += 1
            else:
                failed_assignments += 1
        
        print("\n" + "=" * 60)
        print("📊 CATEGORY ASSIGNMENT SUMMARY")
        print("=" * 60)
        print(f"Total products processed: {len(products)}")
        print(f"Successful assignments: {successful_assignments}")
        print(f"Failed assignments: {failed_assignments}")
        print(f"Success rate: {(successful_assignments / len(products) * 100):.1f}%")
        
        if successful_assignments > 0:
            print(f"\n✅ Successfully assigned categories to {successful_assignments} products!")
            print("🔍 Testing PDF generation...")
            
            # Test PDF generation
            package_id = package['id']
            try:
                # Test PDF with prices
                response = self.session.get(f"{self.base_url}/packages/{package_id}/pdf-with-prices", 
                                         headers={'Accept': 'application/pdf'})
                if response.status_code == 200:
                    self.log(f"PDF with prices generated successfully ({len(response.content)} bytes)")
                else:
                    self.log(f"PDF with prices failed: HTTP {response.status_code}", False)
                
                # Test PDF without prices
                response = self.session.get(f"{self.base_url}/packages/{package_id}/pdf-without-prices", 
                                         headers={'Accept': 'application/pdf'})
                if response.status_code == 200:
                    self.log(f"PDF without prices generated successfully ({len(response.content)} bytes)")
                else:
                    self.log(f"PDF without prices failed: HTTP {response.status_code}", False)
                    
            except Exception as e:
                self.log(f"PDF generation test failed: {e}", False)
        
        return successful_assignments > 0

def main():
    """Main function"""
    fixer = ErgunBeyPackageFixer()
    success = fixer.fix_all_categories()
    
    if success:
        print("\n🎉 Ergün Bey package category fix completed successfully!")
        print("📄 Products should now appear under proper category groups in PDF generation")
        return 0
    else:
        print("\n❌ Ergün Bey package category fix failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())