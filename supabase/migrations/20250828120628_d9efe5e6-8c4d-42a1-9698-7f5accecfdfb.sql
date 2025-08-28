-- Add user_id to receipt_categories to make them user-specific
ALTER TABLE public.receipt_categories 
ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Update RLS policies to allow users to manage their own categories
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.receipt_categories;

CREATE POLICY "Users can view their own categories and system categories" 
ON public.receipt_categories 
FOR SELECT 
USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can create their own categories" 
ON public.receipt_categories 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories" 
ON public.receipt_categories 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories" 
ON public.receipt_categories 
FOR DELETE 
USING (auth.uid() = user_id);

-- Insert grocery-specific system categories (no user_id = available to all users as templates)
INSERT INTO public.receipt_categories (name, description, icon, color) VALUES 
('Bakery', 'Fresh bread, pastries, and baked goods', 'bread-slice', '#D97706'),
('Baking Supplies', 'Flour, sugar, baking powder, and baking essentials', 'chef-hat', '#7C3AED'),
('Beverages', 'Drinks, juices, sodas, and liquid refreshments', 'glass-water', '#0EA5E9'),
('Canned Goods', 'Preserved foods in cans and jars', 'can', '#DC2626'),
('Condiments & Sauces', 'Ketchup, mustard, dressings, and flavor enhancers', 'bottle', '#F59E0B'),
('Cosmetics & Pharmacy', 'Personal care, health, and beauty products', 'sparkles', '#EC4899'),
('Dairy', 'Milk, cheese, yogurt, and dairy products', 'milk', '#FBBF24'),
('Deli', 'Fresh sliced meats, cheeses, and prepared foods', 'utensils', '#10B981'),
('Frozen', 'Frozen foods, ice cream, and frozen meals', 'snowflake', '#06B6D4'),
('Garden', 'Plants, gardening supplies, and outdoor items', 'flower', '#22C55E'),
('Health', 'Vitamins, supplements, and health products', 'heart-pulse', '#EF4444'),
('Household', 'Cleaning supplies, paper products, and home essentials', 'home', '#6B7280'),
('International Foods', 'Ethnic and specialty international cuisine items', 'globe', '#8B5CF6'),
('Meats', 'Fresh and packaged meat products', 'beef', '#B91C1C'),
('Natural Foods', 'Organic, natural, and health-focused products', 'leaf', '#059669'),
('Pantry', 'Non-perishable staples and dry goods', 'package', '#92400E'),
('Pasta & Grains', 'Pasta, rice, cereals, and grain products', 'wheat', '#CA8A04'),
('Produce', 'Fresh fruits and vegetables', 'apple', '#16A34A'),
('Ready Made', 'Pre-prepared meals and convenience foods', 'clock', '#7C2D12'),
('Seafood', 'Fresh and frozen fish and seafood', 'fish', '#0284C7'),
('Snacks', 'Chips, crackers, and snack foods', 'cookie', '#EA580C'),
('Spices & Seasonings', 'Herbs, spices, and flavor seasonings', 'pepper', '#BE185D')
ON CONFLICT (name) DO NOTHING;

-- Function to copy system categories to new users
CREATE OR REPLACE FUNCTION public.initialize_user_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Copy all system categories (user_id IS NULL) to the new user
  INSERT INTO public.receipt_categories (name, description, icon, color, user_id)
  SELECT name, description, icon, color, NEW.id
  FROM public.receipt_categories 
  WHERE user_id IS NULL;
  
  RETURN NEW;
END;
$function$;

-- Create trigger to initialize categories for new users
CREATE TRIGGER initialize_categories_for_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_user_categories();