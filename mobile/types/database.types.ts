/**
 * Hand-authored to match supabase/migrations/0001_identity_and_preferences.sql.
 *
 * This is a STAND-IN for the real generated file. Once a project is linked,
 * regenerate it for real and this file will be overwritten:
 *
 *   npx supabase gen types typescript --linked > types/database.types.ts
 *
 * Do not hand-edit table shapes here without also editing the migration that
 * defines them (and vice versa) - they will drift silently otherwise.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type PantryQuantityUnit =
  | 'item'
  | 'container'
  | 'bag'
  | 'bottle'
  | 'can'
  | 'package'
  | 'serving'
  | 'g'
  | 'kg'
  | 'oz'
  | 'lb'
  | 'ml'
  | 'L';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          auth_provider: 'email' | 'apple' | 'google';
          timezone: string;
          household_size: number;
          cooking_confidence: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string;
          auth_provider?: 'email' | 'apple' | 'google';
          timezone?: string;
          household_size?: number;
          cooking_confidence?: number;
        };
        Update: {
          display_name?: string;
          timezone?: string;
          household_size?: number;
          cooking_confidence?: number;
        };
        Relationships: [];
      };
      dietary_preferences: {
        Row: {
          user_id: string;
          dietary_patterns: string[];
          allergens: string[];
          excluded_ingredients: string[];
          preferred_cuisines: string[];
          equipment: string[];
          max_cook_time: 'under_15' | '15_30' | '30_60' | 'no_preference';
          novelty_preference: string | null;
          priorities: Json;
          weekly_grocery_budget: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          dietary_patterns?: string[];
          allergens?: string[];
          excluded_ingredients?: string[];
          preferred_cuisines?: string[];
          equipment?: string[];
          max_cook_time?: 'under_15' | '15_30' | '30_60' | 'no_preference';
          novelty_preference?: string | null;
          priorities?: Json;
          weekly_grocery_budget?: number | null;
        };
        Update: {
          dietary_patterns?: string[];
          allergens?: string[];
          excluded_ingredients?: string[];
          preferred_cuisines?: string[];
          equipment?: string[];
          max_cook_time?: 'under_15' | '15_30' | '30_60' | 'no_preference';
          novelty_preference?: string | null;
          priorities?: Json;
          weekly_grocery_budget?: number | null;
        };
        Relationships: [];
      };
      nutrition_goals: {
        Row: {
          id: string;
          user_id: string;
          effective_start: string;
          effective_end: string | null;
          daily_calories: number;
          protein_min_g: number;
          carbs_target_g: number;
          fat_target_g: number;
          fiber_target_g: number | null;
          macro_preference: 'balanced' | 'low_carb' | 'high_protein';
          goal_type: string;
          weight_goal_direction: 'lose' | 'maintain' | 'gain' | null;
          weight_goal_target_lbs: number | null;
          weight_goal_target_date: string | null;
          units: 'imperial' | 'metric';
          created_at: string;
        };
        Insert: {
          user_id: string;
          daily_calories: number;
          protein_min_g: number;
          carbs_target_g: number;
          fat_target_g: number;
          fiber_target_g?: number | null;
          macro_preference?: 'balanced' | 'low_carb' | 'high_protein';
          goal_type?: string;
          weight_goal_direction?: 'lose' | 'maintain' | 'gain' | null;
          weight_goal_target_lbs?: number | null;
          weight_goal_target_date?: string | null;
          units?: 'imperial' | 'metric';
        };
        Update: {
          effective_end?: string | null;
        };
        Relationships: [];
      };
      pantry_items: {
        Row: {
          id: string;
          user_id: string;
          ingredient_id: string;
          image_uri: string;
          normalized_name: string;
          display_name: string;
          category: 'produce' | 'protein' | 'dairy' | 'pantry' | 'frozen' | 'other';
          quantity: number;
          unit: PantryQuantityUnit;
          quantity_confidence: 'exact' | 'estimated';
          estimated_grams: number | null;
          fdc_id: string | null;
          usda_match_confidence: string | null;
          barcode: string | null;
          brand: string | null;
          purchase_date: string | null;
          opened_date: string | null;
          user_provided_date: string | null;
          user_provided_date_type: 'best_by' | 'use_by' | 'sell_by' | null;
          estimated_expiration_date: string | null;
          expiration_confidence: 'high' | 'medium' | 'low' | 'unknown';
          storage_location: 'fridge' | 'freezer' | 'pantry' | 'counter' | 'other' | null;
          scan_source: 'manual' | 'scan' | 'grocery';
          notes: string | null;
          status: 'active' | 'depleted';
          last_confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        // No client Insert - rows are created exclusively via the
        // create_pantry_item RPC (security definer). See migration 0002.
        Insert: never;
        Update: {
          display_name?: string;
          category?: 'produce' | 'protein' | 'dairy' | 'pantry' | 'frozen' | 'other';
          unit?: PantryQuantityUnit;
          notes?: string | null;
          storage_location?: 'fridge' | 'freezer' | 'pantry' | 'counter' | 'other' | null;
          quantity_confidence?: 'exact' | 'estimated';
          purchase_date?: string | null;
          opened_date?: string | null;
          user_provided_date?: string | null;
          user_provided_date_type?: 'best_by' | 'use_by' | 'sell_by' | null;
          estimated_expiration_date?: string | null;
          expiration_confidence?: 'high' | 'medium' | 'low' | 'unknown';
        };
        Relationships: [];
      };
      pantry_events: {
        Row: {
          id: string;
          user_id: string;
          pantry_item_id: string;
          event_type:
            | 'added'
            | 'adjusted'
            | 'consumed'
            | 'deducted_by_cooking'
            | 'depleted'
            | 'discarded'
            | 'donated'
            | 'traded'
            | 'corrected'
            | 'restored';
          quantity_delta: number;
          unit: string | null;
          estimated_gram_delta: number | null;
          quantity_before: number | null;
          quantity_after: number | null;
          source_entity_type: string | null;
          source_entity_id: string | null;
          confidence: string | null;
          reason: string | null;
          occurred_at: string;
          created_at: string;
        };
        // No client Insert/Update - append-only, written only by the
        // security-definer RPCs. See migration 0002.
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      replace_nutrition_goals: {
        Args: {
          p_daily_calories: number;
          p_protein_min_g: number;
          p_carbs_target_g: number;
          p_fat_target_g: number;
          p_fiber_target_g: number | null;
          p_macro_preference: string;
          p_weight_goal_direction: string | null;
          p_weight_goal_target_lbs: number | null;
          p_weight_goal_target_date: string | null;
        };
        Returns: Database['public']['Tables']['nutrition_goals']['Row'];
      };
      create_pantry_item: {
        Args: {
          p_ingredient_id: string;
          p_display_name: string;
          p_image_uri: string;
          p_category: string;
          p_quantity: number;
          p_unit: string;
          p_storage_location: string | null;
          p_notes: string | null;
          p_purchase_date: string | null;
          p_opened_date: string | null;
          p_user_provided_date: string | null;
          p_user_provided_date_type: string | null;
          p_estimated_expiration_date: string | null;
          p_expiration_confidence: string | null;
          p_source: string | null;
        };
        Returns: Database['public']['Tables']['pantry_items']['Row'];
      };
      adjust_pantry_quantity: {
        Args: {
          p_item_id: string;
          p_delta: number;
          p_event_type: string;
          p_reason: string | null;
        };
        Returns: Database['public']['Tables']['pantry_items']['Row'];
      };
      deplete_pantry_item: {
        Args: {
          p_item_id: string;
          p_event_type: string;
          p_reason: string | null;
        };
        Returns: Database['public']['Tables']['pantry_items']['Row'];
      };
      restore_pantry_item: {
        Args: {
          p_item_id: string;
          p_reason: string | null;
        };
        Returns: Database['public']['Tables']['pantry_items']['Row'];
      };
      confirm_pantry_item: {
        Args: {
          p_item_id: string;
        };
        Returns: Database['public']['Tables']['pantry_items']['Row'];
      };
    };
    Enums: Record<string, never>;
  };
}
