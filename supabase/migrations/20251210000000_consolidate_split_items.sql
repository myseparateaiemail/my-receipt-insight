-- Migration to consolidate split line items in historical data
-- Use this to clean up existing receipts where items like "Lean Ground Beef" 
-- appear on multiple lines instead of being grouped.

BEGIN;

-- 1. Create a temporary table to calculate the consolidated values
CREATE TEMP TABLE consolidation_targets AS
SELECT
    receipt_id,
    -- Grouping Logic: Use Product Code (SKU) if available, otherwise Item Name
    CASE 
        WHEN product_code IS NOT NULL AND product_code <> '' THEN product_code 
        ELSE item_name 
    END as grouping_key,
    -- Fix: Cast UUID to text to use MIN(), then cast back to UUID
    MIN(id::text)::uuid as survivor_id,
    SUM(quantity) as new_quantity,
    SUM(total_price) as new_total_price,
    SUM(discount_amount) as new_discount_amount
FROM 
    public.receipt_items
GROUP BY 
    receipt_id, 
    CASE 
        WHEN product_code IS NOT NULL AND product_code <> '' THEN product_code 
        ELSE item_name 
    END
HAVING 
    COUNT(*) > 1;

-- 2. Update the 'survivor' rows with the aggregated totals
UPDATE public.receipt_items main
SET 
    quantity = t.new_quantity,
    total_price = t.new_total_price,
    discount_amount = t.new_discount_amount,
    -- Recalculate unit_price based on the new totals (Average Unit Price)
    unit_price = CASE 
        WHEN t.new_quantity > 0 THEN t.new_total_price / t.new_quantity 
        ELSE 0 
    END
FROM consolidation_targets t
WHERE main.id = t.survivor_id;

-- 3. Delete the redundant rows (the 'victims')
-- We delete rows that match the grouping criteria but are NOT the survivor_id
DELETE FROM public.receipt_items ri
USING consolidation_targets t
WHERE 
    ri.receipt_id = t.receipt_id 
    AND (
        -- Match by SKU if it was the key
        (ri.product_code IS NOT NULL AND ri.product_code <> '' AND ri.product_code = t.grouping_key)
        OR 
        -- Match by Name if SKU was empty/null
        ((ri.product_code IS NULL OR ri.product_code = '') AND ri.item_name = t.grouping_key)
    )
    AND ri.id != t.survivor_id;

-- Clean up
DROP TABLE consolidation_targets;

COMMIT;
