#!/usr/bin/env python3
"""
Package Supplies Functionality Test Runner
Tests the fixed package supplies adding functionality specifically
"""

import sys
import os
sys.path.append('/app')

from backend_test import KaravanAPITester

def main():
    """Run only the package supplies functionality test"""
    print("🚀 Starting Package Supplies Functionality Test...")
    print("🌐 Testing API at: https://quotemate-3.preview.emergentagent.com/api")
    print("=" * 80)
    
    tester = KaravanAPITester()
    
    try:
        # Run only the package supplies test
        success = tester.test_package_supplies_functionality_comprehensive()
        
        if success:
            print("\n✅ Package Supplies Test Completed Successfully!")
        else:
            print("\n❌ Package Supplies Test Failed!")
            
    except KeyboardInterrupt:
        print("\n⚠️ Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
    finally:
        # Always cleanup
        tester.cleanup()
        
        # Print final results
        print("\n" + "=" * 80)
        print("📊 PACKAGE SUPPLIES TEST RESULTS")
        print("=" * 80)
        print(f"Total Tests Run: {tester.tests_run}")
        print(f"Tests Passed: {tester.tests_passed}")
        print(f"Tests Failed: {tester.tests_run - tester.tests_passed}")
        print(f"Success Rate: {(tester.tests_passed / tester.tests_run * 100):.1f}%" if tester.tests_run > 0 else "0.0%")
        
        if tester.tests_passed == tester.tests_run:
            print("🎉 ALL PACKAGE SUPPLIES TESTS PASSED!")
        else:
            print("⚠️ Some tests failed. Check the output above for details.")
        
        print("=" * 80)
        
        # Return success status for script exit code
        return tester.tests_passed == tester.tests_run

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)