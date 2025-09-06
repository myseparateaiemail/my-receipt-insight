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

  // Find key markers in the receipt
  let itemsStartIndex = 0;
  let totalsStartIndex = lines.length;
  
  // Find start of items (look for first section header like "21-GROCERY")
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\d{2}-[A-Z\s]+/)) {
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

  // Parse store information
  parseStoreInfo(lines.slice(0, itemsStartIndex), result);
  
  // Parse items 
  parseItems(lines.slice(itemsStartIndex, totalsStartIndex), result);
  
  // Parse totals and payment info
  parseTotalsAndPayment(lines.slice(totalsStartIndex), result);
  
  // Calculate subtotal from items if not found
  if (!result.subtotal_amount && result.items.length > 0) {
    result.subtotal_amount = result.items.reduce((sum, item) => sum + item.total_price, 0);
    console.log('Calculated subtotal from items:', result.subtotal_amount);
  }
  
  console.log('Final parsed result:', JSON.stringify(result, null, 2));
  return result;
}

function parseStoreInfo(headerLines: string[], result: ReceiptData): void {
  console.log('Parsing store info from', headerLines.length, 'header lines');
  
  for (let i = 0; i < headerLines.length; i++) {
    const line = headerLines[i];
    
    // Store name - typically first few lines, all caps, business-like
    if (!result.store_name && i < 5) {
      if (line.match(/^[A-Z\s&]{3,50}$/) && !line.match(/^\d/) && line.length > 3) {
        result.store_name = line;
        console.log('Found store name:', line);
        continue;
      }
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

function parseItems(itemLines: string[], result: ReceiptData): void {
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
    
    // Skip non-item lines
    if (line.match(/^\$[\d.]+\s+ea\s+or/i) || 
        line.match(/^\d+\s+@\s+\d+\/\$[\d.]+/i) ||
        line.match(/^[HM]?R[QJ]?\s*$/i) ||
        line.match(/^\([^)]+\)$/)) {
      i++;
      continue;
    }
    
    let item = null;
    
    // Pattern 1: Standard SKU line with product name and tax code
    // Examples: "06038313771 PC SPRK WTR GFRT HMRJ"
    //          "*06222908944 KAWR DEATH BY CH MRJ" (price match with asterisk)
    //          "(1)06041008007 LAY'S HONEY BUT HMRJ D" (multi-buy)
    const skuMatch = line.match(/^(?:\(\d+\))?(\*?\d{8,15})\s+(.+?)(?:\s+([HM]?R[QJ]?)(?:\s+[A-Z])?)?$/);
    if (skuMatch) {
      const [, rawSku, productNamePart, taxCode] = skuMatch;
      const sku = rawSku.replace(/^\*/, ''); // Remove price match asterisk
      
      // Look ahead for price - could be on same line or next lines
      let price = null;
      let nextLineIndex = i + 1;
      
      // Check if price is at end of current line
      const priceOnLineMatch = productNamePart.match(/^(.+?)\s+(\d{1,3}\.\d{2})$/);
      if (priceOnLineMatch) {
        const [, productName, priceStr] = priceOnLineMatch;
        price = parseFloat(priceStr);
        item = {
          item_name: cleanProductName(productName),
          product_code: sku,
          quantity: 1,
          unit_price: price,
          total_price: price,
          line_number: lineNumber++,
          category: mapSectionToCategory(currentSection),
          tax_code: taxCode
        };
        i++;
      } else {
        // Look for price on next lines (skip tax codes and other formatting)
        while (nextLineIndex < itemLines.length && nextLineIndex < i + 5) {
          const nextLine = itemLines[nextLineIndex];
          
          // Skip lines that are just tax codes
          if (nextLine.match(/^[HM]?R[QJ]?\s*$/)) {
            nextLineIndex++;
            continue;
          }
          
          // Look for standalone price
          const priceMatch = nextLine.match(/^(\d{1,3}\.\d{2})$/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1]);
            item = {
              item_name: cleanProductName(productNamePart),
              product_code: sku,
              quantity: 1,
              unit_price: price,
              total_price: price,
              line_number: lineNumber++,
              category: mapSectionToCategory(currentSection),
              tax_code: taxCode
            };
            i = nextLineIndex + 1;
            break;
          }
          
          // Handle multi-buy scenarios - look for the final price after promotion lines
          if (nextLine.match(/^\d+\s+@\s+\d+\/\$[\d.]+/) || nextLine.match(/^\$[\d.]+\s+ea\s+or/)) {
            // Skip promotion lines and find the actual price
            let j = nextLineIndex + 1;
            while (j < itemLines.length && j < i + 8) {
              const priceLine = itemLines[j];
              const multiBuyPriceMatch = priceLine.match(/^(\d{1,3}\.\d{2})$/);
              if (multiBuyPriceMatch) {
                price = parseFloat(multiBuyPriceMatch[1]);
                item = {
                  item_name: cleanProductName(productNamePart),
                  product_code: sku,
                  quantity: 1,
                  unit_price: price,
                  total_price: price,
                  line_number: lineNumber++,
                  category: mapSectionToCategory(currentSection),
                  tax_code: taxCode
                };
                i = j + 1;
                break;
              }
              j++;
            }
            if (item) break;
          }
          
          nextLineIndex++;
        }
        
        if (!item) i++;
      }
    }
    
    // Pattern 2: PLU items (4 digits) - produce items
    else if (line.match(/^\d{4}$/)) {
      const plu = line;
      // Look for product name on next line
      if (i + 1 < itemLines.length) {
        const nextLine = itemLines[i + 1];
        if (!nextLine.match(/^\d/) && nextLine.length > 2 && !nextLine.match(/^[HM]?R[QJ]?\s*$/)) {
          // Look for weight/price info or direct price
          let j = i + 2;
          while (j < itemLines.length && j < i + 6) {
            const checkLine = itemLines[j];
            
            // Weight pattern: "0.255 kg @ $5.49/kg"
            const weightMatch = checkLine.match(/^(\d+\.?\d*)\s+kg\s+@\s+\$(\d+\.\d{2})\/kg/);
            if (weightMatch) {
              const weight = parseFloat(weightMatch[1]);
              const unitPrice = parseFloat(weightMatch[2]);
              // Price should be on next line
              if (j + 1 < itemLines.length && itemLines[j + 1].match(/^\d{1,3}\.\d{2}$/)) {
                const totalPrice = parseFloat(itemLines[j + 1]);
                item = {
                  item_name: cleanProductName(nextLine),
                  product_code: plu,
                  quantity: weight,
                  unit_price: unitPrice,
                  total_price: totalPrice,
                  line_number: lineNumber++,
                  category: mapSectionToCategory(currentSection)
                };
                i = j + 2;
                break;
              }
            }
            
            // Direct price
            else if (checkLine.match(/^\d{1,3}\.\d{2}$/) && !checkLine.match(/^\d+\.?\d*\s+kg/)) {
              const price = parseFloat(checkLine);
              item = {
                item_name: cleanProductName(nextLine),
                product_code: plu,
                quantity: 1,
                unit_price: price,
                total_price: price,
                line_number: lineNumber++,
                category: mapSectionToCategory(currentSection)
              };
              i = j + 1;
              break;
            }
            j++;
          }
        }
      }
      
      if (!item) i++;
    }
    
    else {
      i++;
    }
    
    if (item) {
      result.items.push(item);
      console.log('Parsed item:', item);
    }
  }
  
  console.log(`Successfully parsed ${result.items.length} items`);
}

