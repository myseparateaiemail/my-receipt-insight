import { ParsedReceiptData } from "@/types";

export const processReceiptWithGeminiClient = async (
  imageUrl: string,
  apiKey: string
): Promise<{ ocrText: string; parsedData: ParsedReceiptData }> => {
  console.log("Starting Client-Side Gemini Processing...");

  // 1. Fetch image and convert to Base64
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error("Failed to fetch image for processing");
  const blob = await imageRes.blob();
  
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // 2. Prepare Gemini Payload
  const receiptSchemaDef = `
  {
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
            "category": { "type": "STRING", "description": "One of: Produce, Dairy, Meats, Bakery, Baking, Baking Supplies, Beverages, Canned Goods, Cleaning, Frozen, Pantry, Household, Deli, Dips, Coffee, Dessert, Other" },
            "tax_code": { "type": "STRING" },
            "brand": { "type": "STRING" },
            "size": { "type": "STRING" }
          },
          "required": ["item_name", "total_price"]
        }
      }
    },
    "required": ["items", "total_amount", "store_name"]
  }
  `;

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

  // Updated to use gemini-1.5-flash-001 for better stability
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-001:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{
      parts: [
        { text: promptText },
        { inline_data: { mime_type: "image/jpeg", data: base64Data } }
      ]
    }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: JSON.parse(receiptSchemaDef)
    }
  };

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini Client API Error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!rawText) throw new Error("Gemini returned no text.");

  // Clean JSON
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
      rawText = jsonMatch[0];
  }

  const parsedData = JSON.parse(rawText);
  
  return {
    ocrText: "Extracted via Gemini Client-Side",
    parsedData: parsedData
  };
};
