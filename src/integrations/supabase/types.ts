export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      receipt_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      receipt_category_assignments: {
        Row: {
          category_id: string
          created_at: string
          id: string
          receipt_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          receipt_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_category_assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "receipt_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_category_assignments_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_items: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          description: string | null
          discount_amount: number | null
          id: string
          item_name: string
          line_number: number | null
          product_code: string | null
          quantity: number | null
          receipt_id: string
          tax_amount: number | null
          tax_rate: number | null
          total_price: number
          unit_price: number | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          id?: string
          item_name: string
          line_number?: number | null
          product_code?: string | null
          quantity?: number | null
          receipt_id: string
          tax_amount?: number | null
          tax_rate?: number | null
          total_price: number
          unit_price?: number | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          id?: string
          item_name?: string
          line_number?: number | null
          product_code?: string | null
          quantity?: number | null
          receipt_id?: string
          tax_amount?: number | null
          tax_rate?: number | null
          total_price?: number
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          cashier_name: string | null
          confidence_score: number | null
          created_at: string
          discount_amount: number | null
          id: string
          image_url: string | null
          ocr_text: string | null
          payment_method: string | null
          processing_status: string | null
          receipt_date: string
          receipt_number: string | null
          store_address: string | null
          store_email: string | null
          store_name: string | null
          store_phone: string | null
          subtotal_amount: number | null
          tags: string[] | null
          tax_amount: number | null
          tip_amount: number | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cashier_name?: string | null
          confidence_score?: number | null
          created_at?: string
          discount_amount?: number | null
          id?: string
          image_url?: string | null
          ocr_text?: string | null
          payment_method?: string | null
          processing_status?: string | null
          receipt_date: string
          receipt_number?: string | null
          store_address?: string | null
          store_email?: string | null
          store_name?: string | null
          store_phone?: string | null
          subtotal_amount?: number | null
          tags?: string[] | null
          tax_amount?: number | null
          tip_amount?: number | null
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cashier_name?: string | null
          confidence_score?: number | null
          created_at?: string
          discount_amount?: number | null
          id?: string
          image_url?: string | null
          ocr_text?: string | null
          payment_method?: string | null
          processing_status?: string | null
          receipt_date?: string
          receipt_number?: string | null
          store_address?: string | null
          store_email?: string | null
          store_name?: string | null
          store_phone?: string | null
          subtotal_amount?: number | null
          tags?: string[] | null
          tax_amount?: number | null
          tip_amount?: number | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
