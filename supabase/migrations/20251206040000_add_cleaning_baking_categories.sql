INSERT INTO public.receipt_categories (name, description, icon, color) VALUES 
('Cleaning', 'Cleaning supplies, detergents, and chemicals', 'sparkles', '#0EA5E9'),
('Baking', 'Baking ingredients and essentials', 'chef-hat', '#F59E0B')
ON CONFLICT (name) DO NOTHING;
