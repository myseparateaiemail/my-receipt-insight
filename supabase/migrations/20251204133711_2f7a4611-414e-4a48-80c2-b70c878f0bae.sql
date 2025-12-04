-- Create a verified products table to store SKU → product mappings
-- This creates a learning system where user corrections improve future accuracy

CREATE TABLE public.verified_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT NOT NULL,
  store_chain TEXT DEFAULT 'Real Canadian Superstore',
  product_name TEXT NOT NULL,
  brand TEXT,
  size TEXT,
  category TEXT,
  confidence_score NUMERIC DEFAULT 1.0,
  verification_count INTEGER DEFAULT 1,
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(sku, store_chain)
);

-- Enable RLS
ALTER TABLE public.verified_products ENABLE ROW LEVEL SECURITY;

-- Everyone can read verified products (shared knowledge base)
CREATE POLICY "Anyone can view verified products"
ON public.verified_products
FOR SELECT
USING (true);

-- Authenticated users can add new products
CREATE POLICY "Authenticated users can create verified products"
ON public.verified_products
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Authenticated users can update products (increase verification count)
CREATE POLICY "Authenticated users can update verified products"
ON public.verified_products
FOR UPDATE
USING (auth.uid() IS NOT NULL);

-- Create index for fast SKU lookups
CREATE INDEX idx_verified_products_sku ON public.verified_products(sku);
CREATE INDEX idx_verified_products_sku_store ON public.verified_products(sku, store_chain);

-- Add trigger for updated_at
CREATE TRIGGER update_verified_products_updated_at
BEFORE UPDATE ON public.verified_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();