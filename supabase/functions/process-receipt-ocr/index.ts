import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReceiptData {
  store_name?: string;
  store_address?: string;
  store_phone?: string;
  receipt_date?: string;
  receipt_number?: string;
  subtotal_amount?: number;
  tax_amount?: number;
  total_amount?: number;
  tip_amount?: number;
  discount_amount?: number;
  payment_method?: string;
  cashier_name?: string;
  items: Array<{
    item_name: string;
    quantity?: number;
    unit_price?: number;
    total_price: number;
    category?: string;
    line_number?: number;
  }>;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Force function redeploy - v2.1
    const allEnvVars = Deno.env.toObject();
    const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    
    // Test if OTHER secrets work to isolate the issue
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('=== COMPREHENSIVE SECRET DEBUG ===');
    console.log('All environment variables:', Object.keys(allEnvVars));
    console.log('SUPABASE_URL present:', !!supabaseUrl);
    console.log('SUPABASE_URL length:', supabaseUrl?.length || 0);
    console.log('SERVICE_KEY present:', !!serviceKey);
    console.log('SERVICE_KEY length:', serviceKey?.length || 0);
    console.log('GOOGLE_API_KEY present:', !!apiKey);
    console.log('GOOGLE_API_KEY length:', apiKey?.length || 0);
    console.log('Raw Google API key value:', JSON.stringify(apiKey));
    console.log('===================================');

    // Try BOTH the old and new secret names
    if ((!apiKey || apiKey.trim() === '') && !Deno.env.get('GOOGLE_VISION_API_KEY')) {
      console.error('CRITICAL: No Google API Key found with either name');
      console.error('Environment variables present:', Object.keys(allEnvVars));
      return new Response(JSON.stringify({ 
        error: 'Google Cloud API Key not configured properly',
        debug: {
          oldKeyPresent: !!apiKey,
          oldKeyLength: apiKey?.length || 0,
          newKeyPresent: !!Deno.env.get('GOOGLE_VISION_API_KEY'),
          newKeyLength: Deno.env.get('GOOGLE_VISION_API_KEY')?.length || 0,
          allVars: Object.keys(allEnvVars)
        }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { receiptId, imageUrl } = await req.json();
    console.log('Processing OCR for receipt:', receiptId, 'with image:', imageUrl);

    if (!receiptId || !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Receipt ID and image URL are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download the image from Supabase storage
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBuffer);

    // Use whichever API key is available
    const visionApiKey = Deno.env.get('GOOGLE_VISION_API_KEY') || Deno.env.get('GOOGLE_CLOUD_API_KEY');
    console.log('Final API key selection - Key present:', !!visionApiKey);
    console.log('Final API key selection - Key length:', visionApiKey?.length || 0);
    console.log('Final API key selection - Source:', Deno.env.get('GOOGLE_VISION_API_KEY') ? 'GOOGLE_VISION_API_KEY' : 'GOOGLE_CLOUD_API_KEY');
    
    if (!visionApiKey || visionApiKey.trim() === '') {
      console.error('No valid Google API key found from either source');
      throw new Error('Google Vision API key not configured');
    }

    console.log('Calling Vision API...');
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                  maxResults: 1,
                },
              ],
            },
          ],
        }),
      }
    );

    console.log('Vision API response status:', visionResponse.status);
    console.log('Vision API response headers:', Object.fromEntries(visionResponse.headers.entries()));
    
    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision API error details:');
      console.error('Status:', visionResponse.status);
      console.error('Status Text:', visionResponse.statusText);
      console.error('Response:', errorText);
      console.error('API Key used (first 20):', visionApiKey?.substring(0, 20));
      
      return new Response(JSON.stringify({ 
        error: 'Vision API request failed',
        details: {
          status: visionResponse.status,
          statusText: visionResponse.statusText,
          response: errorText,
          apiKeyPresent: !!visionApiKey,
          apiKeyLength: visionApiKey?.length || 0
        }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const visionData = await visionResponse.json();
    console.log('Vision API response:', JSON.stringify(visionData));

    if (!visionData.responses || !visionData.responses[0]) {
      throw new Error('No response from Vision API');
    }

    const textAnnotations = visionData.responses[0].textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
      throw new Error('No text detected in image');
    }

    const extractedText = textAnnotations[0].description;
    console.log('Extracted text:', extractedText);

    // Parse the extracted text to structured data
    const parsedData = parseReceiptText(extractedText);
    console.log('Parsed receipt data:', JSON.stringify(parsedData));

    // Update the receipt with OCR data
    const { error: updateError } = await supabaseClient
      .from('receipts')
      .update({
        ocr_text: extractedText,
        store_name: parsedData.store_name,
        store_address: parsedData.store_address,
        store_phone: parsedData.store_phone,
        receipt_number: parsedData.receipt_number,
        subtotal_amount: parsedData.subtotal_amount,
        tax_amount: parsedData.tax_amount,
        total_amount: parsedData.total_amount || 0,
        tip_amount: parsedData.tip_amount,
        discount_amount: parsedData.discount_amount,
        payment_method: parsedData.payment_method,
        cashier_name: parsedData.cashier_name,
        processing_status: 'completed',
        confidence_score: 0.85,
        updated_at: new Date().toISOString(),
      })
      .eq('id', receiptId);

    if (updateError) {
      console.error('Error updating receipt:', updateError);
      throw updateError;
    }

    // Insert receipt items
    if (parsedData.items.length > 0) {
      const itemsToInsert = parsedData.items.map(item => ({
        receipt_id: receiptId,
        item_name: item.item_name,
        quantity: item.quantity || 1,
        unit_price: item.unit_price,
        total_price: item.total_price,
        category: item.category,
        line_number: item.line_number,
      }));

      const { error: itemsError } = await supabaseClient
        .from('receipt_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Error inserting receipt items:', itemsError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        extractedText,
        parsedData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-receipt-ocr function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function parseReceiptText(text: string): ReceiptData {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const result: ReceiptData = {
    items: [],
  };

  let currentLineNumber = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Store name (usually first non-empty line or lines with common store patterns)
    if (!result.store_name && i < 5) {
      if (line.match(/^[A-Z\s&]+$/) && line.length > 3 && line.length < 50) {
        result.store_name = line;
        continue;
      }
    }

    // Store address
    if (!result.store_address && line.match(/\d+\s+[A-Za-z\s]+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive)/i)) {
      result.store_address = line;
      continue;
    }

    // Store phone
    if (!result.store_phone && line.match(/\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/)) {
      result.store_phone = line;
      continue;
    }

    // Date patterns
    if (!result.receipt_date && line.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) {
      result.receipt_date = line;
      continue;
    }

    // Receipt number
    if (!result.receipt_number && line.match(/(?:receipt|trans|order)[\s#]*(\d+)/i)) {
      const match = line.match(/(?:receipt|trans|order)[\s#]*(\d+)/i);
      if (match) result.receipt_number = match[1];
      continue;
    }

    // Payment method
    if (line.match(/(?:cash|card|credit|debit|visa|master|american)/i)) {
      result.payment_method = line;
      continue;
    }

    // Cashier
    if (line.match(/(?:cashier|clerk|served by):?\s*(.+)/i)) {
      const match = line.match(/(?:cashier|clerk|served by):?\s*(.+)/i);
      if (match) result.cashier_name = match[1];
      continue;
    }

    // Totals
    if (line.match(/subtotal/i) && line.match(/\$?(\d+\.?\d*)/)) {
      const match = line.match(/\$?(\d+\.?\d*)/);
      if (match) result.subtotal_amount = parseFloat(match[1]);
      continue;
    }

    if (line.match(/tax/i) && line.match(/\$?(\d+\.?\d*)/)) {
      const match = line.match(/\$?(\d+\.?\d*)/);
      if (match) result.tax_amount = parseFloat(match[1]);
      continue;
    }

    if (line.match(/total/i) && line.match(/\$?(\d+\.?\d*)/)) {
      const match = line.match(/\$?(\d+\.?\d*)/);
      if (match) result.total_amount = parseFloat(match[1]);
      continue;
    }

    if (line.match(/tip/i) && line.match(/\$?(\d+\.?\d*)/)) {
      const match = line.match(/\$?(\d+\.?\d*)/);
      if (match) result.tip_amount = parseFloat(match[1]);
      continue;
    }

    if (line.match(/discount/i) && line.match(/\$?(\d+\.?\d*)/)) {
      const match = line.match(/\$?(\d+\.?\d*)/);
      if (match) result.discount_amount = parseFloat(match[1]);
      continue;
    }

    // Items (lines with price patterns)
    const priceMatch = line.match(/(.+?)\s+\$?(\d+\.?\d*)$/);
    if (priceMatch && !line.match(/total|tax|subtotal|discount|tip/i)) {
      const itemName = priceMatch[1].trim();
      const price = parseFloat(priceMatch[2]);
      
      if (itemName.length > 0 && price > 0) {
        // Try to extract quantity if present
        let quantity = 1;
        let cleanItemName = itemName;
        
        const qtyMatch = itemName.match(/^(\d+)\s*x?\s*(.+)/i);
        if (qtyMatch) {
          quantity = parseInt(qtyMatch[1]);
          cleanItemName = qtyMatch[2].trim();
        }

        result.items.push({
          item_name: cleanItemName,
          quantity,
          total_price: price,
          unit_price: price / quantity,
          line_number: currentLineNumber++,
        });
      }
    }
  }

  return result;
}