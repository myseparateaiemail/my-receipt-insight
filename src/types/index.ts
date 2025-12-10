import { Database } from "@/integrations/supabase/types";

export type Receipt = Database['public']['Tables']['receipts']['Row'];
export type ReceiptItem = Database['public']['Tables']['receipt_items']['Row'];
export type VerifiedProduct = Database['public']['Tables']['verified_products']['Row'];

export interface ReceiptWithItems extends Receipt {
  items: ReceiptItem[];
}

export interface OcrItem {
  item_name: string;
  quantity: number;
  total_price: number;
  unit_price: number;
  product_code?: string;
  line_number?: number;
  category?: string;
  brand?: string;
  size?: string;
  description?: string;
  discount_amount?: number;
  is_discount?: boolean;
  confidence?: 'ocr' | 'verified' | 'ai_suggested' | 'fallback';
}

export interface ParsedReceiptData {
  store_name?: string;
  receipt_date?: string;
  total_amount?: number;
  subtotal_amount?: number;
  tax_amount?: number;
  card_last_four?: string;
  payment_method?: string;
  items: OcrItem[];
}
