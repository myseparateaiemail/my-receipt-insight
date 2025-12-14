# Project Context: Grocer (Receipt Transcription & Analytics)

## Project Overview
"Grocer" is a React/Supabase application that tracks grocery spending using AI. It specializes in parsing Canadian grocery receipts (e.g., Real Canadian Superstore, Walmart, Longos, No Frills, Nature's Emporium, Sobeys, Frescho, Loblaws, Food Basics) to extract line-item details, sizes, and discounts for spending analytics.

## Tech Stack
* **Frontend:** React, TypeScript, Tailwind CSS, Shadcn/UI, Recharts.
* **Backend:** Supabase (PostgreSQL, Auth, Storage).
* **AI/Edge:** Deno Edge Functions using **Gemini 1.5 Flash** (via idx.google.com) + Google Vision API.
* **Environment:** Optimized for **Google IDX**.

## Development Environment & Infrastructure

### 1. Google IDX Configuration
The project is explicitly configured for Google IDX via `.idx/dev.nix`.
*   **Packages:** Node.js 20, Supabase CLI.
*   **Preview:** configured to run `npm run dev` mapping internal port `$PORT` to the external preview URL.
*   **Extensions:** Pre-configured with Tailwind, ESLint, and Prettier extensions.

### 2. Port Configuration (Standard: 3000)
**CRITICAL:** The project is standardized on **Port 3000**.
*   **History:** Early iterations suffered from port conflicts on 9000/9001/5173 (zombie processes/privileged ports).
*   **Configuration Locations:**
    *   `vite.config.ts`: `server.port: 3000`
    *   `package.json`: `vite --port 3000 --host`
    *   `supabase/config.toml`: Redirect URLs use the `3000-` prefix.

### 3. Supabase Auth Redirects
Because the IDX preview URL changes based on the workspace ID, `supabase/config.toml` requires manual updates if the project is forked or moved.
*   **`site_url`**: Must match the active IDX Preview URL.
*   **`additional_redirect_urls`**: Must include the IDX Preview URL (e.g., `https://3000-firebase-my-receipt...dev`).
*   *Note:* If you see "Redirect Mismatch" errors during login, check these values first.

### 4. Supabase Connection (Remote-First / No Docker)
This environment does **not** use Docker or a local Supabase instance. Instead, it connects directly to the hosted production project.
*   **Frontend Connection:** `src/integrations/supabase/client.ts` is configured with the **Production URL** (`qmeneridwgiavindzoht.supabase.co`) and Anon Key. This means running the app locally (`npm run dev`) reads/writes to the **live database**.
*   **CLI & Config:**
    *   `supabase/config.toml` contains the `project_id = "qmeneridwgiavindzoht"`.
    *   **Deployments:** Since there is no local DB to "push" from, you cannot use `supabase start` or `supabase migration up`.
    *   **Migrations:** Must be applied via the Supabase Dashboard SQL Editor or using `supabase db push` (requires authentication).
    *   **Functions:** Deploy directly to the remote project: `npx supabase functions deploy <name> --project-ref qmeneridwgiavindzoht`.

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
* **Data Normalization Strategy (Canonical Representation):**
    *   **Goal:** Regardless of receipt format, store data as **1 Row per Product Type**.
    *   **Scenario A (Superstore Style):** Handles explicitly grouped items (e.g., `(2) 0333...` or `2 @ $0.88`).
    *   **Scenario B (Walmart/Farm Boy Style):** Handles "Split Line" items where the same product appears on multiple lines. The AI **must consolidate** these into a single item by summing quantities and prices.
    *   **Scenario C (Weighted Items):** Allows decimal quantities (e.g., `0.315 kg`).
*   **Prompt Engineering:** The prompt explicitly instructs Gemini to act as a "Data Normalization Agent" and sum split lines before outputting JSON.

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

### Data Governance & Quality
*   **Historical Data Fix (Dec 2025):** Ran migration `20251210000000_consolidate_split_items.sql` to clean up past data. This script identified receipts with split lines (same SKU/Name on multiple rows), summed their totals, and merged them into a single "survivor" row.
*   **Ingestion Normalization:** The `process-receipt-ocr` function now enforces this consolidation at the point of entry, ensuring new data matches the historical standard.

## Frontend Routes & Views
*   **`/` (Index):** Dashboard, Receipt Capture, Recent Receipts.
*   **`/analytics`:** High-level spending trends.
*   **`/analytics/category/:categoryName` (New):** Detailed table view of all items in a category.
    *   Includes columns: Qty, Brand, Product Name, Size (from Verified), Total Price, Date, Store.
    *   Implements the "Decimal = 1 item" counting logic for headers.

## Troubleshooting / History
*   **Origin:** Project imported from `loveable.dev`.
*   **Common Issue:** If the IDE preview shows "502 Bad Gateway", verify that `.idx/dev.nix` contains the `idx.previews` block and that the server is actually running on port 3000.
