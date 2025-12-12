INSERT INTO public.receipt_categories (name, description, icon, color) VALUES 
('Laundry', 'Laundry detergents, softeners, and supplies', 'shirt', '#8B5CF6')
ON CONFLICT (name) DO NOTHING;
