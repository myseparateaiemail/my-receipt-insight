import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const productInfoSchema = {
  description: "Product information extracted from SKU and abbreviation",
  type: "OBJECT",
  properties: {
    fullName: { type: "STRING", description: "Full marketing name" },
    brand: { type: "STRING", description: "Brand name" },
    size: { type: "STRING", description: "Size or weight" },
    category: { type: "STRING", description: "Grocery category" }
  },
  required: ["fullName"]
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const geminiApiKey = Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!geminiApiKey || !supabaseUrl || !serviceKey) {
      throw new Error("Missing API Keys");
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { sku, items } = await req.json();
    
    // Normalize input: handle both single item request and batch 'items' request
    const itemsToProcess = items 
      ? items.map((i: any) => ({ sku: i.product_code, name: i.item_name })) 
      : [{ sku, name: '' }];
    
    const results: Record<string, any> = {};
    const skusToLookup = itemsToProcess.map((i: any) => i.sku).filter((s: string) => s);

    // 1. Check Verified Products Table first
    if (skusToLookup.length > 0) {
      const { data: verifiedData, error } = await supabase
        .from('verified_products')
        .select('*')
        .in('sku', skusToLookup);

      if (!error && verifiedData) {
        verifiedData.forEach((product: any) => {
          results[product.sku] = {
            fullName: product.product_name,
            brand: product.brand,
            size: product.size,
            category: product.category,
            confidence: 'verified_db' // Mark as high confidence
          };
        });
      }
    }

    // 2. Filter out items that were already found
    const remainingItems = itemsToProcess.filter((item: any) => !results[item.sku]);

    if (remainingItems.length > 0) {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-latest",
        generationConfig: { 
          responseMimeType: "application/json", 
          responseSchema: productInfoSchema 
        },
      });

      await Promise.all(remainingItems.map(async (item: any) => {
        if (!item.name) return;
        
        const prompt = `Identify this Canadian grocery product.\nSKU: ${item.sku}\nName: ${item.name}\nReturn JSON with fullName, brand, size, category.`;
        
        try {
          const result = await model.generateContent(prompt);
          const data = JSON.parse(result.response.text());
          results[item.sku] = { ...data, confidence: 'ai_suggested' };
        } catch (e) {
          results[item.sku] = { fullName: item.name, confidence: 'fallback' };
        }
      }));
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});