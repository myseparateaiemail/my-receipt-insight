-- Migration to consolidate Verified Products by SKU (Shared Knowledge Base)
-- 1. Identifies duplicate SKUs (same product listed under different stores)
-- 2. Keeps the most recently verified entry
-- 3. Deletes duplicates
-- 4. Enforces global uniqueness on SKU (ignoring store_chain)

BEGIN;

-- 1. Create a temporary table to identify survivors
CREATE TEMP TABLE sku_survivors AS
SELECT DISTINCT ON (sku)
    id as survivor_id,
    sku,
    product_name,
    brand,
    size,
    category
FROM 
    public.verified_products
ORDER BY 
    sku, 
    last_verified_at DESC, -- Prefer most recently verified
    confidence_score DESC; -- Then highest confidence

-- 2. Delete duplicates (records that are NOT in the survivors list)
DELETE FROM public.verified_products
WHERE id NOT IN (SELECT survivor_id FROM sku_survivors);

-- 3. Update the survivors to have generic store info (optional, or just leave as is)
-- We remove the store specific constraint, so the 'store_chain' field becomes
-- just "where we first found it", not a unique key.

-- 4. Alter the constraints
-- Drop the old store-specific unique constraint
ALTER TABLE public.verified_products 
DROP CONSTRAINT IF EXISTS verified_products_sku_store_chain_key;

-- Drop the index that supported it
DROP INDEX IF EXISTS idx_verified_products_sku_store;

-- Create a new unique constraint on SKU only
ALTER TABLE public.verified_products
ADD CONSTRAINT verified_products_sku_key UNIQUE (sku);

-- Clean up
DROP TABLE sku_survivors;

COMMIT;
