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

  // Identify receipt sections to improve parsing accuracy
  const sections = identifyReceiptSections(lines);
  console.log('Identified sections:', sections);

  // Parse store information (header section)
  parseStoreInfo(lines.slice(0, sections.itemsStart), result);
  
  // Parse items (between items start and totals start)
  parseItems(lines.slice(sections.itemsStart, sections.totalsStart), result);
  
  // Parse totals and payment info
  parseTotalsAndPayment(lines.slice(sections.totalsStart), result);
  
  // Validate and clean up the parsed data
  validateParsedData(result);
  
  console.log('Final parsed result:', JSON.stringify(result, null, 2));
  return result;
}

function identifyReceiptSections(lines: string[]): { itemsStart: number, totalsStart: number } {
  let itemsStart = 0;
  let totalsStart = lines.length;
  
  // Find where items typically start (after store info, before first item with UPC/price)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look for UPC codes or clear item patterns
    if (line.match(/^\d{8,15}\s+/) || line.match(/^[A-Z0-9\s]{10,}\s+\d+\.\d{2}$/)) {
      itemsStart = i;
      break;
    }
    // Grocery section indicators
    if (line.match(/^\d{2}-[A-Z]+$/)) {
      itemsStart = i + 1;
      break;
    }
  }
  
  // Find where totals start
  for (let i = itemsStart; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^SUBTOTAL$/i) || line.match(/^H=HST/) || line.match(/^TOTAL$/i)) {
      totalsStart = i;
      break;
    }
  }
  
  return { itemsStart, totalsStart };
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
  let currentLineNumber = 1;
  let currentSection = '';
  
  for (let i = 0; i < itemLines.length; i++) {
    const line = itemLines[i];
    
    // Track section headers for categorization
    if (line.match(/^\d{2}-[A-Z\s]+$/)) {
      currentSection = line.replace(/^\d{2}-/, '').trim();
      console.log('Found section:', currentSection);
      continue;
    }
    
    // Skip obvious non-item lines
    if (isNonItemLine(line)) {
      continue;
    }
    
    const item = parseMultiLineItem(itemLines, i, currentLineNumber, currentSection);
    if (item) {
      result.items.push(item);
      currentLineNumber++;
      console.log('Parsed item:', item);
      // Skip the lines we've already processed
      i = item.lastProcessedIndex || i;
    }
  }
}

function parseMultiLineItem(lines: string[], startIndex: number, lineNumber: number, currentSection: string): any | null {
  const line = lines[startIndex];
  const nextLine = startIndex + 1 < lines.length ? lines[startIndex + 1] : '';
  const thirdLine = startIndex + 2 < lines.length ? lines[startIndex + 2] : '';
  const fourthLine = startIndex + 3 < lines.length ? lines[startIndex + 3] : '';
  
  // Pattern 1: UPC code followed by product name, then tax code, then price
  // Example: "05889125222" -> "FINE SUGAR" -> "MRJ" -> "3.49"
  let match = line.match(/^(\d{8,15})$/);
  if (match) {
    const upc = match[1];
    let productName = '';
    let taxCode = '';
    let price = 0;
    let processedIndex = startIndex;
    
    // Look ahead for product name, tax code, and price
    if (nextLine && !nextLine.match(/^\d/) && !nextLine.match(/^[HM]?RQ?$/)) {
      productName = cleanItemName(nextLine);
      processedIndex++;
      
      // Check if third line is tax code (HMRJ, MRJ, RQ, etc.)
      if (thirdLine && thirdLine.match(/^[HM]?RQ?$/)) {
        taxCode = thirdLine;
        processedIndex++;
        
        // Fourth line should be price
        if (fourthLine && fourthLine.match(/^\d{1,3}\.\d{2}$/)) {
          price = parseFloat(fourthLine);
          processedIndex++;
        }
      } else if (thirdLine && thirdLine.match(/^\d{1,3}\.\d{2}$/)) {
        // Price directly after product name
        price = parseFloat(thirdLine);
        processedIndex++;
      }
    }
    
    if (productName && isValidPrice(price)) {
      return {
        item_name: productName,
        product_code: upc,
        quantity: 1,
        total_price: price,
        unit_price: price,
        line_number: lineNumber,
        category: mapSectionToCategory(currentSection),
        lastProcessedIndex: processedIndex
      };
    }
  }
  
  // Pattern 2: PLU code followed by product name, then weight info
  // Example: "4082" -> "ONION RED" -> "MRJ" -> "0.310 kg @ $5.49/kg" -> "1.70"
  match = line.match(/^(\d{4})$/);
  if (match) {
    const plu = match[1];
    let productName = '';
    let weight = 1;
    let unitPrice = 0;
    let totalPrice = 0;
    let processedIndex = startIndex;
    
    if (nextLine && !nextLine.match(/^\d/) && !nextLine.match(/^[HM]?RQ?$/)) {
      productName = cleanItemName(nextLine);
      processedIndex++;
      
      // Skip tax code if present
      let weightLine = thirdLine;
      if (thirdLine && thirdLine.match(/^[HM]?RQ?$/)) {
        weightLine = fourthLine;
        processedIndex++;
      }
      
      // Check for weight pattern
      if (weightLine) {
        const weightMatch = weightLine.match(/^(\d+\.?\d*)\s+kg\s+@\s+\$(\d+\.\d{2})\/kg$/);
        if (weightMatch) {
          weight = parseFloat(weightMatch[1]);
          unitPrice = parseFloat(weightMatch[2]);
          processedIndex++;
          
          // Price should be on next line
          const priceLine = lines[processedIndex + 1];
          if (priceLine && priceLine.match(/^\d{1,3}\.\d{2}$/)) {
            totalPrice = parseFloat(priceLine);
            processedIndex++;
          }
        } else if (weightLine.match(/^\d{1,3}\.\d{2}$/)) {
          // Direct price
          totalPrice = parseFloat(weightLine);
          unitPrice = totalPrice;
          processedIndex++;
        }
      }
    }
    
    if (productName && isValidPrice(totalPrice)) {
      return {
        item_name: productName,
        product_code: plu,
        quantity: weight,
        total_price: totalPrice,
        unit_price: unitPrice,
        line_number: lineNumber,
        category: mapSectionToCategory(currentSection),
        lastProcessedIndex: processedIndex
      };
    }
  }
  
  // Pattern 3: Product name with price on same line followed by tax code
  // Example: "ORGNC LETTUCE MRJ 3.99"
  match = line.match(/^(.+?)\s+([HM]?RQ?)\s+(\d{1,3}\.\d{2})$/);
  if (match) {
    const [, productName, taxCode, priceStr] = match;
    const price = parseFloat(priceStr);
    
    if (isValidPrice(price) && isValidItemDescription(productName)) {
      return {
        item_name: cleanItemName(productName),
        quantity: 1,
        total_price: price,
        unit_price: price,
        line_number: lineNumber,
        category: mapSectionToCategory(currentSection),
        lastProcessedIndex: startIndex
      };
    }
  }
  
  // Pattern 4: Single line with UPC, name, and price
  match = line.match(/^(\d{8,15})\s+(.+?)\s+([HM]?RQ?)\s+(\d{1,3}\.\d{2})$/);
  if (match) {
    const [, upc, productName, taxCode, priceStr] = match;
    const price = parseFloat(priceStr);
    
    if (isValidPrice(price)) {
      return {
        item_name: cleanItemName(productName),
        product_code: upc,
        quantity: 1,
        total_price: price,
        unit_price: price,
        line_number: lineNumber,
        category: mapSectionToCategory(currentSection),
        lastProcessedIndex: startIndex
      };
    }
  }
  
  return null;
}

