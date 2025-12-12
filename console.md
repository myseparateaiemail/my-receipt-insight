# Project Context: Grocer (Receipt Transcription & Analytics)

## Project Overview
"Grocer" is a React/Supabase application that tracks grocery spending using AI. It specializes in parsing Canadian grocery receipts (e.g., Real Canadian Superstore, Walmart, Longos, No Frills, Nature's Emporium, Sobeys, Frescho, Loblaws, Food Basics) to extract line-item details, sizes, and discounts for spending analytics.

## Tech Stack
* **Frontend:** React, TypeScript, Tailwind CSS, Shadcn/UI, Recharts.
* **Backend:** Supabase (PostgreSQL, Auth, Storage).
* **AI/Edge:** Deno Edge Functions using **Gemini 1.5 Flash** (via idx.google.com) + Google Vision API.

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
    * **Note:** This table does **NOT** store `size`. Size is dynamically joined from `verified_products` on the frontend or stored in `description` as a fallback.
* **`verified_products`**: Lookup table for high-confidence SKU data (Source of Truth for Product Details).
    * `sku` (Unique Identifier)
    * `size` (Text, e.g., "400 ml")
    * `product_name` (Cleaned name)

## Critical Business Logic (Edge Functions)

### 1. `process-receipt-ocr` (Receipt Parsing)
* **Model:** Gemini 1.5 Flash (Downgraded from 2.5 for stability).
* **Consolidation Logic:**
    * **Identical Items:** The AI is strictly instructed to **merge identical items** into a single line with `quantity > 1`.
        * *Example:* 2 cans of beans at $1.00 each -> 1 Line Item: Qty 2, Total $2.00.
    * **Multi-buy:** Handles "4/$2.00" pricing by capturing the aggregate quantity.
* **JSON Extraction:** Uses Regex to robustly extract JSON from LLM responses, ignoring conversational filler.

### 2. `enrich-product` (Data Cleaning)
* **Step 1:** Checks `verified_products` table for the SKU.
* **Step 2:** If not found, uses Gemini to "suggest" a clean name, brand, and size.
* **Step 3:** Falls back to hardcoded abbreviations.

## Analytics & Reporting Standards

### Item Counting Logic
To ensure accurate analytics across unit-based items (cans) and weighted items (produce):
1.  **Integer Quantities (e.g., 2, 5):** Counted as **N items** (e.g., 2 items). This captures multi-buys correctly.
2.  **Decimal Quantities (e.g., 0.32 kg):** Counted as **1 item unit**.
    *   *Reasoning:* "0.32 kg of peppers" represents 1 purchase decision, not 0.32 of an item.
    *   *Display:* In tables, decimal quantities are displayed with "kg" appended (e.g., "0.32 kg") to distinguish them from unit counts.

### Data Persistence
*   **Saving Receipts:** When a user edits and saves a receipt (via `Index.tsx` or `ReceiptCapture.tsx`), the system:
    1.  Updates `receipts` and `receipt_items`.
    2.  **Updates `verified_products`:** Saves `size`, `brand`, and `category` to the knowledge base.
*   **Loading Receipts:** When editing or viewing details, the frontend fetches `receipt_items` AND joins with `verified_products` to populate the `size` field, since it's missing from the `receipt_items` table.

## Frontend Routes & Views
*   **`/` (Index):** Dashboard, Receipt Capture, Recent Receipts.
*   **`/analytics`:** High-level spending trends.
*   **`/analytics/category/:categoryName` (New):** Detailed table view of all items in a category.
    *   Includes columns: Qty, Brand, Product Name, Size (from Verified), Total Price, Date, Store.
    *   Implements the "Decimal = 1 item" counting logic for headers.
