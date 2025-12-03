import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductInfo {
  fullName: string;
  size: string; // e.g., "400 ml", "12x355 ml", "454 g"
  brand?: string;
  category?: string;
}

// Use Lovable AI to look up product information based on SKU and abbreviated name
async function enrichWithAI(sku: string, abbreviatedName: string): Promise<ProductInfo | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.log("[AI] LOVABLE_API_KEY not configured");
    return null;
  }

  try {
    console.log(`[AI] Looking up SKU: ${sku}, Name: ${abbreviatedName}`);
    
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
            content: `You are a Canadian grocery product database expert. Given a product SKU/UPC code and abbreviated name from a Real Canadian Superstore receipt, identify the full product name, brand, size/quantity, and category.

Common abbreviations:
- PC = President's Choice
- NCCO = No Name
- SIGGI YOG = Siggi's Yogurt
- SPRT = Sparkling
- GFRT = Grapefruit
- MSHRMS = Mushrooms
- WHT = White
- BAN = Banana
- RAS = Raspberry
- CLN = Clean/Cleaner
- NEUT = Neutrogena
- RSBL = Reusable
- SHRT = Short
- BG = Bag
- SUP = Supplies

Categories: Bakery, Beverages, Dairy, Deli, Frozen, Household, Meats, Pantry, Produce, Personal Care, Entertainment, Health, Seafood, Snacks

Return ONLY valid JSON with these exact fields:
{
  "fullName": "Complete product name without size",
  "size": "Size with units (e.g., '400 ml', '12x355 ml', '454 g', '283 g')",
  "brand": "Brand name",
  "category": "Category from the list above"
}

If you cannot identify the product with confidence, return null for that field.`
          },
          {
            role: "user",
            content: `SKU: ${sku}\nAbbreviated name from receipt: ${abbreviatedName}\n\nIdentify the full product details.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_product_info",
              description: "Return the identified product information",
              parameters: {
                type: "object",
                properties: {
                  fullName: { 
                    type: "string", 
                    description: "Complete product name without size information" 
                  },
                  size: { 
                    type: "string", 
                    description: "Product size with units (e.g., '400 ml', '12x355 ml', '454 g')" 
                  },
                  brand: { 
                    type: "string", 
                    description: "Brand name" 
                  },
                  category: { 
                    type: "string", 
                    description: "Product category" 
                  }
                },
                required: ["fullName", "size"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "return_product_info" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI] Gateway error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      console.log(`[AI] Found: ${result.fullName} (${result.size})`);
      return {
        fullName: result.fullName || abbreviatedName,
        size: result.size || "",
        brand: result.brand || "",
        category: result.category || ""
      };
    }

    return null;
  } catch (error) {
    console.error(`[AI] Error: ${error.message}`);
    return null;
  }
}

// Fallback: Extract size from abbreviated name
function extractSizeFromName(name: string): string {
  const sizePatterns = [
    /(\d+)\s*[xX]\s*(\d+(?:\.\d+)?)\s*(ml|l|g|kg|oz|lb)/gi,
    /(\d+(?:\.\d+)?)\s*(ml|l|g|kg|oz|lb|lbs|litre|liter|gram|kilogram)/gi,
    /(\d+)\s*(pack|pk|ct|count)/gi,
  ];

  for (const pattern of sizePatterns) {
    const match = name.match(pattern);
    if (match) {
      let size = match[0];
      size = size.replace(/(\d)([a-zA-Z])/g, '$1 $2');
      return size;
    }
  }
  return '';
}

// Expand common abbreviations as fallback
function expandAbbreviations(name: string): string {
  const abbreviations: Record<string, string> = {
    'PC ': 'President\'s Choice ',
    'NCCO ': 'No Name ',
    'SIGGI YOG': 'Siggi\'s Yogurt',
    'SPRT': 'Sparkling',
    'GFRT': 'Grapefruit',
    'MSHRMS': 'Mushrooms',
    'WHT': 'White',
    'BAN': 'Banana',
    'RAS': 'Raspberry',
    'CLN': 'Cleaner',
    'NEUT': 'Neutrogena',
    'ORG': 'Organic',
    'VEG': 'Vegetable',
    'FRZ': 'Frozen',
    'CHK': 'Chicken',
    'BF': 'Beef',
    'PK': 'Pork',
    'SWT': 'Sweet',
    'GRN': 'Green',
    'RED': 'Red',
    'YLW': 'Yellow',
    'BLU': 'Blue',
    'CHOC': 'Chocolate',
    'VAN': 'Vanilla',
    'STRW': 'Strawberry',
    'LRG': 'Large',
    'MED': 'Medium',
    'SML': 'Small',
    'XL': 'Extra Large',
  };

  let expanded = name;
  for (const [abbr, full] of Object.entries(abbreviations)) {
    expanded = expanded.replace(new RegExp(abbr, 'gi'), full);
  }
  return expanded.trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sku, skus, items } = await req.json();
    
    // Handle items array with both SKU and name for better enrichment
    if (items && Array.isArray(items)) {
      console.log(`Processing ${items.length} items with names`);
      
      const results: Record<string, ProductInfo | null> = {};
      
      for (const item of items) {
        const currentSku = item.product_code || item.sku;
        const itemName = item.item_name || item.name || '';
        
        if (!currentSku) continue;
        
        console.log(`\n--- Processing: ${currentSku} - ${itemName} ---`);
        
        // Try AI enrichment first
        let productInfo = await enrichWithAI(currentSku, itemName);
        
        // Fallback: expand abbreviations
        if (!productInfo) {
          const expanded = expandAbbreviations(itemName);
          const size = extractSizeFromName(itemName);
          if (expanded !== itemName || size) {
            productInfo = {
              fullName: expanded,
              size: size,
            };
          }
        }

        if (productInfo) {
          console.log(`[${currentSku}] Enriched: ${productInfo.fullName} (${productInfo.size})`);
        } else {
          console.log(`[${currentSku}] Could not enrich`);
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
    
    // Legacy: handle single SKU or batch of SKUs (without names)
    const skuList: string[] = skus || (sku ? [sku] : []);
    
    if (skuList.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No SKU or items provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${skuList.length} SKU(s) without names`);

    const results: Record<string, ProductInfo | null> = {};

    for (const currentSku of skuList) {
      // Without a name, AI enrichment is less effective
      const productInfo = await enrichWithAI(currentSku, "");
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
