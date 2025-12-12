import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Types for internal usage
interface RequestItem {
  product_code: string;
  item_name: string;
}

interface ProcessItem {
  sku: string;
  name: string;
}

interface ProductInfo {
  fullName: string;
  brand?: string;
  size?: string;
  category?: string;
  confidence: string;
}

interface VerifiedProduct {
  sku: string;
  product_name: string;
  brand?: string;
  size?: string;
  category?: string;
}

// Product Info Schema for JSON output
const productInfoSchemaDef = `
{
  "type": "OBJECT",
  "properties": {
    "fullName": { "type": "STRING", "description": "Full marketing name" },
    "brand": { "type": "STRING", "description": "Brand name" },
    "size": { "type": "STRING", "description": "Size or weight" },
    "category": { "type": "STRING", "description": "Grocery category" }
  },
  "required": ["fullName"]
}
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const geminiApiKey = Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!geminiApiKey || !supabaseUrl || !serviceKey) {
      throw new Error("Missing API Keys");
    }

    const { sku, items } = await req.json();
    
    // Normalize input: handle both single item request and batch 'items' request
    const itemsToProcess: ProcessItem[] = items 
      ? items.map((i: RequestItem) => ({ sku: i.product_code, name: i.item_name })) 
      : (sku ? [{ sku, name: '' }] : []);
    
    const results: Record<string, ProductInfo> = {};
    const skusToLookup = itemsToProcess.map((i) => i.sku).filter((s) => s);

    // 1. Check Verified Products Table first (Supabase REST API)
    if (skusToLookup.length > 0) {
      const headers = {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
      };
      
      // Construct filter string: sku=in.(val1,val2,...)
      const skuFilter = `(${skusToLookup.join(',')})`;
      const queryUrl = `${supabaseUrl}/rest/v1/verified_products?sku=in.${skuFilter}&select=*`;
      
      const dbRes = await fetch(queryUrl, { method: 'GET', headers: headers });
      
      if (dbRes.ok) {
        const verifiedData: VerifiedProduct[] = await dbRes.json();
        if (verifiedData) {
            verifiedData.forEach((product) => {
              results[product.sku] = {
                fullName: product.product_name,
                brand: product.brand,
                size: product.size,
                category: product.category,
                confidence: 'verified_db' // Mark as high confidence
              };
            });
        }
      } else {
        console.error("DB Lookup failed:", await dbRes.text());
      }
    }

    // 2. Filter out items that were already found
    const remainingItems = itemsToProcess.filter((item) => !results[item.sku]);

    if (remainingItems.length > 0) {
      // Use Raw REST API for Gemini
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

      await Promise.all(remainingItems.map(async (item) => {
        if (!item.name) return;
        
        const prompt = `Identify this Canadian grocery product.\nSKU: ${item.sku}\nName: ${item.name}\nReturn JSON with fullName, brand, size, category.`;
        
        const geminiPayload = {
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: JSON.parse(productInfoSchemaDef)
          }
        };

        try {
          const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
          });

          if (!geminiRes.ok) throw new Error("Gemini API Error");

          const geminiData = await geminiRes.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (rawText) {
             const data = JSON.parse(rawText);
             results[item.sku] = { ...data, confidence: 'ai_suggested' };
          } else {
             results[item.sku] = { fullName: item.name, confidence: 'fallback' };
          }

        } catch (e) {
          console.error(`AI Enrichment failed for ${item.sku}:`, e);
          results[item.sku] = { fullName: item.name, confidence: 'fallback' };
        }
      }));
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
