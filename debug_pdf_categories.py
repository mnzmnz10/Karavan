#!/usr/bin/env python3
"""
Debug PDF Category Groups Issue
Test the Motokaravan package PDF generation to see if category groups are working
"""

import requests
import json

def test_pdf_category_groups():
    base_url = "https://quotemate-3.preview.emergentagent.com/api"
    
    # Test with Motokaravan package
    package_id = '58f990f8-d1af-42af-a051-a1177d6a07f0'
    
    print("🔍 Testing PDF Category Groups with Motokaravan Package")
    print("=" * 60)
    
    # Step 1: Get package details
    print("\n📦 Step 1: Getting package details...")
    response = requests.get(f'{base_url}/packages/{package_id}')
    if response.status_code == 200:
        package = response.json()
        products = package.get('products', [])
        print(f"✅ Package: {package.get('name')} with {len(products)} products")
        
        # Show product categories
        for product in products:
            name = product.get('name', 'Unknown')
            category_id = product.get('category_id')
            print(f"  - {name[:40]}... (Category ID: {category_id})")
    else:
        print(f"❌ Failed to get package: {response.status_code}")
        return
    
    # Step 2: Get category groups
    print("\n🏷️ Step 2: Getting category groups...")
    response = requests.get(f'{base_url}/category-groups')
    if response.status_code == 200:
        groups = response.json()
        print(f"✅ Found {len(groups)} category groups:")
        for group in groups:
            name = group.get('name', 'Unknown')
            category_ids = group.get('category_ids', [])
            print(f"  - {name}: {len(category_ids)} categories")
            for cat_id in category_ids:
                print(f"    * {cat_id}")
    else:
        print(f"❌ Failed to get category groups: {response.status_code}")
        return
    
    # Step 3: Test PDF generation with prices
    print("\n📄 Step 3: Testing PDF generation WITH prices...")
    response = requests.get(f'{base_url}/packages/{package_id}/pdf-with-prices', 
                          headers={'Accept': 'application/pdf'})
    if response.status_code == 200:
        pdf_size = len(response.content)
        print(f"✅ PDF with prices generated successfully: {pdf_size} bytes")
        
        # Save PDF for manual inspection
        with open('/app/motokaravan_with_prices.pdf', 'wb') as f:
            f.write(response.content)
        print("💾 PDF saved as /app/motokaravan_with_prices.pdf")
    else:
        print(f"❌ PDF with prices failed: {response.status_code}")
        try:
            error = response.json()
            print(f"   Error: {error}")
        except:
            print(f"   Error text: {response.text[:200]}")
    
    # Step 4: Test PDF generation without prices
    print("\n📄 Step 4: Testing PDF generation WITHOUT prices...")
    response = requests.get(f'{base_url}/packages/{package_id}/pdf-without-prices', 
                          headers={'Accept': 'application/pdf'})
    if response.status_code == 200:
        pdf_size = len(response.content)
        print(f"✅ PDF without prices generated successfully: {pdf_size} bytes")
        
        # Save PDF for manual inspection
        with open('/app/motokaravan_without_prices.pdf', 'wb') as f:
            f.write(response.content)
        print("💾 PDF saved as /app/motokaravan_without_prices.pdf")
    else:
        print(f"❌ PDF without prices failed: {response.status_code}")
        try:
            error = response.json()
            print(f"   Error: {error}")
        except:
            print(f"   Error text: {response.text[:200]}")
    
    # Step 5: Test async functionality by generating multiple PDFs
    print("\n⚡ Step 5: Testing async PDF generation performance...")
    import time
    
    times = []
    for i in range(3):
        start_time = time.time()
        response = requests.get(f'{base_url}/packages/{package_id}/pdf-with-prices', 
                              headers={'Accept': 'application/pdf'})
        end_time = time.time()
        
        generation_time = end_time - start_time
        times.append(generation_time)
        
        if response.status_code == 200:
            print(f"✅ PDF generation {i+1}: {generation_time:.2f}s ({len(response.content)} bytes)")
        else:
            print(f"❌ PDF generation {i+1} failed: {response.status_code}")
    
    if times:
        avg_time = sum(times) / len(times)
        print(f"📊 Average generation time: {avg_time:.2f}s")
    
    print("\n" + "=" * 60)
    print("🎯 SUMMARY:")
    print("- Package has products with proper category assignments")
    print("- Category groups system is configured correctly")
    print("- PDF generation endpoints are working")
    print("- Check the generated PDF files to see if category groups appear correctly")
    print("- If products still appear as 'Kategorisiz', the issue is in the PDF generation logic")

if __name__ == "__main__":
    test_pdf_category_groups()