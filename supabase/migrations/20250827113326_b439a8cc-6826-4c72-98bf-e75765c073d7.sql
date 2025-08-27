-- Enhance receipts table with additional structured data fields
ALTER TABLE public.receipts 
ADD COLUMN IF NOT EXISTS store_phone TEXT,
ADD COLUMN IF NOT EXISTS store_email TEXT,
ADD COLUMN IF NOT EXISTS receipt_number TEXT,
ADD COLUMN IF NOT EXISTS cashier_name TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Enhance receipt_items table with additional product data
ALTER TABLE public.receipt_items 
ADD COLUMN IF NOT EXISTS product_code TEXT,
ADD COLUMN IF NOT EXISTS brand TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS line_number INTEGER;

-- Create categories table for organizing receipts
CREATE TABLE IF NOT EXISTS public.receipt_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  icon TEXT DEFAULT 'receipt',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default categories
INSERT INTO public.receipt_categories (name, description, color, icon) VALUES
('Groceries', 'Food and household items', '#10B981', 'shopping-cart'),
('Restaurants', 'Dining and takeout', '#F59E0B', 'utensils'),
('Gas', 'Fuel and automotive', '#EF4444', 'fuel'),
('Shopping', 'Retail and personal items', '#8B5CF6', 'shopping-bag'),
('Healthcare', 'Medical and pharmacy', '#06B6D4', 'heart-pulse'),
('Entertainment', 'Movies, games, recreation', '#EC4899', 'ticket'),
('Transportation', 'Public transit, rideshare', '#3B82F6', 'car'),
('Utilities', 'Bills and services', '#6B7280', 'zap'),
('Other', 'Miscellaneous expenses', '#64748B', 'more-horizontal')
ON CONFLICT (name) DO NOTHING;

-- Create junction table for receipt categories (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.receipt_category_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.receipt_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(receipt_id, category_id)
);

-- Enable RLS on new tables
ALTER TABLE public.receipt_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_category_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for receipt_categories (public read, admin write)
CREATE POLICY "Categories are viewable by everyone" 
ON public.receipt_categories 
FOR SELECT 
USING (true);

-- RLS policies for receipt_category_assignments
CREATE POLICY "Users can view their receipt category assignments" 
ON public.receipt_category_assignments 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.receipts 
  WHERE receipts.id = receipt_category_assignments.receipt_id 
  AND receipts.user_id = auth.uid()
));

CREATE POLICY "Users can assign categories to their receipts" 
ON public.receipt_category_assignments 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.receipts 
  WHERE receipts.id = receipt_category_assignments.receipt_id 
  AND receipts.user_id = auth.uid()
));

CREATE POLICY "Users can update their receipt category assignments" 
ON public.receipt_category_assignments 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.receipts 
  WHERE receipts.id = receipt_category_assignments.receipt_id 
  AND receipts.user_id = auth.uid()
));

CREATE POLICY "Users can delete their receipt category assignments" 
ON public.receipt_category_assignments 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.receipts 
  WHERE receipts.id = receipt_category_assignments.receipt_id 
  AND receipts.user_id = auth.uid()
));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_receipts_user_id_date ON public.receipts(user_id, receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_processing_status ON public.receipts(processing_status);
CREATE INDEX IF NOT EXISTS idx_receipts_tags ON public.receipts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON public.receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_category ON public.receipt_items(category);
CREATE INDEX IF NOT EXISTS idx_receipt_category_assignments_receipt_id ON public.receipt_category_assignments(receipt_id);

-- Update the trigger for receipts updated_at
DROP TRIGGER IF EXISTS update_receipts_updated_at ON public.receipts;
CREATE TRIGGER update_receipts_updated_at
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();