function parseTotalsAndPayment(footerLines: string[], result: ReceiptData): void {
  console.log('Parsing totals and payment from', footerLines.length, 'footer lines');
  
  for (let i = 0; i < footerLines.length; i++) {
    const line = footerLines[i];
    
    // Subtotal - look for SUBTOTAL line followed by amount
    if (line.includes('SUBTOTAL') && !result.subtotal_amount) {
      // Check next few lines for the amount
      for (let j = i + 1; j <= i + 3; j++) {
        if (j < footerLines.length) {
          const amountMatch = footerLines[j].match(/^(\d{1,4}\.\d{2})$/);
          if (amountMatch) {
            result.subtotal_amount = parseFloat(amountMatch[1]);
            console.log('Found subtotal:', result.subtotal_amount);
            break;
          }
        }
      }
    }
    
    // Tax calculation - look for format "36.32 @ 13.000% 4.72"
    const taxCalcMatch = line.match(/^([\d.]+)\s+@\s+([\d.]+)%\s+([\d.]+)$/);
    if (taxCalcMatch && !result.tax_amount) {
      const taxAmount = parseFloat(taxCalcMatch[3]);
      result.tax_amount = taxAmount;
      console.log('Found tax from calculation line:', taxAmount);
    }
    
    // Total - look for standalone total amount (usually follows tax calculation)
    if (!result.total_amount) {
      // Check for total after tax calculation or TOTAL keyword
      const totalMatch = line.match(/^(\d{1,4}\.\d{2})$/);
      if (totalMatch && (i > 0 && (footerLines[i-1].includes('@') || footerLines[i-1].includes('TOTAL')))) {
        result.total_amount = parseFloat(totalMatch[1]);
        console.log('Found total:', result.total_amount);
      }
      
      // Also check lines after "TOTAL" keyword
      if (line.match(/^TOTAL$/i)) {
        for (let j = i + 1; j <= i + 5; j++) {
          if (j < footerLines.length) {
            const nextLine = footerLines[j];
            // Skip transaction type lines
            if (nextLine.includes('Trans. Type:') || nextLine.includes('Account:')) continue;
            
            const amountMatch = nextLine.match(/^(\d{1,4}\.\d{2})$/);
            if (amountMatch) {
              result.total_amount = parseFloat(amountMatch[1]);
              console.log('Found total after TOTAL keyword:', result.total_amount);
              break;
            }
          }
        }
      }
    }
    
    // Receipt date
    const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{2,4}[\s\d:]+)/);
    if (dateMatch && !result.receipt_date) {
      result.receipt_date = dateMatch[1];
      console.log('Found date:', result.receipt_date);
    }
    
    // Payment method
    if (line.includes('Card Type:') && !result.payment_method) {
      result.payment_method = line;
      console.log('Found payment method:', line);
    }
  }
}

