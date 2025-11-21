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
    product_code?: string;
    quantity?: number;
    unit_price?: number;
    total_price: number;
    category?: string;
    line_number?: number;
    tax_code?: string;
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
    const allEnvVars = Deno.env.toObject();
    const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    
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

    // Check if this is a review mode request (temp ID)
    const isReviewMode = receiptId === 'temp-processing';

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
    const responseSummary = {
      hasResponses: !!visionData.responses,
      responseCount: visionData.responses?.length ?? 0,
      firstTextAnnotationLength: visionData.responses?.[0]?.textAnnotations?.[0]?.description?.length ?? 0,
    };
    console.log('Vision API response summary:', JSON.stringify(responseSummary));

    if (!visionData.responses || !visionData.responses[0]) {
      throw new Error('No response from Vision API');
    }

    const textAnnotations = visionData.responses[0].textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
      throw new Error('No text detected in image');
    }

    const extractedText = textAnnotations[0].description;
    console.log('Extracted text length:', extractedText.length);

    // Parse the extracted text to structured data
    const parsedData = parseReceiptText(extractedText);
    console.log('Parsed receipt data:', JSON.stringify(parsedData));

    // Validate parsed data
    validateParsedData(parsedData);
    console.log('Validation complete. ' + parsedData.items.length + ' valid items found.');

    // Only update database if not in review mode
    if (!isReviewMode) {
      console.log('Updating receipt with parsed data...');
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
    } else {
      console.log('Review mode - skipping database update');
    }

    return new Response(
      JSON.stringify({
        success: true,
        reviewMode: isReviewMode,
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
  console.log('Starting receipt parsing with text length:', text.length);
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  console.log('Total lines to process:', lines.length);
  
  const result: ReceiptData = {
    items: [],
  };

  // Find key sections more accurately
  let itemsStartIndex = 0;
  let totalsStartIndex = lines.length;
  
  // Find start of items section (after store header)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\d{2}-[A-Z\s]+/) || lines[i].includes('Welcome #')) {
      itemsStartIndex = i;
      break;
    }
  }
  
  // Find start of totals section
  for (let i = itemsStartIndex; i < lines.length; i++) {
    if (lines[i].includes('SUBTOTAL')) {
      totalsStartIndex = i;
      break;
    }
  }

  console.log(`Parsing sections: Header (0-${itemsStartIndex}), Items (${itemsStartIndex}-${totalsStartIndex}), Totals (${totalsStartIndex}+)`);

  // Parse store information from header
  parseStoreInfo(lines.slice(0, itemsStartIndex), result);
  
  // Parse items with improved multi-line handling
  parseItemsComprehensive(lines.slice(itemsStartIndex, totalsStartIndex), result);
  
  // Parse totals and payment info with better tax/total extraction
  parseTotalsAndPaymentImproved(lines.slice(totalsStartIndex), result);
  
  // Only calculate subtotal from items if not found on receipt
  // IMPORTANT: Prefer receipt-stated subtotal as it's authoritative
  if (!result.subtotal_amount && result.items.length > 0) {
    const calculatedSubtotal = result.items.reduce((sum, item) => sum + (item.total_price || 0), 0);
    console.log('WARNING: Subtotal not found on receipt. Using calculated subtotal from items:', calculatedSubtotal);
    result.subtotal_amount = calculatedSubtotal;
  } else if (result.subtotal_amount) {
    const calculatedSubtotal = result.items.reduce((sum, item) => sum + (item.total_price || 0), 0);
    const difference = Math.abs(result.subtotal_amount - calculatedSubtotal);
    if (difference > 0.01) {
      console.log(`WARNING: Receipt subtotal (${result.subtotal_amount}) differs from calculated (${calculatedSubtotal}) by $${difference.toFixed(2)} - likely missing items`);
    }
  }
  
  console.log('Final parsed result summary:', {
    store_name: result.store_name,
    itemCount: result.items.length,
    subtotal: result.subtotal_amount,
    tax: result.tax_amount,
    total: result.total_amount,
  });
  return result;
}

function parseStoreInfo(headerLines: string[], result: ReceiptData): void {
  console.log('Parsing store info from', headerLines.length, 'header lines');
  
  for (let i = 0; i < headerLines.length; i++) {
    const line = headerLines[i];
    
    // Store name - look for Real Canadian Superstore specifically
    if (!result.store_name && (line.includes('REAL CANADIAN') || line.includes('SUPERSTORE'))) {
      result.store_name = 'REAL CANADIAN';
      console.log('Found store name:', result.store_name);
      continue;
    }

    // Store phone - phone number pattern
    if (!result.store_phone && line.match(/\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/)) {
      result.store_phone = line;
      console.log('Found store phone:', line);
      continue;
    }

    // Store address - contains street indicators
    if (!result.store_address && line.match(/\d+\s+[A-Za-z\s]+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way)/i)) {
      result.store_address = line;
      console.log('Found store address:', line);
      continue;
    }
  }
}

