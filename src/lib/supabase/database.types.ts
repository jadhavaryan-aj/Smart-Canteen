/**
 * Database types for supabase-js, matching supabase/migrations.
 *
 * Written in the format produced by `supabase gen types typescript`. After
 * changing the schema you can regenerate this file with:
 *   npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamp = string;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string | null; created_at: Timestamp; updated_at: Timestamp };
        Insert: { id: string; display_name?: string | null; created_at?: Timestamp; updated_at?: Timestamp };
        Update: { display_name?: string | null };
        Relationships: [];
      };
      user_roles: {
        Row: { user_id: string; role: Database['public']['Enums']['app_role']; created_at: Timestamp };
        Insert: { user_id: string; role: Database['public']['Enums']['app_role']; created_at?: Timestamp };
        Update: { role?: Database['public']['Enums']['app_role'] };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      menu_items: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          description: string;
          price_paise: number;
          image_url: string | null;
          is_vegetarian: boolean;
          is_available: boolean;
          is_active: boolean;
          is_featured: boolean;
          sort_order: number;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          description?: string;
          price_paise: number;
          image_url?: string | null;
          is_vegetarian?: boolean;
          is_available?: boolean;
          is_active?: boolean;
          is_featured?: boolean;
          sort_order?: number;
        };
        Update: {
          category_id?: string;
          name?: string;
          description?: string;
          price_paise?: number;
          image_url?: string | null;
          is_vegetarian?: boolean;
          is_available?: boolean;
          is_active?: boolean;
          is_featured?: boolean;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'menu_items_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      menu_item_options: {
        Row: {
          id: string;
          menu_item_id: string;
          name: string;
          price_delta_paise: number;
          is_available: boolean;
          sort_order: number;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          menu_item_id: string;
          name: string;
          price_delta_paise?: number;
          is_available?: boolean;
          sort_order?: number;
        };
        Update: {
          name?: string;
          price_delta_paise?: number;
          is_available?: boolean;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'menu_item_options_menu_item_id_fkey';
            columns: ['menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
        ];
      };
      canteen_settings: {
        Row: {
          id: number;
          canteen_name: string;
          tagline: string | null;
          ordering_enabled: boolean;
          ordering_paused: boolean;
          pause_message: string | null;
          enforce_opening_hours: boolean;
          opening_hours: Json;
          timezone: string;
          pickup_instructions: string | null;
          student_id_mode: Database['public']['Enums']['student_id_mode'];
          student_id_label: string;
          order_prefix: string;
          max_items_per_order: number;
          pending_payment_window_minutes: number;
          updated_at: Timestamp;
          updated_by: string | null;
        };
        Insert: { id?: number };
        Update: {
          canteen_name?: string;
          tagline?: string | null;
          ordering_enabled?: boolean;
          ordering_paused?: boolean;
          pause_message?: string | null;
          enforce_opening_hours?: boolean;
          opening_hours?: Json;
          timezone?: string;
          pickup_instructions?: string | null;
          student_id_mode?: Database['public']['Enums']['student_id_mode'];
          student_id_label?: string;
          order_prefix?: string;
          max_items_per_order?: number;
          pending_payment_window_minutes?: number;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          user_id: string | null;
          customer_name: string;
          student_identifier: string | null;
          status: Database['public']['Enums']['order_status'];
          payment_status: Database['public']['Enums']['payment_status'];
          subtotal_paise: number;
          total_paise: number;
          currency: string;
          item_count: number;
          idempotency_key: string;
          request_fingerprint: string;
          terms_accepted_at: Timestamp;
          payment_expires_at: Timestamp;
          paid_at: Timestamp | null;
          accepted_at: Timestamp | null;
          preparing_at: Timestamp | null;
          ready_at: Timestamp | null;
          completed_at: Timestamp | null;
          cancelled_at: Timestamp | null;
          cancellation_reason: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          line_number: number;
          menu_item_id: string | null;
          item_name: string;
          is_vegetarian: boolean;
          base_price_paise: number;
          unit_price_paise: number;
          quantity: number;
          line_total_paise: number;
          customizations: Json;
          special_instructions: string | null;
          created_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          provider: string;
          provider_order_id: string;
          provider_payment_id: string | null;
          amount_paise: number;
          currency: string;
          status: Database['public']['Enums']['payment_record_status'];
          method: string | null;
          verified_at: Timestamp | null;
          verification_source: string | null;
          amount_refunded_paise: number;
          last_failed_payment_id: string | null;
          failure_code: string | null;
          failure_reason: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'payments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      refunds: {
        Row: {
          id: string;
          order_id: string;
          payment_id: string;
          provider_refund_id: string | null;
          amount_paise: number;
          status: Database['public']['Enums']['refund_status'];
          reason: string | null;
          initiated_by: string | null;
          failure_reason: string | null;
          attempt_started_at: Timestamp | null;
          processed_at: Timestamp | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'refunds_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refunds_initiated_by_fkey';
            columns: ['initiated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      order_status_history: {
        Row: {
          id: number;
          order_id: string;
          previous_status: Database['public']['Enums']['order_status'] | null;
          new_status: Database['public']['Enums']['order_status'];
          changed_by: string | null;
          source: Database['public']['Enums']['status_change_source'];
          note: string | null;
          created_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'order_status_history_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_status_history_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_public_settings: { Args: Record<PropertyKey, never>; Returns: Json };
      get_ordering_status: { Args: { p_at?: string }; Returns: Json };
      quote_cart: { Args: { p_items: Json }; Returns: Json };
      get_order_receipt: { Args: { p_order_id?: string | null; p_access_token?: string | null }; Returns: Json };
      get_my_staff_role: { Args: Record<PropertyKey, never>; Returns: Database['public']['Enums']['app_role'] | null };
      get_dashboard_stats: { Args: { p_day?: string | null }; Returns: Json };
      set_menu_item_availability: { Args: { p_item_id: string; p_is_available: boolean }; Returns: Json };
      set_ordering_paused: { Args: { p_paused: boolean; p_message?: string | null }; Returns: Json };
      staff_update_order_status: {
        Args: {
          p_order_id: string;
          p_new_status: Database['public']['Enums']['order_status'];
          p_expected_status?: Database['public']['Enums']['order_status'] | null;
          p_note?: string | null;
        };
        Returns: Json;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      has_staff_access: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      app_role: 'admin' | 'staff';
      order_status: 'payment_pending' | 'confirmed' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled';
      payment_status: 'pending' | 'paid' | 'failed' | 'refund_pending' | 'partially_refunded' | 'refunded';
      payment_record_status: 'created' | 'captured' | 'failed' | 'partially_refunded' | 'refunded';
      refund_status: 'pending' | 'processed' | 'failed';
      student_id_mode: 'hidden' | 'optional' | 'required';
      status_change_source: 'system' | 'payment' | 'staff' | 'admin';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
