# Project Context: Grocer (Receipt Transcription & Analytics)

## Project Overview
"Grocer" is a React/Supabase application that tracks grocery spending using AI. It specializes in parsing Canadian grocery receipts (e.g., Real Canadian Superstore, Walmart, Longos, No Frills, Nature's Emporium, Sobeys, Frescho, Loblaws, Food Basics) to extract line-item details, sizes, and discounts for spending analytics.

## Tech Stack
* **Frontend:** React, TypeScript, Tailwind CSS, Shadcn/UI, Recharts.
* **Backend:** Supabase (PostgreSQL, Auth, Storage).
* **AI/Edge:** Deno Edge Functions using **Gemini 2.5 Flash** (via idx.google.com) Google Vision API.

## Database Schema
* **`receipts`**: Stores `ocr_text`, `store_name`, `total_amount`, `image_url`, `card_last_four`, and `processing_status`.
* **`receipt_items`**:
    * `item_name` (Text)
    * `product_code` (Text/SKU)
    * `quantity` (Number)
    * `unit_price` (Number)
    * `total_price` (Number)
    * `discount_amount` (Number, Positive value representing savings)
    * `category` (Text: "Produce", "Dips", "Dairy", etc.)
    * `brand` (Text)
    * `size` (Text, e.g., "400 ml")
* **`verified_products`**: Lookup table for high-confidence SKU data.

## Critical Business Logic (Edge Functions)

### 1. `process-receipt-ocr` (Receipt Parsing)
* **Model:** Gemini 2.5 Flash.
* **Logic:**
    * **Discounts:** Detects "ARCP" lines or negative values and applies them to the *previous* item's `discount_amount` field.
    * **Multi-buy:** Handles "4/$2.00" pricing by calculating the effective unit price.
    * **Produce:** Forces items with PLU 3000-4999 or keywords (Lime, Pepper) into the "Produce" category.
    * **Totals:** Reconciles `subtotal + tax` vs `total`. If they don't match (within $0.02), it trusts the calculated sum.

### 2. `enrich-product` (Data Cleaning)
* **Step 1:** Checks `verified_products` table for the SKU.
* **Step 2:** If not found, uses Gemini 2.5 Flash to "suggest" a clean name, brand, and size based on the receipt abbreviation.
* **Step 3:** Falls back to hardcoded abbreviations (e.g., "NN" -> "No Name").

## Frontend Components
* **ReceiptReview:** Split-screen UI. Left = Receipt Image. Right = Editable form for all parsed items. Support for inline editing (no modals).
* **Analytics:** Dashboard with date filters (This Week, Month) and charts (Pie/Area) breaking down spending by Category.The following snippets may be helpful:
From supabase/functions/process-receipt-ocr/index.ts in local codebase:
```
Line 102:     // 4. Gemini 1.5 Flash (Parsing)
Line 103:         console.log('Sending to Gemini 1.5 Flash...');
Line 104:         const genAI = new GoogleGenerativeAI(geminiApiKey);
Line 105:         const model = genAI.getGenerativeModel({
Line 106:           model: "gemini-1.5-flash", 
Line 107:           generationConfig: {
Line 108:             responseMimeType: "application/json",
Line 109:             responseSchema: receiptSchema,
Line 110:           },
Line 111:         });
Line 112:     
Line 113:         const prompt = \`
Line 114:           You are an expert receipt parser for Canadian grocery stores.
Line 115:           Parse this OCR text into structured data.
Line 116:           
Line 117:           OCR TEXT:
Line 118:           ${ocrText}
Line 119:         \`;
Line 120:     
Line 121:         const result = await model.generateContent(prompt);
Line 122:         const parsedData = JSON.parse(result.response.text());
```

From index.html in local codebase:
```
Line 1:       <!DOCTYPE html>
Line 2:       <html lang="en">
Line 3:         <head>
Line 4:           <meta charset="UTF-8" />
Line 5:           <meta name="viewport" content="width=device-width, initial-scale=1.0" />
Line 6:           <title>grocer - Smart Grocery Receipt Analytics</title>
Line 7:           <meta name="description" content="Transform grocery receipts into smart insights with OCR transcription, spending analytics, and AI-powered savings recommendations." />
Line 8:           <meta name="author" content="grocer" />
Line 9:       
Line 10:          <meta property="og:title" content="grocer - Smart Grocery Receipt Analytics" />
Line 11:          <meta property="og:description" content="Transform grocery receipts into smart insights with OCR transcription, spending analytics, and AI-powered savings recommendations." />
Line 12:          <meta property="og:type" content="website" />
```

From supabase/functions/process-receipt-ocr/index.ts in local codebase:
```
Line 11:      // Fixed: Using string literals ("STRING", "NUMBER") to avoid import errors
Line 12:      const receiptSchema = {
Line 13:        description: "Receipt data extracted from OCR text",
Line 14:        type: "OBJECT",
Line 15:        properties: {
Line 16:          store_name: { type: "STRING", description: "Name of the store" },
Line 17:          store_address: { type: "STRING", description: "Store address if present" },
Line 18:          receipt_date: { type: "STRING", description: "Date (YY/MM/DD) or ISO format" },
Line 19:          total_amount: { type: "NUMBER", description: "Final total paid" },
Line 20:          subtotal_amount: { type: "NUMBER", description: "Subtotal before tax" },
Line 21:          tax_amount: { type: "NUMBER", description: "Tax amount" },
Line 22:          card_last_four: { type: "STRING", description: "Last 4 digits of card" },
Line 23:          payment_method: { type: "STRING", description: "Payment type (DEBIT/CREDIT/CASH)" },
Line 24:          items: {
Line 25:            type: "ARRAY",
Line 26:            items: {
Line 27:              type: "OBJECT",
Line 28:              properties: {
Line 29:                item_name: { type: "STRING" },
```