function parseTotalsAndPayment(footerLines: string[], result: ReceiptData): void {
  console.log('Parsing totals and payment from', footerLines.length, 'footer lines');
  
  for (const line of footerLines) {
    // Subtotal
    let match = line.match(/SUBTOTAL\s+(\d+\.\d{2})/i);
    if (match && !result.subtotal_amount) {
      result.subtotal_amount = parseFloat(match[1]);
      console.log('Found subtotal:', result.subtotal_amount);
      continue;
    }
    
    // Tax calculation - parse HST line correctly
    // Example: "H=HST 13% 4.29 @ 13.000%" means $4.29 is taxable amount, tax = 4.29 * 0.13
    match = line.match(/H=HST\s+(\d+)%\s+(\d+\.\d{2})\s+@\s+(\d+\.\d+)%/i);
    if (match && !result.tax_amount) {
      const taxableAmount = parseFloat(match[2]);
      const taxRate = parseFloat(match[3]) / 100;
      result.tax_amount = Math.round(taxableAmount * taxRate * 100) / 100; // Round to 2 decimal places
      console.log('Found tax calculation - taxable amount:', taxableAmount, 'rate:', taxRate, 'tax:', result.tax_amount);
      continue;
    }
    
    // Fallback tax pattern
    match = line.match(/HST.*?(\d+\.\d{2})/i);
    if (match && !result.tax_amount && !line.includes('@')) {
      result.tax_amount = parseFloat(match[1]);
      console.log('Found tax (fallback):', result.tax_amount);
      continue;
    }
    
    // Total - look for standalone total lines
    match = line.match(/^TOTAL\s+(\d+\.\d{2})/i);
    if (match && !result.total_amount) {
      result.total_amount = parseFloat(match[1]);
      console.log('Found total:', result.total_amount);
      continue;
    }
    
    // Also check for numerical total values
    if (line.match(/^\d+\.\d{2}$/) && !result.total_amount) {
      const total = parseFloat(line);
      if (total > 10 && total < 1000) { // Reasonable total range
        result.total_amount = total;
        console.log('Found total (numerical):', result.total_amount);
        continue;
      }
    }
    
    // Payment method
    if (line.match(/DEBIT|CREDIT|CASH|VISA|MASTERCARD/i) && !result.payment_method) {
      result.payment_method = line;
      console.log('Found payment method:', line);
      continue;
    }
    
    // Date/time - look for date patterns
    match = line.match(/(\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/);
    if (match && !result.receipt_date) {
      result.receipt_date = match[1];
      console.log('Found date:', result.receipt_date);
      continue;
    }
  }
}

function isNonItemLine(line: string): boolean {
  // Skip lines that are clearly not items
  const skipPatterns = [
    /^Welcome/i,
    /^Thank you/i,
    /^\d{2}-[A-Z]+$/, // Section headers like "21-GROCERY"
    /^Card Type:/i,
    /^Account:/i,
    /^Trans\./i,
    /^DateTime:/i,
    /^Auth #:/i,
    /^Ref\. #:/i,
    /^\*{3,}/,
    /^APPROVED/i,
    /^PC Optimum/i,
    /^Points/i,
    /^Balance/i,
    /^Retain this/i,
    /^CAD\$/,
    /^A\d{20,}/,  // Long alphanumeric strings (payment tokens)
    /^[HM]?RQ?$/, // Tax codes on their own line
    /^good$/i, // Superstore specific
    /^ARCP:/i, // Discount lines
    /^big on fresh/i,
    /^low on price/i,
    /^Interac/i,
    /^DEBIT TND/i,
    /^\d{10,}$/, // Long number strings
  ];
  
  return skipPatterns.some(pattern => pattern.test(line));
}

function isValidPrice(price: number): boolean {
  // Reasonable price bounds for grocery items
  return price >= 0.01 && price <= 999.99 && !isNaN(price);
}

function isValidItemDescription(description: string): boolean {
  // Valid item descriptions should not be...
  const invalidPatterns = [
    /^\d+$/, // Just numbers
    /^[A-Z]{1,2}$/, // Single/double letters
    /^CAD\$/, // Currency symbols
    /^\*+$/, // Asterisks
  ];
  
  return !invalidPatterns.some(pattern => pattern.test(description)) && 
         description.length >= 3 && 
         description.length <= 50;
}

function cleanItemName(name: string): string {
  // Clean up item names and remove tax codes
  return name
    .replace(/\s+/g, ' ') // Multiple spaces to single
    .replace(/\s+[HM]?RQ?\s*$/, '') // Remove tax codes at end
    .replace(/^[HM]?RQ?\s*/, '') // Remove tax codes at start
    .replace(/\s+\d+\.\d{2}\s*$/, '') // Remove prices that might be embedded
    .trim()
    .toUpperCase();
}

function validateParsedData(result: ReceiptData): void {
  console.log('Validating parsed data...');
  
  // Remove invalid items
  result.items = result.items.filter(item => {
    if (!item.item_name || item.item_name.length < 2) {
      console.log('Removing item with invalid name:', item);
      return false;
    }
    if (!isValidPrice(item.total_price)) {
      console.log('Removing item with invalid price:', item);
      return false;
    }
    if (item.quantity <= 0) {
      console.log('Removing item with invalid quantity:', item);
      return false;
    }
    return true;
  });
  
  // Validate totals if we have them
  if (result.subtotal_amount && result.tax_amount && result.total_amount) {
    const calculatedTotal = result.subtotal_amount + result.tax_amount;
    const difference = Math.abs(calculatedTotal - result.total_amount);
    if (difference > 0.02) { // Allow 2 cent rounding difference
      console.log('Warning: Total validation failed', {
        subtotal: result.subtotal_amount,
        tax: result.tax_amount,
        total: result.total_amount,
        calculated: calculatedTotal,
        difference
      });
    }
  }
  
    // Calculate subtotal if not found but we have items
    if (!result.subtotal_amount && result.items.length > 0) {
      result.subtotal_amount = result.items.reduce((sum, item) => sum + item.total_price, 0);
      result.subtotal_amount = Math.round(result.subtotal_amount * 100) / 100;
      console.log('Calculated subtotal from items:', result.subtotal_amount);
    }
    
    // Calculate total if not found but we have subtotal and tax
    if (!result.total_amount && result.subtotal_amount && result.tax_amount !== undefined) {
      result.total_amount = result.subtotal_amount + (result.tax_amount || 0);
      result.total_amount = Math.round(result.total_amount * 100) / 100;
      console.log('Calculated total from subtotal + tax:', result.total_amount);
    }

  console.log(`Validation complete. ${result.items.length} valid items found.`);
}

function mapSectionToCategory(section: string): string {
  const sectionMap: { [key: string]: string } = {
    'GROCERY': 'Pantry',
    'DAIRY': 'Dairy',
    'PRODUCE': 'Produce',
    'BAKERY COMMERCIAL': 'Bakery',
    'BAKERY': 'Bakery',
    'MEAT': 'Meats',
    'MEATS': 'Meats',
    'NEATS': 'Meats', // Superstore specific typo
    'SEAFOOD': 'Seafood',
    'FROZEN': 'Frozen',
    'DELI': 'Deli',
    'HEALTH': 'Health',
    'HOUSEHOLD': 'Household',
    'BEVERAGES': 'Beverages',
    'SNACKS': 'Snacks',
    'CANNED GOODS': 'Canned Goods',
    'CONDIMENTS': 'Condiments & Sauces',
    'SPICES': 'Spices & Seasonings',
  };
  
  return sectionMap[section.toUpperCase()] || 'Pantry';
}