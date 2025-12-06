-- Add card_last_four column to receipts table for bank reconciliation
ALTER TABLE public.receipts 
ADD COLUMN card_last_four text;