function parseItemsComprehensive(itemLines: string[], result: ReceiptData): void {
  console.log('Parsing items from', itemLines.length, 'item lines');
  let currentSection = 'GROCERY';
  let lineNumber = 1;
  let i = 0;
  
  while (i < itemLines.length) {
    const line = itemLines[i];
    
    // Track section headers (like "21-GROCERY", "27-PRODUCE")
    const sectionMatch = line.match(/^\d{2}-(.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      console.log('Found section:', currentSection);
      i++;
      continue;
    }
    
    // Skip obvious garbage OCR lines
    if (shouldSkipOCRLine(line)) {
      i++;
      continue;
    }
    
    // Try to parse a complete item starting at this line
    const itemParseResult = parseCompleteItemAtIndex(itemLines, i, currentSection, lineNumber);
    
    if (itemParseResult.item) {
      result.items.push(itemParseResult.item);
      // Log only a lightweight summary to avoid memory issues on long receipts
      if (result.items.length <= 20 || result.items.length % 20 === 0) {
        console.log('Parsed item count:', result.items.length, 'Latest item name:', itemParseResult.item.item_name);
      }
      lineNumber++;
      i = itemParseResult.nextIndex;
    } else {
      i++;
    }
  }

  console.log('Successfully parsed', result.items.length, 'items');
}

function shouldSkipOCRLine(line: string): boolean {
  // Skip common OCR garbage patterns
  const garbagePatterns = [
    'lonipho', 'ritiw', 'zmuto', 'fiw', 'boq', 'bap', 'Box',
    'VO ', 'AM', 'inmez', 'odmen', 'libro', 'linoviue', 'bogoldm',
    'iangomine', 'alipie', 'qaxe', 'aonih', 'Welcome', 'Big on Fresh'
  ];
  
  // Skip promotional and points reward lines
  if (/\d+\s+Pts/i.test(line) || /^Pts\b/i.test(line) || /In-Store Offers/i.test(line) || /Digital [Oo]ffers/i.test(line)) {
    return true;
  }
  
  return garbagePatterns.some(pattern => line.includes(pattern)) ||
         line.length < 3 ||
         /^[A-Z]{1,3}$/.test(line) || // Single letters
         /^\d{1,3}$/.test(line) ||   // Standalone numbers under 1000
         /^[HM]?R[QJ]?\s*$/.test(line); // Just tax codes
}

function parseCompleteItemAtIndex(lines: string[], startIndex: number, section: string, lineNumber: number) {
  const line = lines[startIndex];
  let i = startIndex;
  
  // Pattern 1: Full SKU line with product name and optional price
  // Examples: "06038313771 PC SPRK WTR GFRT HMRJ 5.25"
  //          "*06222908944 KAWR DEATH BY CH MRJ" (price match asterisk)
  //          "(1)06041008007 LAY'S HONEY BUT HMRJ D" (multi-buy prefix)
  const fullSkuMatch = line.match(/^(?:\(\d+\))?(\*?\d{8,15})\s+(.+?)(?:\s+([HM]?R[QJ]?))?(?:\s+([A-Z]))?\s*(\d+\.\d{2})?$/);
  
  if (fullSkuMatch) {
    const [, rawSku, productNamePart, taxCode, , priceOnLine] = fullSkuMatch;
    const sku = rawSku.replace(/^\*/, ''); // Remove price match asterisk
    let itemName = productNamePart.replace(/\s+([HM]?R[QJ]?)\s*$/, '').trim();
    let totalPrice = priceOnLine ? parseFloat(priceOnLine) : 0;
    let quantity = 1;
    let unitPrice = totalPrice;
    
    // If no price on main line, look ahead for pricing info
    if (!totalPrice) {
      i++;
      let lookAheadLimit = Math.min(i + 6, lines.length);
      
      while (i < lookAheadLimit) {
        const nextLine = lines[i];
        
        // Skip promotional/points lines
        if (/\d+\s+Pts/i.test(nextLine) || /In-Store Offers/i.test(nextLine)) {
          i++;
          continue;
        }
        
        // Skip pure tax code lines
        if (/^[HM]?R[QJ]?\s*$/.test(nextLine)) {
          i++;
          continue;
        }
        
        // Multi-buy pattern: "2 @ 2/$7.50 KB" followed by "7.50"
        const multiBuyMatch = nextLine.match(/(\d+)\s*@\s*(\d+)\/\$(\d+\.\d{2})/);
        if (multiBuyMatch) {
          const buyQty = parseInt(multiBuyMatch[1]);
          const dealQty = parseInt(multiBuyMatch[2]);
          const dealPrice = parseFloat(multiBuyMatch[3]);
          
          // Look for final price on next line
          if (i + 1 < lines.length) {
            const priceLine = lines[i + 1];
            const finalPriceMatch = priceLine.match(/^(\d+\.\d{2})$/);
            if (finalPriceMatch) {
              totalPrice = parseFloat(finalPriceMatch[1]);
              quantity = buyQty;
              unitPrice = totalPrice / quantity;
              i += 2;
              break;
            }
          }
        }
        
        // Weight pattern: "0.255 kg @ $5.49/kg" followed by price
        const weightMatch = nextLine.match(/(\d+\.\d+)\s*kg\s*@\s*\$(\d+\.\d{2})\/kg/);
        if (weightMatch) {
          quantity = parseFloat(weightMatch[1]);
          unitPrice = parseFloat(weightMatch[2]);
          
          // Look for total price on next line
          if (i + 1 < lines.length) {
            const priceLine = lines[i + 1];
            const totalPriceMatch = priceLine.match(/^(\d+\.\d{2})$/);
            if (totalPriceMatch) {
              totalPrice = parseFloat(totalPriceMatch[1]);
              i += 2;
              break;
            }
          }
        }
        
        // Simple standalone price
        const standalonePriceMatch = nextLine.match(/^(\d+\.\d{2})$/);
        if (standalonePriceMatch) {
          totalPrice = parseFloat(standalonePriceMatch[1]);
          unitPrice = totalPrice;
          i++; // i now points to line after price
          break;
        }
        
        // Bulk pricing pattern: "$0.89 ea or 5/$4.00 KB"
        const bulkPriceMatch = nextLine.match(/\$(\d+\.\d{2})\s*ea\s*or\s*\d+\/\$(\d+\.\d{2})/);
        if (bulkPriceMatch) {
          unitPrice = parseFloat(bulkPriceMatch[1]);
          i++;
          // Look for quantity and final price in next lines
          continue;
        }
        
        // If we hit another item or reached a stopping point, break
        if (nextLine.match(/^\d{8,15}/) || nextLine.match(/^\d{2}-/) || shouldSkipOCRLine(nextLine)) {
          break;
        }
        
        i++;
      }
    }
    
    if (totalPrice > 0) {
      const item = {
        item_name: cleanProductName(itemName),
        product_code: sku,
        quantity: quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        line_number: lineNumber,
        category: mapSectionToCategory(section),
        tax_code: taxCode
      };
      
      // Return i directly - it already points to next line after consumption
      // Only add +1 if we never moved from startIndex (price was on same line)
      const safeNextIndex = i > startIndex ? i : startIndex + 1;
      return { item, nextIndex: safeNextIndex };
    }
  }
  
  // Pattern 2: PLU items (4-digit codes) - typically produce
  const pluMatch = line.match(/^(\d{4})\s+(.+?)(?:\s+([HM]?R[QJ]?))?$/);
  if (pluMatch) {
    const [, plu, productName, taxCode] = pluMatch;
    let totalPrice = 0;
    let quantity = 1;
    let unitPrice = 0;
    
    // Look ahead for pricing
    i++;
    while (i < Math.min(startIndex + 5, lines.length)) {
      const nextLine = lines[i];
      
      // Weight pricing
      const weightMatch = nextLine.match(/(\d+\.\d+)\s*kg\s*@\s*\$(\d+\.\d{2})\/kg/);
      if (weightMatch) {
        quantity = parseFloat(weightMatch[1]);
        unitPrice = parseFloat(weightMatch[2]);
        
        // Look for total price
        if (i + 1 < lines.length) {
          const priceLine = lines[i + 1];
          const priceMatch = priceLine.match(/^(\d+\.\d{2})$/);
          if (priceMatch) {
            totalPrice = parseFloat(priceMatch[1]);
            i += 2;
            break;
          }
        }
      }
      
      // Quantity and unit price: "2 @ $0.79"
      const qtyPriceMatch = nextLine.match(/(\d+)\s*@\s*\$(\d+\.\d{2})/);
      if (qtyPriceMatch) {
        quantity = parseInt(qtyPriceMatch[1]);
        unitPrice = parseFloat(qtyPriceMatch[2]);
        
        // Look for total
        if (i + 1 < lines.length) {
          const priceLine = lines[i + 1];
          const priceMatch = priceLine.match(/^(\d+\.\d{2})$/);
          if (priceMatch) {
            totalPrice = parseFloat(priceMatch[1]);
            i += 2;
            break;
          }
        }
      }
      
      // Direct price
      const directPriceMatch = nextLine.match(/^(\d+\.\d{2})$/);
      if (directPriceMatch) {
        totalPrice = parseFloat(directPriceMatch[1]);
        unitPrice = totalPrice;
        i++;
        break;
      }
      
      i++;
    }
    
    if (totalPrice > 0) {
      const item = {
        item_name: cleanProductName(productName),
        product_code: plu,
        quantity: quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        line_number: lineNumber,
        category: mapSectionToCategory(section),
        tax_code: taxCode
      };
      
      // Return i directly - it already points to next line
      const safeNextIndex = i > startIndex ? i : startIndex + 1;
      return { item, nextIndex: safeNextIndex };
    }
  }
  
  return { item: null, nextIndex: startIndex + 1 };
}

function parseTotalsAndPaymentImproved(footerLines: string[], result: ReceiptData): void {
  console.log('Parsing totals and payment from', footerLines.length, 'footer lines');
  
  for (let i = 0; i < footerLines.length; i++) {
    const line = footerLines[i];
    
    // Subtotal - look for SUBTOTAL line followed by amount
    if (line.includes('SUBTOTAL') && !result.subtotal_amount) {
      // Check current line and next few lines for the amount
      const subtotalMatch = line.match(/(\d+\.\d{2})/) ||
                           (i + 1 < footerLines.length ? footerLines[i + 1].match(/(\d+\.\d{2})/) : null);
      if (subtotalMatch) {
        result.subtotal_amount = parseFloat(subtotalMatch[1]);
        console.log('Found subtotal:', result.subtotal_amount);
      }
    }
    
    // Tax from HST line - look for "H=HST 13% X.XX @ 13.000%" followed by tax amount
    if (line.includes('HST') && line.includes('%')) {
      // Tax amount is usually on the next line or after the percentage
      for (let j = i; j < Math.min(i + 3, footerLines.length); j++) {
        const taxLine = footerLines[j];
        const taxMatch = taxLine.match(/(\d+\.\d{2})$/);
        if (taxMatch) {
          const taxAmount = parseFloat(taxMatch[1]);
          // Tax should be reasonable (less than 20% of subtotal and under $20)
          if (taxAmount < (result.subtotal_amount || 100) * 0.2 && taxAmount < 20 && taxAmount > 0) {
            result.tax_amount = taxAmount;
            console.log('Found tax amount:', result.tax_amount);
            break;
          }
        }
      }
    }
    
    // Total - look for TOTAL keyword followed by amount
    if (line.includes('TOTAL') && !line.includes('SUBTOTAL')) {
      // Look for total amount in current line or next few lines
      for (let j = i; j < Math.min(i + 3, footerLines.length); j++) {
        const totalLine = footerLines[j];
        const totalMatch = totalLine.match(/(\d+\.\d{2})/);
        if (totalMatch) {
          const totalAmount = parseFloat(totalMatch[1]);
          // Total should be greater than subtotal
          if (totalAmount >= (result.subtotal_amount || 0) && totalAmount < (result.subtotal_amount || 0) + 50) {
            result.total_amount = totalAmount;
            console.log('Found total:', result.total_amount);
            break;
          }
        }
      }
    }
    
    // Payment method
    if (line.includes('Card Type:')) {
      result.payment_method = line.trim();
      console.log('Found payment method:', result.payment_method);
    }
    
    // Date
    const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{2,4}\s+\d{2}:\d{2}:\d{2})/);
    if (dateMatch) {
      result.receipt_date = dateMatch[1];
      console.log('Found date:', result.receipt_date);
    }
  }
}

