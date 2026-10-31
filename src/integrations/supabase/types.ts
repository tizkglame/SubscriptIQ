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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          address: string | null
          company: string | null
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      discounts: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expires_on: string | null
          id: string
          name: string
          type: Database["public"]["Enums"]["discount_type"]
          usage_limit: number | null
          used_count: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expires_on?: string | null
          id?: string
          name: string
          type?: Database["public"]["Enums"]["discount_type"]
          usage_limit?: number | null
          used_count?: number
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expires_on?: string | null
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["discount_type"]
          usage_limit?: number | null
          used_count?: number
          value?: number
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          amount: number
          description: string
          id: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          amount: number
          description: string
          id?: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer_id: string
          discount_amount: number
          due_date: string
          id: string
          issue_date: string
          number: string
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string
          subtotal: number
          tax_amount: number
          total: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          discount_amount?: number
          due_date: string
          id?: string
          issue_date?: string
          number?: string
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string
          subtotal?: number
          tax_amount?: number
          total?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          discount_amount?: number
          due_date?: string
          id?: string
          issue_date?: string
          number?: string
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string
          subtotal?: number
          tax_amount?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          is_demo: boolean
          method: string
          notes: string | null
          paid_on: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          is_demo?: boolean
          method?: string
          notes?: string | null
          paid_on?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          is_demo?: boolean
          method?: string
          notes?: string | null
          paid_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          auto_close: boolean
          billing_period: Database["public"]["Enums"]["billing_period"]
          closable: boolean
          created_at: string
          end_date: string | null
          id: string
          min_quantity: number
          name: string
          pausable: boolean
          renewable: boolean
          start_date: string | null
        }
        Insert: {
          auto_close?: boolean
          billing_period?: Database["public"]["Enums"]["billing_period"]
          closable?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          min_quantity?: number
          name: string
          pausable?: boolean
          renewable?: boolean
          start_date?: string | null
        }
        Update: {
          auto_close?: boolean
          billing_period?: Database["public"]["Enums"]["billing_period"]
          closable?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          min_quantity?: number
          name?: string
          pausable?: boolean
          renewable?: boolean
          start_date?: string | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          extra_price: number
          id: string
          name: string
          product_id: string
        }
        Insert: {
          extra_price?: number
          id?: string
          name: string
          product_id: string
        }
        Update: {
          extra_price?: number
          id?: string
          name?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          name: string
          sales_price: number
          type: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          name: string
          sales_price?: number
          type?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          name?: string
          sales_price?: number
          type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      subscription_lines: {
        Row: {
          id: string
          product_id: string
          quantity: number
          subscription_id: string
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          subscription_id: string
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          subscription_id?: string
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_lines_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          customer_id: string
          discount_id: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          number: string
          payment_terms_days: number
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          tax_rate: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          discount_id?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          number?: string
          payment_terms_days?: number
          plan_id: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tax_rate?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          discount_id?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          number?: string
          payment_terms_days?: number
          plan_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _bill_subscription: {
        Args: { _issue: string; _ps: string; _sub: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      my_customer_ids: { Args: never; Returns: string[] }
      period_interval: {
        Args: { p: Database["public"]["Enums"]["billing_period"] }
        Returns: string
      }
      run_billing: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "staff" | "customer"
      billing_period: "daily" | "weekly" | "monthly" | "yearly"
      discount_type: "fixed" | "percentage"
      invoice_status: "draft" | "confirmed" | "paid" | "cancelled" | "overdue"
      subscription_status:
        | "draft"
        | "quotation"
        | "confirmed"
        | "active"
        | "closed"
        | "paused"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "customer"],
      billing_period: ["daily", "weekly", "monthly", "yearly"],
      discount_type: ["fixed", "percentage"],
      invoice_status: ["draft", "confirmed", "paid", "cancelled", "overdue"],
      subscription_status: [
        "draft",
        "quotation",
        "confirmed",
        "active",
        "closed",
        "paused",
      ],
    },
  },
} as const
