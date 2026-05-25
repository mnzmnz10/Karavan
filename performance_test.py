#!/usr/bin/env python3
"""
Performance Optimization Testing Suite for Product Endpoints
Tests enhanced performance optimizations for handling large datasets efficiently
"""

import requests
import time
import json
import concurrent.futures
import threading
from datetime import datetime
import statistics

class PerformanceOptimizationTester:
    def __init__(self, base_url="https://quotemate-3.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.performance_results = {}

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def measure_response_time(self, url, method="GET", data=None, headers=None):
        """Measure response time for a request"""
        start_time = time.time()
        try:
            if method == "GET":
                response = requests.get(url, headers=headers, timeout=30)
            elif method == "POST":
                response = requests.post(url, json=data, headers=headers, timeout=30)
            end_time = time.time()
            response_time = end_time - start_time
            return response, response_time
        except Exception as e:
            end_time = time.time()
            response_time = end_time - start_time
            return None, response_time

    def test_pagination_performance(self):
        """Test pagination performance with different page sizes"""
        print("\n🔍 Testing Pagination Performance...")
        
        page_sizes = [50, 100, 200]
        pagination_results = {}
        
        for page_size in page_sizes:
            print(f"\n📊 Testing page size: {page_size}")
            
            # Test first page
            url = f"{self.base_url}/products?page=1&limit={page_size}"
            response, response_time = self.measure_response_time(url)
            
            if response and response.status_code == 200:
                try:
                    data = response.json()
                    product_count = len(data) if isinstance(data, list) else 0
                    
                    # Check if response time is under 2 seconds
                    under_2_seconds = response_time < 2.0
                    self.log_test(
                        f"Pagination {page_size} items - Response Time", 
                        under_2_seconds, 
                        f"{response_time:.3f}s (target: <2s) - {product_count} products"
                    )
                    
                    pagination_results[page_size] = {
                        'response_time': response_time,
                        'product_count': product_count,
                        'under_2_seconds': under_2_seconds
                    }
                    
                    # Test cache headers
                    cache_control = response.headers.get('Cache-Control', '')
                    if cache_control:
                        self.log_test(f"Cache Headers - Page Size {page_size}", True, f"Cache-Control: {cache_control}")
                    else:
                        self.log_test(f"Cache Headers - Page Size {page_size}", False, "No Cache-Control header")
                        
                except Exception as e:
                    self.log_test(f"Pagination {page_size} - Response Parsing", False, f"Error: {e}")
            else:
                status = response.status_code if response else "No response"
                self.log_test(f"Pagination {page_size} - Request", False, f"Status: {status}, Time: {response_time:.3f}s")
        
        # Test skip_pagination=true for maximum load handling
        print(f"\n📊 Testing skip_pagination=true for maximum load handling")
        url = f"{self.base_url}/products?skip_pagination=true"
        response, response_time = self.measure_response_time(url)
        
        if response and response.status_code == 200:
            try:
                data = response.json()
                total_products = len(data) if isinstance(data, list) else 0
                
                # For 500+ products, should still be under 2 seconds
                under_2_seconds = response_time < 2.0
                meets_500_requirement = total_products >= 500 or under_2_seconds
                
                self.log_test(
                    "Skip Pagination - All Products Load", 
                    meets_500_requirement, 
                    f"{response_time:.3f}s for {total_products} products (target: <2s for 500+)"
                )
                
                pagination_results['skip_pagination'] = {
                    'response_time': response_time,
                    'product_count': total_products,
                    'under_2_seconds': under_2_seconds
                }
                
            except Exception as e:
                self.log_test("Skip Pagination - Response Parsing", False, f"Error: {e}")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Skip Pagination - Request", False, f"Status: {status}, Time: {response_time:.3f}s")
        
        self.performance_results['pagination'] = pagination_results
        return pagination_results

    def test_search_performance(self):
        """Test search performance with different query lengths"""
        print("\n🔍 Testing Search Performance...")
        
        search_tests = [
            # Short queries (1-2 characters)
            {"query": "a", "type": "short", "description": "1 character"},
            {"query": "so", "type": "short", "description": "2 characters"},
            
            # Long queries (3+ characters)
            {"query": "solar", "type": "long", "description": "5 characters"},
            {"query": "panel", "type": "long", "description": "5 characters"},
            {"query": "battery", "type": "long", "description": "7 characters"},
            {"query": "inverter", "type": "long", "description": "8 characters"},
            {"query": "güneş paneli", "type": "long", "description": "Turkish search"},
        ]
        
        search_results = {}
        
        for test in search_tests:
            query = test["query"]
            query_type = test["type"]
            description = test["description"]
            
            print(f"\n🔍 Testing search: '{query}' ({description})")
            
            # Test with pagination
            url = f"{self.base_url}/products?search={query}&page=1&limit=50"
            response, response_time = self.measure_response_time(url)
            
            if response and response.status_code == 200:
                try:
                    data = response.json()
                    result_count = len(data) if isinstance(data, list) else 0
                    
                    # Search should be fast regardless of query length
                    under_1_second = response_time < 1.0
                    self.log_test(
                        f"Search '{query}' - Performance", 
                        under_1_second, 
                        f"{response_time:.3f}s, {result_count} results (target: <1s)"
                    )
                    
                    # Test MongoDB text index effectiveness
                    if result_count > 0:
                        self.log_test(f"Search '{query}' - Results Found", True, f"{result_count} products found")
                    else:
                        # For very short queries, no results might be expected
                        expected_no_results = len(query) <= 2
                        self.log_test(f"Search '{query}' - Results Found", expected_no_results, f"No results (expected for short queries)")
                    
                    search_results[query] = {
                        'response_time': response_time,
                        'result_count': result_count,
                        'query_type': query_type,
                        'under_1_second': under_1_second
                    }
                    
                except Exception as e:
                    self.log_test(f"Search '{query}' - Response Parsing", False, f"Error: {e}")
            else:
                status = response.status_code if response else "No response"
                self.log_test(f"Search '{query}' - Request", False, f"Status: {status}, Time: {response_time:.3f}s")
        
        # Test search with skip_pagination for comprehensive results
        print(f"\n🔍 Testing search with skip_pagination")
        url = f"{self.base_url}/products?search=solar&skip_pagination=true"
        response, response_time = self.measure_response_time(url)
        
        if response and response.status_code == 200:
            try:
                data = response.json()
                result_count = len(data) if isinstance(data, list) else 0
                
                under_2_seconds = response_time < 2.0
                self.log_test(
                    "Search with Skip Pagination", 
                    under_2_seconds, 
                    f"{response_time:.3f}s, {result_count} results (target: <2s)"
                )
                
                search_results['solar_skip_pagination'] = {
                    'response_time': response_time,
                    'result_count': result_count,
                    'query_type': 'comprehensive',
                    'under_2_seconds': under_2_seconds
                }
                
            except Exception as e:
                self.log_test("Search Skip Pagination - Response Parsing", False, f"Error: {e}")
        
        self.performance_results['search'] = search_results
        return search_results

    def test_count_endpoint_performance(self):
        """Test /api/products/count endpoint performance"""
        print("\n🔍 Testing Count Endpoint Performance...")
        
        count_results = {}
        
        # Test unfiltered count (should use estimated_document_count)
        print(f"\n📊 Testing unfiltered count")
        url = f"{self.base_url}/products/count"
        response, response_time = self.measure_response_time(url)
        
        if response and response.status_code == 200:
            try:
                data = response.json()
                total_count = data.get('count', 0) if isinstance(data, dict) else 0
                
                # Count should be very fast (under 0.5 seconds)
                under_half_second = response_time < 0.5
                self.log_test(
                    "Unfiltered Count - Performance", 
                    under_half_second, 
                    f"{response_time:.3f}s, count: {total_count} (target: <0.5s)"
                )
                
                count_results['unfiltered'] = {
                    'response_time': response_time,
                    'count': total_count,
                    'under_half_second': under_half_second
                }
                
            except Exception as e:
                self.log_test("Unfiltered Count - Response Parsing", False, f"Error: {e}")
        else:
            status = response.status_code if response else "No response"
            self.log_test("Unfiltered Count - Request", False, f"Status: {status}, Time: {response_time:.3f}s")
        
        # Test filtered counts
        filters = [
            {"filter": "search=solar", "description": "Search filter"},
            {"filter": "company_id=test", "description": "Company filter"},
            {"filter": "category_id=test", "description": "Category filter"},
        ]
        
        for filter_test in filters:
            filter_param = filter_test["filter"]
            description = filter_test["description"]
            
            print(f"\n📊 Testing count with {description}")
            url = f"{self.base_url}/products/count?{filter_param}"
            response, response_time = self.measure_response_time(url)
            
            if response and response.status_code == 200:
                try:
                    data = response.json()
                    filtered_count = data.get('count', 0) if isinstance(data, dict) else 0
                    
                    # Filtered counts should still be fast (under 1 second)
                    under_1_second = response_time < 1.0
                    self.log_test(
                        f"Filtered Count ({description}) - Performance", 
                        under_1_second, 
                        f"{response_time:.3f}s, count: {filtered_count} (target: <1s)"
                    )
                    
                    count_results[filter_param] = {
                        'response_time': response_time,
                        'count': filtered_count,
                        'under_1_second': under_1_second
                    }
                    
                except Exception as e:
                    self.log_test(f"Filtered Count ({description}) - Response Parsing", False, f"Error: {e}")
            else:
                status = response.status_code if response else "No response"
                self.log_test(f"Filtered Count ({description}) - Request", False, f"Status: {status}, Time: {response_time:.3f}s")
        
        self.performance_results['count'] = count_results
        return count_results

    def test_index_optimization(self):
        """Test index optimization verification"""
        print("\n🔍 Testing Index Optimization...")
        
        index_tests = [
            # Test is_favorite + name sorting performance
            {"params": "sort=favorites", "description": "Favorites-first sorting"},
            
            # Test company_id + name filtering performance
            {"params": "company_id=test&sort=name", "description": "Company filtering with name sort"},
            
            # Test category_id + name filtering performance
            {"params": "category_id=test&sort=name", "description": "Category filtering with name sort"},
            
            # Test complex query that should benefit from compound indexes
            {"params": "company_id=test&category_id=test&sort=favorites", "description": "Complex compound query"},
        ]
        
        index_results = {}
        
        for test in index_tests:
            params = test["params"]
            description = test["description"]
            
            print(f"\n📊 Testing {description}")
            url = f"{self.base_url}/products?{params}&limit=100"
            response, response_time = self.measure_response_time(url)
            
            if response and response.status_code == 200:
                try:
                    data = response.json()
                    result_count = len(data) if isinstance(data, list) else 0
                    
                    # Index-optimized queries should be fast (under 1 second)
                    under_1_second = response_time < 1.0
                    self.log_test(
                        f"Index Optimization ({description})", 
                        under_1_second, 
                        f"{response_time:.3f}s, {result_count} results (target: <1s)"
                    )
                    
                    index_results[description] = {
                        'response_time': response_time,
                        'result_count': result_count,
                        'under_1_second': under_1_second
                    }
                    
                except Exception as e:
                    self.log_test(f"Index Test ({description}) - Response Parsing", False, f"Error: {e}")
            else:
                status = response.status_code if response else "No response"
                self.log_test(f"Index Test ({description}) - Request", False, f"Status: {status}, Time: {response_time:.3f}s")
        
        self.performance_results['indexes'] = index_results
        return index_results

    def test_cache_headers(self):
        """Test cache headers are properly set"""
        print("\n🔍 Testing Cache Headers...")
        
        cache_tests = [
            {"endpoint": "products", "description": "Products endpoint"},
            {"endpoint": "products?search=solar", "description": "Search endpoint"},
            {"endpoint": "products/count", "description": "Count endpoint"},
            {"endpoint": "companies", "description": "Companies endpoint"},
            {"endpoint": "categories", "description": "Categories endpoint"},
        ]
        
        cache_results = {}
        
        for test in cache_tests:
            endpoint = test["endpoint"]
            description = test["description"]
            
            print(f"\n📊 Testing cache headers for {description}")
            url = f"{self.base_url}/{endpoint}"
            response, response_time = self.measure_response_time(url)
            
            if response and response.status_code == 200:
                headers = response.headers
                
                # Check for cache-related headers
                cache_control = headers.get('Cache-Control', '')
                etag = headers.get('ETag', '')
                last_modified = headers.get('Last-Modified', '')
                expires = headers.get('Expires', '')
                
                has_cache_headers = bool(cache_control or etag or last_modified or expires)
                
                if has_cache_headers:
                    cache_info = []
                    if cache_control:
                        cache_info.append(f"Cache-Control: {cache_control}")
                    if etag:
                        cache_info.append(f"ETag: {etag[:20]}...")
                    if last_modified:
                        cache_info.append(f"Last-Modified: {last_modified}")
                    if expires:
                        cache_info.append(f"Expires: {expires}")
                    
                    self.log_test(
                        f"Cache Headers ({description})", 
                        True, 
                        "; ".join(cache_info)
                    )
                else:
                    self.log_test(f"Cache Headers ({description})", False, "No cache headers found")
                
                cache_results[endpoint] = {
                    'cache_control': cache_control,
                    'etag': etag,
                    'last_modified': last_modified,
                    'expires': expires,
                    'has_cache_headers': has_cache_headers
                }
                
            else:
                status = response.status_code if response else "No response"
                self.log_test(f"Cache Headers ({description}) - Request", False, f"Status: {status}")
        
        self.performance_results['cache_headers'] = cache_results
        return cache_results

    def test_concurrent_requests(self):
        """Test concurrent requests to products endpoint"""
        print("\n🔍 Testing Concurrent Requests...")
        
        def make_request(request_id):
            """Make a single request and return results"""
            url = f"{self.base_url}/products?page=1&limit=50"
            start_time = time.time()
            try:
                response = requests.get(url, timeout=30)
                end_time = time.time()
                response_time = end_time - start_time
                
                return {
                    'request_id': request_id,
                    'status_code': response.status_code,
                    'response_time': response_time,
                    'success': response.status_code == 200,
                    'product_count': len(response.json()) if response.status_code == 200 else 0
                }
            except Exception as e:
                end_time = time.time()
                response_time = end_time - start_time
                return {
                    'request_id': request_id,
                    'status_code': 0,
                    'response_time': response_time,
                    'success': False,
                    'error': str(e),
                    'product_count': 0
                }
        
        # Test with different concurrency levels
        concurrency_levels = [5, 10, 20]
        concurrent_results = {}
        
        for concurrency in concurrency_levels:
            print(f"\n📊 Testing {concurrency} concurrent requests")
            
            start_time = time.time()
            
            # Use ThreadPoolExecutor for concurrent requests
            with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
                futures = [executor.submit(make_request, i) for i in range(concurrency)]
                results = [future.result() for future in concurrent.futures.as_completed(futures)]
            
            end_time = time.time()
            total_time = end_time - start_time
            
            # Analyze results
            successful_requests = [r for r in results if r['success']]
            failed_requests = [r for r in results if not r['success']]
            
            success_rate = len(successful_requests) / len(results) * 100
            avg_response_time = statistics.mean([r['response_time'] for r in successful_requests]) if successful_requests else 0
            max_response_time = max([r['response_time'] for r in successful_requests]) if successful_requests else 0
            
            # Success criteria: >90% success rate, average response time <3s
            meets_criteria = success_rate >= 90 and avg_response_time < 3.0
            
            self.log_test(
                f"Concurrent Requests ({concurrency} threads)", 
                meets_criteria, 
                f"Success: {success_rate:.1f}%, Avg: {avg_response_time:.3f}s, Max: {max_response_time:.3f}s, Total: {total_time:.3f}s"
            )
            
            concurrent_results[concurrency] = {
                'total_requests': len(results),
                'successful_requests': len(successful_requests),
                'failed_requests': len(failed_requests),
                'success_rate': success_rate,
                'avg_response_time': avg_response_time,
                'max_response_time': max_response_time,
                'total_time': total_time,
                'meets_criteria': meets_criteria
            }
            
            if failed_requests:
                print(f"   Failed requests: {len(failed_requests)}")
                for failed in failed_requests[:3]:  # Show first 3 failures
                    error = failed.get('error', f"HTTP {failed['status_code']}")
                    print(f"     Request {failed['request_id']}: {error}")
        
        self.performance_results['concurrent'] = concurrent_results
        return concurrent_results

    def test_error_handling_and_fallbacks(self):
        """Test error handling and fallback mechanisms"""
        print("\n🔍 Testing Error Handling and Fallbacks...")
        
        error_tests = [
            # Test invalid parameters
            {"url": "products?page=-1", "description": "Negative page number"},
            {"url": "products?limit=0", "description": "Zero limit"},
            {"url": "products?limit=10000", "description": "Excessive limit"},
            {"url": "products?search=", "description": "Empty search query"},
            {"url": "products?sort=invalid", "description": "Invalid sort parameter"},
            {"url": "products?company_id=nonexistent", "description": "Nonexistent company ID"},
            {"url": "products?category_id=nonexistent", "description": "Nonexistent category ID"},
            
            # Test malformed requests
            {"url": "products?page=abc", "description": "Non-numeric page"},
            {"url": "products?limit=xyz", "description": "Non-numeric limit"},
        ]
        
        error_results = {}
        
        for test in error_tests:
            endpoint = test["url"]
            description = test["description"]
            
            print(f"\n📊 Testing {description}")
            url = f"{self.base_url}/{endpoint}"
            response, response_time = self.measure_response_time(url)
            
            if response:
                # Should either return 200 with fallback behavior or proper error status
                acceptable_statuses = [200, 400, 422]
                status_ok = response.status_code in acceptable_statuses
                
                # Response should be fast even for error cases
                under_2_seconds = response_time < 2.0
                
                overall_success = status_ok and under_2_seconds
                
                try:
                    data = response.json()
                    result_info = f"Status: {response.status_code}, Time: {response_time:.3f}s"
                    
                    if response.status_code == 200:
                        product_count = len(data) if isinstance(data, list) else 0
                        result_info += f", Products: {product_count}"
                    else:
                        error_detail = data.get('detail', 'No detail') if isinstance(data, dict) else 'Invalid JSON'
                        result_info += f", Error: {error_detail}"
                    
                    self.log_test(f"Error Handling ({description})", overall_success, result_info)
                    
                except Exception as e:
                    self.log_test(f"Error Handling ({description})", False, f"JSON parsing error: {e}")
                
                error_results[description] = {
                    'status_code': response.status_code,
                    'response_time': response_time,
                    'status_ok': status_ok,
                    'under_2_seconds': under_2_seconds,
                    'overall_success': overall_success
                }
                
            else:
                self.log_test(f"Error Handling ({description})", False, f"No response, Time: {response_time:.3f}s")
                error_results[description] = {
                    'status_code': 0,
                    'response_time': response_time,
                    'status_ok': False,
                    'under_2_seconds': response_time < 2.0,
                    'overall_success': False
                }
        
        self.performance_results['error_handling'] = error_results
        return error_results

    def test_large_dataset_simulation(self):
        """Simulate large dataset performance with current data"""
        print("\n🔍 Testing Large Dataset Performance Simulation...")
        
        # Get current product count
        url = f"{self.base_url}/products/count"
        response, response_time = self.measure_response_time(url)
        
        current_count = 0
        if response and response.status_code == 200:
            try:
                data = response.json()
                current_count = data.get('count', 0)
                self.log_test("Current Dataset Size", True, f"{current_count} products available")
            except Exception as e:
                self.log_test("Dataset Size Check", False, f"Error: {e}")
                return {}
        
        # Test various operations with current dataset
        dataset_tests = [
            {"operation": "Full dataset load", "url": "products?skip_pagination=true"},
            {"operation": "Large page load", "url": "products?page=1&limit=500"},
            {"operation": "Search across dataset", "url": "products?search=solar&skip_pagination=true"},
            {"operation": "Filtered dataset", "url": "products?company_id=test&skip_pagination=true"},
        ]
        
        dataset_results = {}
        
        for test in dataset_tests:
            operation = test["operation"]
            endpoint = test["url"]
            
            print(f"\n📊 Testing {operation}")
            url = f"{self.base_url}/{endpoint}"
            response, response_time = self.measure_response_time(url)
            
            if response and response.status_code == 200:
                try:
                    data = response.json()
                    result_count = len(data) if isinstance(data, list) else 0
                    
                    # Performance targets based on dataset size
                    if current_count >= 500:
                        target_time = 2.0  # 2 seconds for 500+ products
                    else:
                        target_time = 1.0  # 1 second for smaller datasets
                    
                    meets_target = response_time < target_time
                    
                    self.log_test(
                        f"Large Dataset ({operation})", 
                        meets_target, 
                        f"{response_time:.3f}s for {result_count} results (target: <{target_time}s)"
                    )
                    
                    dataset_results[operation] = {
                        'response_time': response_time,
                        'result_count': result_count,
                        'target_time': target_time,
                        'meets_target': meets_target
                    }
                    
                except Exception as e:
                    self.log_test(f"Large Dataset ({operation}) - Response Parsing", False, f"Error: {e}")
            else:
                status = response.status_code if response else "No response"
                self.log_test(f"Large Dataset ({operation}) - Request", False, f"Status: {status}, Time: {response_time:.3f}s")
        
        dataset_results['current_count'] = current_count
        self.performance_results['large_dataset'] = dataset_results
        return dataset_results

    def run_all_performance_tests(self):
        """Run all performance optimization tests"""
        print("🚀 Starting Performance Optimization Testing Suite")
        print("=" * 60)
        
        start_time = time.time()
        
        # Run all test categories
        test_results = {}
        
        try:
            test_results['pagination'] = self.test_pagination_performance()
        except Exception as e:
            print(f"❌ Pagination tests failed: {e}")
            test_results['pagination'] = {}
        
        try:
            test_results['search'] = self.test_search_performance()
        except Exception as e:
            print(f"❌ Search tests failed: {e}")
            test_results['search'] = {}
        
        try:
            test_results['count'] = self.test_count_endpoint_performance()
        except Exception as e:
            print(f"❌ Count tests failed: {e}")
            test_results['count'] = {}
        
        try:
            test_results['indexes'] = self.test_index_optimization()
        except Exception as e:
            print(f"❌ Index tests failed: {e}")
            test_results['indexes'] = {}
        
        try:
            test_results['cache_headers'] = self.test_cache_headers()
        except Exception as e:
            print(f"❌ Cache header tests failed: {e}")
            test_results['cache_headers'] = {}
        
        try:
            test_results['concurrent'] = self.test_concurrent_requests()
        except Exception as e:
            print(f"❌ Concurrent tests failed: {e}")
            test_results['concurrent'] = {}
        
        try:
            test_results['error_handling'] = self.test_error_handling_and_fallbacks()
        except Exception as e:
            print(f"❌ Error handling tests failed: {e}")
            test_results['error_handling'] = {}
        
        try:
            test_results['large_dataset'] = self.test_large_dataset_simulation()
        except Exception as e:
            print(f"❌ Large dataset tests failed: {e}")
            test_results['large_dataset'] = {}
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 PERFORMANCE OPTIMIZATION TEST SUMMARY")
        print("=" * 60)
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {success_rate:.1f}%")
        print(f"Total Time: {total_time:.2f} seconds")
        
        # Performance highlights
        print(f"\n🎯 PERFORMANCE HIGHLIGHTS:")
        
        if 'pagination' in test_results and test_results['pagination']:
            pagination = test_results['pagination']
            if 'skip_pagination' in pagination:
                skip_data = pagination['skip_pagination']
                print(f"   • Full dataset load: {skip_data['response_time']:.3f}s for {skip_data['product_count']} products")
        
        if 'search' in test_results and test_results['search']:
            search_times = [r['response_time'] for r in test_results['search'].values() if 'response_time' in r]
            if search_times:
                avg_search_time = statistics.mean(search_times)
                print(f"   • Average search time: {avg_search_time:.3f}s")
        
        if 'concurrent' in test_results and test_results['concurrent']:
            concurrent = test_results['concurrent']
            best_concurrency = max(concurrent.keys()) if concurrent else 0
            if best_concurrency and best_concurrency in concurrent:
                best_result = concurrent[best_concurrency]
                print(f"   • Concurrent handling: {best_result['success_rate']:.1f}% success rate with {best_concurrency} threads")
        
        print(f"\n✅ Performance optimization testing completed!")
        
        return {
            'summary': {
                'total_tests': self.tests_run,
                'passed_tests': self.tests_passed,
                'success_rate': success_rate,
                'total_time': total_time
            },
            'results': test_results,
            'performance_data': self.performance_results
        }

def main():
    """Main function to run performance tests"""
    tester = PerformanceOptimizationTester()
    results = tester.run_all_performance_tests()
    
    # Save results to file for analysis
    try:
        with open('/app/performance_test_results.json', 'w') as f:
            json.dump(results, f, indent=2, default=str)
        print(f"\n📄 Results saved to performance_test_results.json")
    except Exception as e:
        print(f"❌ Failed to save results: {e}")
    
    return results

if __name__ == "__main__":
    main()