function cleanProductName(name: string): string {
  return name
    .replace(/\s+(HMRJ|MRJ|TP)\s*$/, '')
    .replace(/^\*/, '') // Remove price match asterisk
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function mapSectionToCategory(section: string): string {
  const categoryMap: { [key: string]: string } = {
    'GROCERY': 'Pantry',
    'PRODUCE': 'Produce', 
    'SEAFOOD': 'Seafood',
    'BAKERY COMMERCIAL': 'Bakery',
    'BAKERY': 'Bakery',
    'DELI': 'Deli',
    'FROZEN': 'Frozen',
    'HOME': 'Household'
  };
  
  return categoryMap[section] || 'Pantry';
}

function validateParsedData(data: ReceiptData): void {
  console.log('Validating parsed data...');

  // Validate items
  data.items = data.items.filter(item => {
    if (!item.item_name || item.item_name.trim().length === 0) {
      console.log('Filtering out item with empty name');
      return false;
    }

    if (!item.total_price || item.total_price <= 0) {
      console.log('Filtering out item with invalid price');
      return false;
    }

    // Set defaults for missing fields
    if (!item.quantity) item.quantity = 1;
    if (!item.unit_price) item.unit_price = item.total_price;
    if (!item.category) item.category = 'Pantry';
    if (!item.line_number) item.line_number = 1;

    return true;
  });

  console.log('Validation complete.', data.items.length, 'valid items found.');
}