// CloudFlare Worker Script for corlukaravan.shop - Exchange Rate No-Cache
// Deploy this as a CloudFlare Worker on corlukaravan.shop domain

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Log for debugging
  console.log(`Request to: ${url.pathname} on ${url.hostname}`)
  
  // Check if this is corlukaravan.shop exchange rate API call
  if (url.hostname === 'corlukaravan.shop' && url.pathname.startsWith('/api/exchange-rates')) {
    console.log('Exchange rate API detected for corlukaravan.shop, applying no-cache policy')
    
    // Forward the request to your origin
    const response = await fetch(request)
    
    // Clone the response so we can modify headers
    const newResponse = new Response(response.body, response)
    
    // Force no caching headers - CRITICAL for exchange rates
    newResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0')
    newResponse.headers.set('Pragma', 'no-cache')
    newResponse.headers.set('Expires', '-1')
    newResponse.headers.delete('ETag')
    newResponse.headers.delete('Last-Modified')
    
    // Add timestamp and domain info to ensure uniqueness
    newResponse.headers.set('X-Timestamp', Date.now().toString())
    newResponse.headers.set('X-No-Cache', 'CORLUKARAVAN-WORKER-FORCED')
    newResponse.headers.set('X-Domain', 'corlukaravan.shop')
    newResponse.headers.set('X-Worker-Time', new Date().toISOString())
    
    // Add CORS headers for API access
    newResponse.headers.set('Access-Control-Allow-Origin', '*')
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    console.log('Applied no-cache headers to exchange rate response')
    return newResponse
  }
  
  // For all other corlukaravan.shop requests, pass through normally
  if (url.hostname === 'corlukaravan.shop') {
    return fetch(request)
  }
  
  // For non-corlukaravan.shop requests, return error
  return new Response('Domain not handled by this worker', { status: 404 })
}

// Helper function to add query parameter to prevent caching (alternative approach)
function addNoCacheParam(url) {
  const urlObj = new URL(url)
  urlObj.searchParams.set('_nocache', Date.now().toString())
  urlObj.searchParams.set('_domain', 'corlukaravan.shop')
  return urlObj.toString()
}

// Handle CORS preflight requests
addEventListener('fetch', event => {
  if (event.request.method === 'OPTIONS') {
    event.respondWith(handleCORS(event.request))
  }
})

function handleCORS(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
  
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  })
}