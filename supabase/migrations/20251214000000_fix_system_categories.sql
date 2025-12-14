-- Migration to refactor System Categories into a shared model
-- 1. Stops copying system categories to new users (Drop Trigger)
-- 2. Migrates existing assignments to point to the shared System Category
-- 3. Deletes the redundant user-specific copies

BEGIN;

-- 1. Drop the trigger and function that causes the duplication
DROP TRIGGER IF EXISTS initialize_categories_for_new_user ON auth.users;
DROP FUNCTION IF EXISTS public.initialize_user_categories();

-- 2. Consolidate existing user copies into the system categories
--    Target: Assignments pointing to a user-owned category that matches a system category name
UPDATE public.receipt_category_assignments rca
SET category_id = sys.id
FROM public.receipt_categories sys
JOIN public.receipt_categories user_cat ON user_cat.name = sys.name
WHERE 
    rca.category_id = user_cat.id 
    AND sys.user_id IS NULL           -- Match against a System Category
    AND user_cat.user_id IS NOT NULL; -- That corresponds to a User Copy

-- 3. Delete the redundant user copies (now that no receipts point to them)
DELETE FROM public.receipt_categories user_cat
USING public.receipt_categories sys
WHERE 
    user_cat.name = sys.name 
    AND sys.user_id IS NULL 
    AND user_cat.user_id IS NOT NULL;

COMMIT;
