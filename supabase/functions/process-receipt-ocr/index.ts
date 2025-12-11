import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Internal types
interface ParsedItem {
  item_name: string;
  product_code?: string;
  quantity?: number;
  unit_price?: number;
  total_price: number;
  discount_amount?: number;
  category?: string;
  tax_code?: string;
  brand?: string;
  size?: string;
}

interface ParsedReceipt {
  store_name?: string;
  store_address?: string;
  receipt_date?: string;
  total_amount?: number;
  subtotal_amount?: number;
  tax_amount?: number;
  card_last_four?: string;
  payment_method?: string;
  items?: ParsedItem[];
}

const receiptSchema = {
  description: "Receipt data extracted from OCR text",
  type: "OBJECT",
  properties: {
    store_name: { type: "STRING", description: "Name of the store" },
    store_address: { type: "STRING", description: "Store address if present" },
    receipt_date: { type: "STRING", description: "Date (YY/MM/DD) or ISO format" },
    total_amount: { type: "NUMBER", description: "Final total paid" },
    subtotal_amount: { type: "NUMBER", description: "Subtotal before tax" },
    tax_amount: { type: "NUMBER", description: "Tax amount" },
    card_last_four: { type: "STRING", description: "Last 4 digits of card" },
    payment_method: { type: "STRING", description: "Payment type (DEBIT/CREDIT/CASH)" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          item_name: { type: "STRING" },
          product_code: { type: "STRING", description: "SKU or PLU code" },
          quantity: { type: "NUMBER" },
          unit_price: { type: "NUMBER" },
          total_price: { type: "NUMBER" },
          discount_amount: { type: "NUMBER", description: "Positive number for savings" },
          category: { type: "STRING", description: "One of: Produce, Dairy, Meats, Bakery, Beverages, Frozen, Pantry, Household, Deli, Dips, Coffee, Dessert, Other" },
          tax_code: { type: "STRING" },
          brand: { type: "STRING" },
          size: { type: "STRING" }
        },
        required: ["item_name", "total_price"]
      }
    }
  },
  required: ["items", "total_amount", "store_name"]
} as const;

// Helper: Base64 converter
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY');
    const visionApiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');

    if (!supabaseUrl || !serviceKey || !geminiApiKey || !visionApiKey) {
      throw new Error('Missing configuration keys. Check your .env file.');
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { receiptId, imageUrl } = await req.json();

    console.log(`Processing receipt: ${receiptId}`);

    // 2. Download Image
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error('Failed to fetch image');
    const imageBlob = await imageRes.blob();
    const imageBuffer = await imageBlob.arrayBuffer();
    
    console.log(`Image downloaded. Size: ${imageBuffer.byteLength} bytes`);

    // 3. Google Vision API (OCR)
    console.log('Sending to Google Vision API...');
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: arrayBufferToBase64(imageBuffer) },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      }
    );

    if (!visionRes.ok) {
        const errorBody = await visionRes.text();
        throw new Error(`Vision API Error: ${visionRes.status} ${visionRes.statusText} - ${errorBody}`);
    }

    const visionData = await visionRes.json();
    
    // Check for explicit API errors in the response body
    if (visionData.responses?.[0]?.error) {
        throw new Error(`Vision API Logic Error: ${JSON.stringify(visionData.responses[0].error)}`);
    }

    const ocrText = visionData.responses?.[0]?.textAnnotations?.[0]?.description;
    
    if (!ocrText) throw new Error('No text found in receipt');

    // 4. Gemini 2.5 Flash (Parsing)
    console.log('Sending to Gemini 2.5 Flash...');
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-latest", 
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: receiptSchema,
      },
    });

    const prompt = `
      You are an expert receipt parser for Canadian grocery stores (Walmart, Superstore, Loblaws, No Frills, etc.).
      Parse this OCR text into structured data.
      
      Parsing Guidelines:
      1. **Store Name**: Identify the main store brand (e.g., Walmart, Real Canadian Superstore).
      2. **Items**: Extract every line item that represents a purchased product.
         - **Item Merging (CRITICAL)**: Always merge identical items into a single line item with quantity > 1.
           - If a receipt lists "Beans" twice at $1.00 each, output ONE item: { name: "Beans", quantity: 2, unit_price: 1.00, total_price: 2.00 }.
           - If a receipt says "(2) ... 2 @ $1.69", output ONE item with quantity 2.
           - This is critical for "Multi-buy" discounts. Do not list identical items separately.
         - **Product Code**: Look for numeric codes (UPC/SKU) often appearing next to the item name or price (e.g., "064420010040", "4011").
         - **Item Name**: The description text (e.g., "HOMO MILK", "BANANAS").
         - **Tax Codes**: Capture single letters like H, D, J, G, Z appearing at the end of the line.
         - **Category**: Classify into one of: Produce, Dairy, Meats, Bakery, Beverages, Frozen, Pantry, Household, Deli, Dips, Coffee, Dessert, Other.
      3. **Discounts**: Identify discounts (often negative numbers or marked with "Savings", "Member", "Multi-buy").
         - If a discount line follows an item, try to apply the discount_amount to that item if possible, or list it as a separate item with negative total_price.
      4. **Exclusions**: Do NOT include "SUBTOTAL", "HST", "GST", "TOTAL", "BALANCE DUE", or payment lines (VISA, DEBIT) in the 'items' array.
      
      OCR TEXT:
      ${ocrText}
    `;

    const result = await model.generateContent(prompt);
    let rawText = result.response.text();
    
    // Cleanup: Remove markdown formatting if present (Gemini sometimes adds it despite schema)
    if (rawText.startsWith('```json')) {
        rawText = rawText.replace(/^```json/, '').replace(/```$/, '');
    } else if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```/, '').replace(/```$/, '');
    }
    
    let parsedData: ParsedReceipt;
    try {
        parsedData = JSON.parse(rawText);
    } catch (e) {
        console.error("JSON Parse Error. Raw text:", rawText);
        throw new Error(`Failed to parse Gemini response: ${e.message}`);
    }

    // 5. Save to Supabase (Database)
    if (receiptId !== 'temp-processing') {
       const { error: updateError } = await supabase
        .from('receipts')
        .update({
          ocr_text: ocrText,
          store_name: parsedData.store_name,
          receipt_date: parsedData.receipt_date,
          total_amount: parsedData.total_amount,
          subtotal_amount: parsedData.subtotal_amount,
          tax_amount: parsedData.tax_amount,
          processing_status: 'completed',
          updated_at: new Date().toISOString(),
          card_last_four: parsedData.card_last_four
        })
        .eq('id', receiptId);

       if (updateError) throw updateError;

       if (parsedData.items?.length) {
         const itemsToInsert = parsedData.items.map((item, idx) => ({
           receipt_id: receiptId,
           item_name: item.item_name,
           product_code: item.product_code,
           quantity: item.quantity,
           unit_price: item.unit_price,
           total_price: item.total_price,
           discount_amount: item.discount_amount || 0,
           category: item.category,
           tax_code: item.tax_code,
           brand: item.brand,
           size: item.size,
           line_number: idx + 1
         }));
         
         await supabase.from('receipt_items').delete().eq('receipt_id', receiptId);
         await supabase.from('receipt_items').insert(itemsToInsert);
       }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      ocrText, 
      parsedData,
      message: "Processed with Gemini Direct" 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Return the specific error to the client
    return new Response(JSON.stringify({ 
        success: false,
        error: errorMessage 
    }), { 
      status: 500, // Keep 500 so client knows it failed, but provide details in body
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
