import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "No image URL provided" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Processing receipt for image: ${imageUrl}`);

    // 1. Fetch the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }
    const imageBlob = await imageResponse.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // 2. Prepare Gemini Payload
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables");
    }

    const receiptSchemaDef = {
      "type": "OBJECT",
      "properties": {
        "store_name": { "type": "STRING", "description": "Name of the store" },
        "store_address": { "type": "STRING", "description": "Store address if present" },
        "receipt_date": { "type": "STRING", "description": "Date (YY/MM/DD) or ISO format" },
        "total_amount": { "type": "NUMBER", "description": "Final total paid" },
        "subtotal_amount": { "type": "NUMBER", "description": "Subtotal before tax" },
        "tax_amount": { "type": "NUMBER", "description": "Tax amount" },
        "card_last_four": { "type": "STRING", "description": "Last 4 digits of card" },
        "payment_method": { "type": "STRING", "description": "Payment type (DEBIT/CREDIT/CASH)" },
        "items": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "item_name": { "type": "STRING" },
              "product_code": { "type": "STRING", "description": "SKU or PLU code" },
              "quantity": { "type": "NUMBER" },
              "unit_price": { "type": "NUMBER" },
              "total_price": { "type": "NUMBER" },
              "discount_amount": { "type": "NUMBER", "description": "Positive number for savings" },
              "category": { "type": "STRING", "description": "One of: Produce, Dairy, Meats, Bakery, Baking, Baking Supplies, Beverages, Canned Goods, Cleaning, Frozen, Pantry, Household, Laundry, Deli, Dips, Coffee, Dessert, Other" },
              "tax_code": { "type": "STRING" },
              "brand": { "type": "STRING" },
              "size": { "type": "STRING" }
            },
            "required": ["item_name", "total_price"]
          }
        }
      },
      "required": ["items", "total_amount", "store_name"]
    };

    const promptText = `
      You are an expert receipt parser. Parse this receipt image into structured data.
      
      Parsing Guidelines:
      1. **Store Name**: Identify the main store brand.
      2. **Items**: Extract every line item.
         - **Item Merging**: Merge identical items into single line with quantity > 1.
      3. **Discounts**: Identify discounts.
      4. **Financials**: Accurately extract 'subtotal_amount' and 'tax_amount' from the bottom of the receipt. Look for keywords like "SUBTOTAL", "HST", "GST", "TAX", "TVH".
      5. **Exclusions**: Do not include subtotal or tax lines as items in the items list.
    `;

    // Use gemini-1.5-flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        parts: [
          { text: promptText },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: receiptSchemaDef
      }
    };

    console.log("Calling Gemini API...");
    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`Gemini API Error: ${geminiResponse.status} - ${errorText}`);
      throw new Error(`Gemini API Error: ${geminiResponse.status} - ${errorText}`);
    }

    const data = await geminiResponse.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("Gemini returned no text.");
    }

    console.log("Gemini response received.");

    // Parse JSON
    let parsedData;
    try {
        parsedData = JSON.parse(rawText);
    } catch (e) {
        console.error("Failed to parse JSON from Gemini:", rawText);
        // Try to regex extract if direct parse fails
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error("Failed to parse JSON response");
        }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ocrText: "Extracted via Gemini Server-Side",
        parsedData: parsedData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error processing receipt:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