function cleanProductName(name: string): string {
  if (!name) return '';
  
  // Remove tax codes and common suffixes
  let cleaned = name
    .replace(/\s+([HM]?R[QJ]?)$/i, '') // Remove tax codes like HMRJ, MRJ, RQ
    .replace(/\s+ea$/i, '') // Remove "ea" suffix
    .trim();
  
  // Expand common abbreviations
  const abbreviations: { [key: string]: string } = {
    'PC': 'President\'s Choice',
    'NN': 'No Name',
    'MM': 'Memories of',
    'CM': 'Casa Mendosa',
    'SPRK WTR': 'Sparkling Water',
    'CRN PEACHES': 'Corn Peaches', 
    'BLK BEANS': 'Black Beans',
    'CLNR': 'Cleaner',
    'TRIGR': 'Trigger',
    'BURRITO WH': 'Burrito Whole',
    'XTR LEAN SRLN': 'Extra Lean Sirloin',
    'MINI CRN TORT': 'Mini Corn Tortillas',
    'CHUNKY HOT GU': 'Chunky Hot Guacamole',
    'ULT ABAB': 'Ultra Absorb',
    'LVZZ GRN ARO GRD': 'Lavazza Green Aroma Ground',
    'NESCAFE 1+2 INST': 'Nescafe 1+2 Instant',
    'REFRIED BEAN': 'Refried Beans',
    'UNCL BSMTI CL LI': 'Uncle Ben\'s Basmati Rice',
    'GLASS CLNR TRIGR': 'Glass Cleaner Trigger',
    'REALIME JUICE': 'Real Lime Juice',
    'FINE SUGAR': 'Fine Sugar',
    'SALSA CON QU': 'Salsa Con Queso',
    'AHA RASBRY ACAI': 'Aha Raspberry Acai',
    'CHARRAS CHIPOTLE': 'Charras Chipotle',
    'GAY SOUR CR': 'Gay Lea Sour Cream',
    'NEILSON 2% 4LT': 'Neilson 2% Milk 4L',
    'ONION RED': 'Red Onion',
    'TOV GH RED': 'Tomatoes Red',
    'PEP JALEPANO HOT': 'Hot Jalapeño Peppers',
    'ORGNC LETTUCE': 'Organic Lettuce',
    'BASA FILLET TP': 'Basa Fillet',
    'MICRO ARUGULA50G': 'Micro Arugula 50g'
  };
  
  // Apply abbreviation expansions
  for (const [abbrev, expansion] of Object.entries(abbreviations)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    cleaned = cleaned.replace(regex, expansion);
  }
  
  // Convert to proper title case
  cleaned = cleaned.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  
  return cleaned;
}

function mapSectionToCategory(section: string): string {
  const mapping: { [key: string]: string } = {
    'GROCERY': 'Pantry',
    'PRODUCE': 'Produce', 
    'DAIRY': 'Dairy',
    'BAKERY': 'Bakery',
    'BAKERY COMMERCIAL': 'Bakery',
    'MEAT': 'Meats',
    'MEATS': 'Meats',
    'NEATS': 'Meats', // OCR error for MEATS
    'SEAFOOD': 'Seafood',
    'FROZEN': 'Frozen',
    'DELI': 'Deli',
    'HOUSEHOLD': 'Household',
    'HEALTH': 'Health',
    'COSMETICS': 'Cosmetics & Pharmacy',
    'PHARMACY': 'Cosmetics & Pharmacy',
    'BEVERAGES': 'Beverages',
    'SNACKS': 'Snacks',
    'CANNED': 'Canned Goods',
    'INTERNATIONAL': 'International Foods'
  };
  
  const upperSection = section.toUpperCase();
  return mapping[upperSection] || 'Pantry';
}

function validateParsedData(result: ReceiptData): void {
  console.log('Validating parsed data...');
  
  // Validate totals if we have all three values
  if (result.subtotal_amount && result.tax_amount && result.total_amount) {
    const calculatedTotal = Math.round((result.subtotal_amount + result.tax_amount) * 100) / 100;
    const difference = Math.abs(calculatedTotal - result.total_amount);
    
    if (difference > 0.02) { // Allow for rounding differences
      console.log('Warning: Total validation failed', {
        subtotal: result.subtotal_amount,
        tax: result.tax_amount,
        total: result.total_amount,
        calculated: calculatedTotal,
        difference: difference
      });
    }
  }
  
  // Remove invalid items
  result.items = result.items.filter(item => {
    if (!item.item_name || item.item_name.length < 2) return false;
    if (!item.total_price || item.total_price <= 0) return false;
    return true;
  });
}