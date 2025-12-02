import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductInfo {
  fullName: string;
  description: string; // size/weight like "400 ml", "454 g"
  brand?: string;
  category?: string;
}

// Try to fetch product info from Real Canadian Superstore
async function fetchFromSuperstore(sku: string): Promise<ProductInfo | null> {
  try {
    console.log(`[Superstore] Searching for SKU: ${sku}`);
    
    // Real Canadian Superstore product API endpoint
    const searchUrl = `https://www.realcanadiansuperstore.ca/api/product/search?q=${sku}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-CA,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.log(`[Superstore] Search failed with status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[Superstore] Response received, parsing...`);

    // Parse the response structure (varies by API version)
    if (data?.results?.length > 0) {
      const product = data.results[0];
      return {
        fullName: product.name || product.title || '',
        description: product.packageSize || product.size || '',
        brand: product.brand || '',
        category: product.category || '',
      };
    }

    // Try alternate response structure
    if (data?.products?.length > 0) {
      const product = data.products[0];
      return {
        fullName: product.name || product.productName || '',
        description: product.packageSize || product.size || product.weight || '',
        brand: product.brand || product.brandName || '',
        category: product.category || '',
      };
    }

    return null;
  } catch (error) {
    console.error(`[Superstore] Error fetching product: ${error.message}`);
    return null;
  }
}

// Try to fetch product info from Walmart Canada
async function fetchFromWalmart(sku: string): Promise<ProductInfo | null> {
  try {
    console.log(`[Walmart] Searching for SKU: ${sku}`);
    
    // Walmart Canada search API
    const searchUrl = `https://www.walmart.ca/api/product-page/find-products?q=${sku}&lang=en`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-CA,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.log(`[Walmart] Search failed with status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[Walmart] Response received, parsing...`);

    // Parse Walmart response structure
    if (data?.items?.length > 0) {
      const product = data.items[0];
      return {
        fullName: product.name || product.title || '',
        description: extractSizeFromName(product.name || '') || product.size || '',
        brand: product.brand || '',
        category: product.category || '',
      };
    }

    // Try alternate response structure
    if (data?.products?.length > 0) {
      const product = data.products[0];
      return {
        fullName: product.name || product.productName || '',
        description: extractSizeFromName(product.name || '') || product.packageSize || '',
        brand: product.brand || '',
        category: product.category || '',
      };
    }

    return null;
  } catch (error) {
    console.error(`[Walmart] Error fetching product: ${error.message}`);
    return null;
  }
}

// Extract size/weight from product name (e.g., "Product Name 400ml" -> "400 ml")
function extractSizeFromName(name: string): string {
  // Match patterns like "400ml", "454g", "1.5L", "2kg", etc.
  const sizePatterns = [
    /(\d+(?:\.\d+)?)\s*(ml|l|g|kg|oz|lb|lbs|litre|liter|gram|kilogram)/gi,
    /(\d+(?:\.\d+)?)\s*(pack|pk|ct|count)/gi,
  ];

  for (const pattern of sizePatterns) {
    const match = name.match(pattern);
    if (match) {
      // Normalize the size string
      let size = match[match.length - 1];
      // Add space between number and unit if missing
      size = size.replace(/(\d)([a-zA-Z])/g, '$1 $2');
      return size;
    }
  }

  return '';
}

// Fallback: Try to scrape product page directly
async function fetchProductPageDirect(sku: string): Promise<ProductInfo | null> {
  try {
    console.log(`[Direct] Attempting direct page fetch for SKU: ${sku}`);
    
    // Format SKU for URL (remove leading zeros for some lookups)
    const formattedSku = sku.replace(/^0+/, '');
    
    // Try Superstore product page
    const superstoreUrl = `https://www.realcanadiansuperstore.ca/search?search-bar=${sku}`;
    
    const response = await fetch(superstoreUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-CA,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.log(`[Direct] Page fetch failed with status: ${response.status}`);
      return null;
    }

    const html = await response.text();
    
    // Extract product info from HTML using regex (basic scraping)
    const titleMatch = html.match(/<h1[^>]*class="[^"]*product-name[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<title>([^|<]+)/i);
    
    const sizeMatch = html.match(/(\d+(?:\.\d+)?)\s*(ml|g|kg|l|oz|lb)/gi);
    
    if (titleMatch) {
      const fullName = titleMatch[1].trim();
      const description = sizeMatch ? sizeMatch[0] : extractSizeFromName(fullName);
      
      return {
        fullName,
        description,
      };
    }

    return null;
  } catch (error) {
    console.error(`[Direct] Error: ${error.message}`);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sku, skus } = await req.json();
    
    // Handle single SKU or batch of SKUs
    const skuList: string[] = skus || (sku ? [sku] : []);
    
    if (skuList.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No SKU provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${skuList.length} SKU(s): ${skuList.join(', ')}`);

    const results: Record<string, ProductInfo | null> = {};

    for (const currentSku of skuList) {
      console.log(`\n--- Processing SKU: ${currentSku} ---`);
      
      // Try Superstore first
      let productInfo = await fetchFromSuperstore(currentSku);
      
      // If not found, try Walmart
      if (!productInfo) {
        console.log(`[${currentSku}] Not found on Superstore, trying Walmart...`);
        productInfo = await fetchFromWalmart(currentSku);
      }
      
      // If still not found, try direct page scraping
      if (!productInfo) {
        console.log(`[${currentSku}] Not found via APIs, trying direct scrape...`);
        productInfo = await fetchProductPageDirect(currentSku);
      }

      if (productInfo) {
        console.log(`[${currentSku}] Found: ${productInfo.fullName} (${productInfo.description})`);
      } else {
        console.log(`[${currentSku}] Product not found on any source`);
      }

      results[currentSku] = productInfo;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        message: `Processed ${skuList.length} SKU(s)` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
