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
* **Analytics:** Dashboard with date filters (This Week, Month) and charts (Pie/Area) breaking down spending by Category.
