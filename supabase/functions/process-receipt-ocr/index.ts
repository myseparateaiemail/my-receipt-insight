import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReceiptItem {
  item_name: string;
  product_code?: string;
  quantity?: number;
  unit_price?: number;
  total_price: number;
  discount_amount?: number;
  category?: string;
  line_number?: number;
  tax_code?: string;
  description?: string;
}

interface ReceiptData {
  store_name?: string;
  store_address?: string;
  receipt_date?: string;
  receipt_number?: string;
  subtotal_amount?: number;
  tax_amount?: number;
  total_amount?: number;
  tip_amount?: number;
  discount_amount?: number;
  payment_method?: string;
  cashier_name?: string;
  card_last_four?: string;
  items: ReceiptItem[];
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// AI-powered receipt parsing using Lovable AI Gateway
async function parseReceiptWithAI(ocrText: string): Promise<ReceiptData> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured, falling back to basic parsing');
    return basicParseFallback(ocrText);
  }

  const systemPrompt = `You are a receipt parser. Extract structured data from Real Canadian Superstore receipt OCR text.

CRITICAL RULES:
1. Extract ALL line items - every product purchased must be included as a separate item
2. DISCOUNTS: Lines like "ARCP: 30.00% ($4.50) -1.35" are discounts that apply to the PREVIOUS product item. DO NOT create a separate item for discounts. Instead, add the discount_amount to the previous item. The discount amount is the negative number (e.g., -1.35).
3. MULTI-BUY PRICING: For items with pricing like "$0.69 ea or 4/$2.00", if the quantity meets the multi-buy threshold (e.g., 4 items), use the multi-buy price (e.g., $2.00 total for 4, so $0.50 each). If quantity is less, use regular unit price.
4. For items with quantity notation like "(2)SKU NAME" or "2 @ $X.XX", set quantity appropriately
5. For weight-based items like "0.315 kg @ $12.10/kg", extract the weight as quantity and per-kg price as unit_price
6. SKU/product codes are the numeric codes (4-14 digits) that appear before product names. PLU codes for produce are 4-5 digits.
7. Tax codes like MRJ (non-taxable), HMRJ (taxable) should be captured but not displayed
8. CATEGORIES - be specific:
   - Produce: ALL fruits and vegetables (limes, peppers, cucumbers, lettuce, apples, etc.)
   - Dips: guacamole, salsa, hummus, dips
   - Deli: deli meats, cheeses from deli counter
   - Snacks: chips, crackers, popcorn
   - Pantry: canned goods, beans, rice, pasta
   - Dairy: milk, yogurt, cheese, butter
9. The TOTAL is the final amount paid (look for "TOTAL" followed by a number)
10. Extract the last 4 digits of the payment card from "Card Number: ***************XXXX"
11. Items with asterisk (*) prefix are price-matched items - still include them

PRODUCE items (PLU codes 3000-4999 or 94000-99999): ALWAYS categorize as "Produce"
Examples: LIME, RED PEPPERS, CUCUMBER, BANANA, APPLE, LETTUCE, TOMATO, ONION, etc.`;

  const userPrompt = `Parse this receipt OCR text and extract all data:

${ocrText}

REMEMBER: 
- Discount lines (ARCP, etc.) should NOT be separate items - add the discount to the previous item's discount_amount field
- Multi-buy pricing: if quantity meets threshold, calculate unit price based on multi-buy deal
- ALL fruits and vegetables must be categorized as "Produce"
- Guacamole, salsa, hummus = "Dips" category
- Extract card last 4 digits from the card number line

Return the structured receipt data.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'parse_receipt',
            description: 'Parse receipt OCR text into structured data',
            parameters: {
              type: 'object',
              properties: {
                store_name: { type: 'string', description: 'Name of the store' },
                store_address: { type: 'string', description: 'Store address if present' },
                receipt_date: { type: 'string', description: 'Date and time of purchase (format: YY/MM/DD HH:MM:SS or similar)' },
                subtotal_amount: { type: 'number', description: 'Subtotal before tax' },
                tax_amount: { type: 'number', description: 'Tax amount (HST/GST)' },
                total_amount: { type: 'number', description: 'Final total amount paid' },
                payment_method: { type: 'string', description: 'Payment method used (e.g., DEBIT, CREDIT)' },
                card_last_four: { type: 'string', description: 'Last 4 digits of payment card (from Card Number: ***************XXXX)' },
                items: {
                  type: 'array',
                  description: 'All purchased items (NOT including discount lines as separate items)',
                  items: {
                    type: 'object',
                    properties: {
                      item_name: { type: 'string', description: 'Product name from receipt' },
                      product_code: { type: 'string', description: 'SKU or PLU code (numeric)' },
                      quantity: { type: 'number', description: 'Quantity purchased (default 1, or weight for produce)' },
                      unit_price: { type: 'number', description: 'Price per unit or per kg (use multi-buy price if applicable)' },
                      total_price: { type: 'number', description: 'Final total price AFTER any discounts' },
                      discount_amount: { type: 'number', description: 'Discount amount if any (as positive number, e.g., 1.35 not -1.35)' },
                      category: { type: 'string', description: 'Category: Produce, Dips, Deli, Snacks, Pantry, Dairy, Meats, Bakery, Beverages, Frozen, Household, Personal Care' },
                      tax_code: { type: 'string', description: 'Tax code like MRJ or HMRJ if present' }
                    },
                    required: ['item_name', 'total_price']
                  }
                }
              },
              required: ['items', 'total_amount']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'parse_receipt' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        console.log('Rate limited, falling back to basic parsing');
      } else if (response.status === 402) {
        console.log('Payment required, falling back to basic parsing');
      }
      
      return basicParseFallback(ocrText);
    }

    const data = await response.json();
    console.log('AI response received');
    
    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log('AI parsed items count:', parsed.items?.length || 0);
      
      // Validate and clean the parsed data
      const result: ReceiptData = {
        store_name: parsed.store_name || 'Unknown Store',
        store_address: parsed.store_address,
        receipt_date: parsed.receipt_date,
        subtotal_amount: parsed.subtotal_amount,
        tax_amount: parsed.tax_amount,
        total_amount: parsed.total_amount,
        payment_method: parsed.payment_method,
        card_last_four: parsed.card_last_four,
        items: (parsed.items || []).map((item: any, idx: number) => ({
          item_name: cleanProductName(item.item_name || 'Unknown Item'),
          product_code: item.product_code,
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.total_price,
          total_price: item.total_price || 0,
          discount_amount: item.discount_amount || 0,
          category: correctCategory(item.item_name, item.product_code, item.category),
          line_number: idx + 1,
          tax_code: item.tax_code
        }))
      };
      
      // Reconciliation check
      if (result.subtotal_amount && result.tax_amount && !result.total_amount) {
        result.total_amount = result.subtotal_amount + result.tax_amount;
      }
      
      // If total seems wrong (equals subtotal when tax exists), fix it
      if (result.total_amount === result.subtotal_amount && result.tax_amount && result.tax_amount > 0) {
        result.total_amount = result.subtotal_amount + result.tax_amount;
      }
      
      return result;
    }
    
    console.log('No tool call in response, falling back');
    return basicParseFallback(ocrText);
    
  } catch (error) {
    console.error('AI parsing error:', error);
    return basicParseFallback(ocrText);
  }
}

// Basic fallback parser for when AI is unavailable
function basicParseFallback(text: string): ReceiptData {
  console.log('Using basic fallback parser');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  const result: ReceiptData = {
    items: [],
    store_name: 'Unknown Store'
  };
  
  // Extract store name
  if (text.includes('REAL CANADIAN') || text.includes('SUPERSTORE')) {
    result.store_name = 'REAL CANADIAN SUPERSTORE';
  }
  
  // Extract date
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/);
  if (dateMatch) result.receipt_date = dateMatch[1];
  
  // Extract card last 4 digits
  const cardMatch = text.match(/Card Number:\s*\*+(\d{4})/);
  if (cardMatch) result.card_last_four = cardMatch[1];
  
  // Extract totals
  const subtotalMatch = text.match(/SUBTOTAL\s+(\d+\.?\d*)/i);
  if (subtotalMatch) result.subtotal_amount = parseFloat(subtotalMatch[1]);
  
  const taxMatch = text.match(/HST.*?(\d+\.?\d*)\s*$/m) || text.match(/@\s*13\.000%\s+(\d+\.?\d*)/);
  if (taxMatch) result.tax_amount = parseFloat(taxMatch[1]);
  
  const totalMatch = text.match(/^TOTAL\s+(\d+\.?\d*)/m);
  if (totalMatch) result.total_amount = parseFloat(totalMatch[1]);
  
  // Payment method
  if (text.includes('DEBIT')) result.payment_method = 'DEBIT';
  else if (text.includes('CREDIT')) result.payment_method = 'CREDIT';
  
  // Basic item extraction - look for SKU + name + price patterns
  const itemPattern = /(\d{8,14})\s+([A-Z][A-Z0-9\s]+?)\s+(H?MRJ)?\s*(\d+\.\d{2})/g;
  let match;
  let lineNum = 1;
  
  while ((match = itemPattern.exec(text)) !== null) {
    const itemName = match[2].trim();
    result.items.push({
      product_code: match[1],
      item_name: cleanProductName(itemName),
      total_price: parseFloat(match[4]),
      quantity: 1,
      unit_price: parseFloat(match[4]),
      category: correctCategory(itemName, match[1], 'Pantry'),
      line_number: lineNum++
    });
  }
  
  // Reconcile total
  if (result.subtotal_amount && result.tax_amount && !result.total_amount) {
    result.total_amount = result.subtotal_amount + result.tax_amount;
  }
  
  return result;
}

// Correct category based on item name and PLU code
function correctCategory(itemName: string, productCode?: string, suggestedCategory?: string): string {
  const name = (itemName || '').toLowerCase();
  const code = productCode || '';
  
  // PLU codes for produce are typically 4-5 digits starting with 3, 4, or 9
  const isPluProduce = /^[349]\d{3,4}$/.test(code);
  
  // Produce items - fruits and vegetables
  const produceKeywords = [
    'lime', 'lemon', 'orange', 'apple', 'banana', 'grape', 'berry', 'melon',
    'pepper', 'tomato', 'cucumber', 'lettuce', 'onion', 'garlic', 'potato',
    'carrot', 'celery', 'broccoli', 'cauliflower', 'spinach', 'kale',
    'avocado', 'mango', 'pineapple', 'peach', 'plum', 'cherry', 'pear',
    'zucchini', 'squash', 'corn', 'mushroom', 'cabbage', 'asparagus',
    'green bean', 'snap pea', 'radish', 'beet', 'turnip', 'parsnip',
    'ginger', 'cilantro', 'parsley', 'basil', 'mint', 'dill', 'herb'
  ];
  
  // Dips category
  const dipsKeywords = ['guacamole', 'guacamo', 'salsa', 'hummus', 'dip', 'tzatziki', 'queso'];
  
  // Check for dips first (more specific)
  for (const keyword of dipsKeywords) {
    if (name.includes(keyword)) {
      return 'Dips';
    }
  }
  
  // Check for produce
  if (isPluProduce) {
    return 'Produce';
  }
  
  for (const keyword of produceKeywords) {
    if (name.includes(keyword)) {
      return 'Produce';
    }
  }
  
  // Default to suggested category or Pantry
  return suggestedCategory || 'Pantry';
}

function cleanProductName(name: string): string {
  if (!name) return 'Unknown Item';
  
  // Remove tax codes
  let cleaned = name.replace(/\s*(H?MRJ|RQ)\s*/gi, '').trim();
  
  // Remove trailing asterisks and other markers
  cleaned = cleaned.replace(/[\*]+$/, '').trim();
  
  // Title case
  cleaned = cleaned.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  
  // Common abbreviation expansions
  const expansions: Record<string, string> = {
    'Pc ': 'President\'s Choice ',
    'Nn ': 'No Name ',
    'Cm ': 'Country Harvest ',
    'Yog ': 'Yogurt ',
    'Org ': 'Organic ',
    'Orgnc ': 'Organic ',
    'Wht ': 'White ',
    'Grn ': 'Green ',
    'Chkn ': 'Chicken ',
    'Brn ': 'Brown ',
    'Choc ': 'Chocolate ',
    'Van ': 'Vanilla ',
    'Strw ': 'Strawberry ',
    'Rasp ': 'Raspberry ',
    'Blueb ': 'Blueberry ',
    'Ban ': 'Banana ',
    'Ras ': 'Raspberry '
  };
  
  for (const [abbr, full] of Object.entries(expansions)) {
    cleaned = cleaned.replace(new RegExp(abbr, 'gi'), full);
  }
  
  return cleaned.trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY') || Deno.env.get('GOOGLE_VISION_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Google Cloud API Key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl ?? '', serviceKey ?? '');
    const { receiptId, imageUrl } = await req.json();
    
    console.log('Processing OCR for receipt:', receiptId);

    if (!receiptId || !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Receipt ID and image URL are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isReviewMode = receiptId === 'temp-processing';

    // Download and convert image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBuffer);

    // Call Google Vision API for OCR
    console.log('Calling Vision API...');
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      }
    );

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision API error:', errorText);
      throw new Error(`Vision API error: ${visionResponse.status}`);
    }

    const visionData = await visionResponse.json();
    
    if (visionData.responses?.[0]?.error) {
      throw new Error(`Vision API error: ${visionData.responses[0].error.message}`);
    }

    const ocrText = visionData.responses?.[0]?.textAnnotations?.[0]?.description || '';
    console.log('OCR text length:', ocrText.length);
    console.log('OCR text preview:', ocrText.substring(0, 500));

    if (!ocrText) {
      throw new Error('No text detected in image');
    }

    // Parse the receipt using AI
    console.log('Parsing receipt with AI...');
    const parsedData = await parseReceiptWithAI(ocrText);
    console.log('Parsed data - items:', parsedData.items.length, 'total:', parsedData.total_amount);

    // Return data for review mode
    if (isReviewMode) {
      return new Response(
        JSON.stringify({
          success: true,
          ocrText,
          parsedData,
          message: 'Receipt processed - ready for review'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update database for non-review mode
    const { error: updateError } = await supabaseClient
      .from('receipts')
      .update({
        ocr_text: ocrText,
        store_name: parsedData.store_name,
        store_phone: parsedData.store_phone,
        store_address: parsedData.store_address,
        receipt_date: parsedData.receipt_date || new Date().toISOString().split('T')[0],
        subtotal_amount: parsedData.subtotal_amount,
        tax_amount: parsedData.tax_amount,
        total_amount: parsedData.total_amount,
        payment_method: parsedData.payment_method,
        cashier_name: parsedData.cashier_name,
        processing_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', receiptId);

    if (updateError) {
      console.error('Error updating receipt:', updateError);
      throw new Error(`Failed to update receipt: ${updateError.message}`);
    }

    // Insert items
    if (parsedData.items.length > 0) {
      const itemsToInsert = parsedData.items.map(item => ({
        receipt_id: receiptId,
        item_name: item.item_name,
        product_code: item.product_code,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        category: item.category,
        line_number: item.line_number,
      }));

      const { error: itemsError } = await supabaseClient
        .from('receipt_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Error inserting items:', itemsError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ocrText,
        parsedData,
        message: `Successfully processed receipt with ${parsedData.items.length} items`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing receipt:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to process receipt' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
