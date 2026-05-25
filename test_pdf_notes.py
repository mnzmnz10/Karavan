#!/usr/bin/env python3
"""
PDF Generation with Notes Testing Script
Focus on testing PDF generation functionality with notes after recent fixes
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend_test import KaravanAPITester

def main():
    """Run PDF generation with notes testing"""
    print("🚀 Starting PDF Generation with Notes Testing")
    print("=" * 80)
    
    tester = KaravanAPITester()
    
    try:
        # Run the specific PDF notes test
        success = tester.test_pdf_generation_with_notes_comprehensive()
        
        # Print final results
        print("\n" + "=" * 80)
        print("📊 PDF GENERATION WITH NOTES TEST SUMMARY")
        print("=" * 80)
        print(f"Total Tests Run: {tester.tests_run}")
        print(f"Tests Passed: {tester.tests_passed}")
        print(f"Tests Failed: {tester.tests_run - tester.tests_passed}")
        print(f"Success Rate: {(tester.tests_passed / tester.tests_run * 100):.1f}%")
        
        if success and tester.tests_passed == tester.tests_run:
            print("✅ PDF GENERATION WITH NOTES TEST COMPLETED SUCCESSFULLY")
            return 0
        else:
            print("❌ PDF GENERATION WITH NOTES TEST COMPLETED WITH ISSUES")
            return 1
            
    except Exception as e:
        print(f"❌ Test execution failed: {e}")
        return 1
    finally:
        # Cleanup
        print("\n🧹 Cleaning up test data...")
        try:
            tester.cleanup()
        except:
            pass

if __name__ == "__main__":
    sys.exit(main())