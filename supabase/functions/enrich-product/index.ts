import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductInfo {
  fullName: string;
  size: string;
  brand?: string;
  category?: string;
  confidence: 'verified' | 'ai_suggested' | 'fallback';
  source: 'database' | 'ai' | 'abbreviation';
}

// Initialize Supabase client
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !supabaseKey) {
    console.log("[DB] Supabase credentials not configured");
    return null;
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

// Check local verified products database first (highest accuracy)
async function checkVerifiedProducts(sku: string): Promise<ProductInfo | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    console.log(`[DB] Checking verified products for SKU: ${sku}`);
    
    const { data, error } = await supabase
      .from('verified_products')
      .select('product_name, brand, size, category, verification_count')
      .eq('sku', sku)
      .single();

    if (error || !data) {
      console.log(`[DB] No verified product found for SKU: ${sku}`);
      return null;
    }

    console.log(`[DB] Found verified product: ${data.product_name} (verified ${data.verification_count}x)`);
    
    return {
      fullName: data.product_name,
      size: data.size || '',
      brand: data.brand || '',
      category: data.category || '',
      confidence: 'verified',
      source: 'database'
    };
  } catch (error) {
    console.error(`[DB] Error checking verified products: ${error.message}`);
    return null;
  }
}

// Use AI as fallback - clearly marked as AI suggestion with lower confidence
async function enrichWithAI(sku: string, abbreviatedName: string): Promise<ProductInfo | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.log("[AI] LOVABLE_API_KEY not configured");
    return null;
  }

  try {
    console.log(`[AI] Suggesting product for SKU: ${sku}, Name: ${abbreviatedName}`);
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are helping identify Canadian grocery products from Real Canadian Superstore receipts. 
Given a product SKU/UPC and abbreviated name, suggest what the product MIGHT be.

IMPORTANT: 
- You are making a SUGGESTION based on patterns, not a verified lookup
- If you are not confident, return shorter names closer to the original
- Do NOT invent detailed product information - only expand obvious abbreviations
- Common abbreviations: PC=President's Choice, NN/NCCO=No Name, BLK=Black, WHT=White, GRN=Green

Return JSON with these fields:
{
  "fullName": "Product name (expand abbreviations only, keep it simple)",
  "size": "Size if obvious from name, otherwise empty string",
  "brand": "Brand if obvious (PC, No Name, etc), otherwise empty string",
  "category": "Category: Bakery, Beverages, Dairy, Deli, Frozen, Household, Meats, Pantry, Produce, Personal Care, Entertainment, Health, Snacks"
}`
          },
          {
            role: "user",
            content: `SKU: ${sku}\nReceipt abbreviation: ${abbreviatedName}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_product_suggestion",
              description: "Return the suggested product information",
              parameters: {
                type: "object",
                properties: {
                  fullName: { type: "string" },
                  size: { type: "string" },
                  brand: { type: "string" },
                  category: { type: "string" }
                },
                required: ["fullName"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "return_product_suggestion" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI] Gateway error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      console.log(`[AI] Suggestion: ${result.fullName} (${result.size || 'no size'})`);
      
      // Return with ai_suggested confidence - user should verify
      return {
        fullName: result.fullName || abbreviatedName,
        size: result.size || "",
        brand: result.brand || "",
        category: result.category || "",
        confidence: 'ai_suggested',
        source: 'ai'
      };
    }

    return null;
  } catch (error) {
    console.error(`[AI] Error: ${error.message}`);
    return null;
  }
}

// Simple abbreviation expansion as ultimate fallback
function expandAbbreviations(name: string): ProductInfo {
  const abbreviations: Record<string, string> = {
    'NN ': 'No Name ',
    'NCCO ': 'No Name ',
    'PC ': 'President\'s Choice ',
    'BLK ': 'Black ',
    'WHT ': 'White ',
    'GRN ': 'Green ',
    'RED ': 'Red ',
    'YLW ': 'Yellow ',
    'ORG ': 'Organic ',
    'ORIG ': 'Original ',
  };

  let expanded = name;
  for (const [abbr, full] of Object.entries(abbreviations)) {
    expanded = expanded.replace(new RegExp(`\\b${abbr}`, 'gi'), full);
  }
  
  // Title case the result
  expanded = expanded
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return {
    fullName: expanded.trim(),
    size: '',
    brand: '',
    category: '',
    confidence: 'fallback',
    source: 'abbreviation'
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sku, skus, items } = await req.json();
    
    // Handle items array with both SKU and name
    if (items && Array.isArray(items)) {
      console.log(`\n=== Processing ${items.length} items ===`);
      
      const results: Record<string, ProductInfo | null> = {};
      
      for (const item of items) {
        const currentSku = item.product_code || item.sku;
        const itemName = item.item_name || item.name || '';
        
        if (!currentSku) continue;
        
        console.log(`\n--- SKU: ${currentSku} | Receipt: "${itemName}" ---`);
        
        // PRIORITY 1: Check verified products database (user-verified data)
        let productInfo = await checkVerifiedProducts(currentSku);
        
        // PRIORITY 2: AI suggestion (needs user verification)
        if (!productInfo && itemName) {
          productInfo = await enrichWithAI(currentSku, itemName);
        }
        
        // PRIORITY 3: Simple abbreviation expansion
        if (!productInfo && itemName) {
          productInfo = expandAbbreviations(itemName);
          console.log(`[Fallback] Expanded abbreviations: ${productInfo.fullName}`);
        }

        if (productInfo) {
          console.log(`[Result] ${productInfo.fullName} | Confidence: ${productInfo.confidence}`);
        }

        results[currentSku] = productInfo;
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          results,
          message: `Processed ${items.length} item(s)` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Legacy: handle single SKU or batch
    const skuList: string[] = skus || (sku ? [sku] : []);
    
    if (skuList.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No SKU or items provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Record<string, ProductInfo | null> = {};

    for (const currentSku of skuList) {
      // Check database first
      let productInfo = await checkVerifiedProducts(currentSku);
      
      // AI fallback with empty name (less accurate)
      if (!productInfo) {
        productInfo = await enrichWithAI(currentSku, "");
      }
      
      results[currentSku] = productInfo;
    }

    return new Response(
      JSON.stringify({ success: true, results }),
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
