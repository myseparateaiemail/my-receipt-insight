-- Fix the search path security issue in the initialize_user_categories function
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