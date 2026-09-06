/**
 * Hand-authored to match supabase/migrations/0001-0005.
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

type NutritionStatusDb = 'verified' | 'estimated' | 'incomplete';
type MealTypeDb = 'breakfast' | 'lunch' | 'dinner' | 'snack';

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
      recipes: {
        Row: {
          id: string;
          owner_id: string | null;
          source_type: 'demo' | 'user_created' | 'external' | 'ai_generated';
          source_provider: string | null;
          external_source_id: string | null;
          source_url: string | null;
          attribution: string | null;
          visibility: 'private' | 'public';
          trust_label: 'source_tested' | 'community_tested' | 'ai_experimental' | 'user_created' | 'demo';
          legacy_mock_id: string | null;
          created_at: string;
          updated_at: string;
        };
        // No client Insert/Update - Phase 3 has no recipe-authoring UI; all
        // rows come from the 0004 seed migration. See migration 0003.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      recipe_versions: {
        Row: {
          id: string;
          recipe_id: string;
          parent_version_id: string | null;
          version_number: number;
          title: string;
          description: string | null;
          servings: number;
          prep_time_minutes: number | null;
          cook_time_minutes: number | null;
          instructions: string[];
          image_uri: string | null;
          nutrition_status: NutritionStatusDb;
          nutrition_snapshot: Json;
          source_metadata: Json;
          version_reason: string;
          difficulty: 'easy' | 'medium' | 'hard' | null;
          additional_cost_estimate: number | null;
          tags: string[];
          cuisines: string[];
          collections: string[];
          demo_reasons: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      recipe_ingredients: {
        Row: {
          id: string;
          recipe_version_id: string;
          display_name: string;
          normalized_name: string;
          quantity: number | null;
          unit: PantryQuantityUnit | null;
          estimated_grams: number | null;
          preparation: string | null;
          catalog_ingredient_id: string | null;
          is_optional: boolean;
          is_pantry_staple: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      saved_recipes: {
        Row: {
          id: string;
          user_id: string;
          recipe_version_id: string;
          saved_at: string;
          notes: string | null;
        };
        Insert: {
          user_id: string;
          recipe_version_id: string;
          notes?: string | null;
        };
        Update: {
          notes?: string | null;
        };
        Relationships: [];
      };
      meal_plan_items: {
        Row: {
          id: string;
          user_id: string;
          scheduled_date: string;
          scheduled_time: string | null;
          timezone: string;
          meal_slot: MealTypeDb;
          recipe_version_id: string;
          planned_servings: number;
          status: 'planned' | 'completed' | 'skipped' | 'cancelled';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          scheduled_date: string;
          scheduled_time?: string | null;
          timezone?: string;
          meal_slot: MealTypeDb;
          recipe_version_id: string;
          planned_servings: number;
          status?: 'planned' | 'completed' | 'skipped' | 'cancelled';
          notes?: string | null;
        };
        Update: {
          scheduled_date?: string;
          scheduled_time?: string | null;
          timezone?: string;
          meal_slot?: MealTypeDb;
          recipe_version_id?: string;
          planned_servings?: number;
          status?: 'planned' | 'completed' | 'skipped' | 'cancelled';
          notes?: string | null;
        };
        Relationships: [];
      };
      cooking_events: {
        Row: {
          id: string;
          user_id: string;
          recipe_version_id: string;
          meal_plan_item_id: string | null;
          status: 'started' | 'completed' | 'cancelled';
          planned_servings: number;
          actual_servings_prepared: number | null;
          final_batch_weight_g: number | null;
          pantry_deduction_status: 'pending' | 'applied' | 'skipped';
          idempotency_key: string;
          started_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        // No client Insert/Update - see start_cooking_event/cancel_cooking_event/
        // complete_cooking_event RPCs. See migration 0003.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cooking_event_ingredients: {
        Row: {
          id: string;
          user_id: string;
          cooking_event_id: string;
          recipe_ingredient_id: string;
          pantry_item_id: string | null;
          requested_quantity: number;
          requested_unit: string | null;
          deducted_quantity: number;
          deducted_unit: string | null;
          estimated_grams: number | null;
          match_confidence: 'exact' | 'likely' | 'uncertain' | 'none' | null;
          user_confirmed: boolean;
          was_skipped: boolean;
          pantry_event_id: string | null;
          created_at: string;
        };
        // No client Insert/Update - written only by complete_cooking_event.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      prepared_meals: {
        Row: {
          id: string;
          user_id: string;
          cooking_event_id: string;
          recipe_version_id: string;
          total_servings_prepared: number;
          servings_remaining: number;
          total_batch_weight_g: number | null;
          remaining_batch_weight_g: number | null;
          nutrition_snapshot: Json;
          nutrition_per_serving: Json;
          nutrition_per_gram: Json | null;
          prepared_at: string;
          storage_location: 'fridge' | 'freezer' | 'pantry' | 'counter' | 'other' | null;
          use_by_date: string | null;
          status: 'available' | 'consumed' | 'discarded';
          created_at: string;
          updated_at: string;
        };
        // No client Insert/Update - created by complete_cooking_event, updated
        // only by log_prepared_meal_consumption.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      meal_logs: {
        Row: {
          id: string;
          user_id: string;
          consumed_at: string;
          local_date: string;
          timezone: string;
          meal_type: MealTypeDb;
          recipe_version_id: string | null;
          cooking_event_id: string | null;
          prepared_meal_id: string | null;
          servings_consumed: number | null;
          grams_consumed: number | null;
          nutrition_snapshot: Json;
          nutrition_status: NutritionStatusDb;
          log_source: 'cooking_flow' | 'prepared_meal' | 'quick_add' | 'manual';
          notes: string | null;
          idempotency_key: string | null;
          voided_at: string | null;
          void_reason: string | null;
          replaced_by_log_id: string | null;
          created_at: string;
        };
        // No client Insert - RPC-only (complete_cooking_event/
        // log_prepared_meal_consumption/quick_add_meal_log/correct_meal_log).
        Insert: never;
        // Column-level grant restricts a plain client Update to these two
        // fields only - see migration 0003.
        Update: {
          voided_at?: string;
          void_reason?: string;
        };
        Relationships: [];
      };
      grocery_lists: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          status: 'active' | 'completed' | 'archived';
          source: 'manual' | 'meal_plan' | 'recipe' | 'pantry_shortage';
          source_metadata: Json;
          created_at: string;
          updated_at: string;
        };
        // Created via get_or_create_active_grocery_list() in practice; a plain
        // insert is still RLS-legal for the owner.
        Insert: {
          user_id: string;
          title?: string;
          status?: 'active' | 'completed' | 'archived';
          source?: 'manual' | 'meal_plan' | 'recipe' | 'pantry_shortage';
          source_metadata?: Json;
        };
        Update: {
          title?: string;
          status?: 'active' | 'completed' | 'archived';
          source?: 'manual' | 'meal_plan' | 'recipe' | 'pantry_shortage';
          source_metadata?: Json;
        };
        Relationships: [];
      };
      grocery_list_items: {
        Row: {
          id: string;
          grocery_list_id: string;
          user_id: string;
          catalog_ingredient_id: string | null;
          display_name: string;
          normalized_name: string;
          image_uri: string;
          category: 'produce' | 'protein' | 'dairy' | 'pantry' | 'frozen' | 'other' | null;
          quantity: number;
          unit: PantryQuantityUnit;
          quantity_basis: 'as_entered' | 'recipe_requirement' | 'uncovered_shortfall';
          is_checked: boolean;
          checked_at: string | null;
          source: 'manual' | 'recipe' | 'meal_plan' | 'pantry_shortage';
          source_recipe_version_ids: string[];
          source_metadata: Json;
          estimated_price: number | null;
          swap_suggestion: string | null;
          waste_note: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        // normalized_name / checked_at / sort_order are set by triggers - not
        // sent by the client.
        Insert: {
          grocery_list_id: string;
          user_id: string;
          catalog_ingredient_id?: string | null;
          display_name: string;
          image_uri?: string;
          category?: 'produce' | 'protein' | 'dairy' | 'pantry' | 'frozen' | 'other' | null;
          quantity?: number;
          unit: PantryQuantityUnit;
          quantity_basis?: 'as_entered' | 'recipe_requirement' | 'uncovered_shortfall';
          is_checked?: boolean;
          source?: 'manual' | 'recipe' | 'meal_plan' | 'pantry_shortage';
          source_recipe_version_ids?: string[];
          source_metadata?: Json;
          estimated_price?: number | null;
          swap_suggestion?: string | null;
          waste_note?: string | null;
          sort_order?: number;
        };
        Update: {
          catalog_ingredient_id?: string | null;
          display_name?: string;
          image_uri?: string;
          category?: 'produce' | 'protein' | 'dairy' | 'pantry' | 'frozen' | 'other' | null;
          quantity?: number;
          unit?: PantryQuantityUnit;
          quantity_basis?: 'as_entered' | 'recipe_requirement' | 'uncovered_shortfall';
          is_checked?: boolean;
          source_recipe_version_ids?: string[];
          source_metadata?: Json;
          estimated_price?: number | null;
          swap_suggestion?: string | null;
          waste_note?: string | null;
          sort_order?: number;
        };
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
      start_cooking_event: {
        Args: {
          p_recipe_version_id: string;
          p_meal_plan_item_id: string | null;
          p_planned_servings: number | null;
          p_idempotency_key: string | null;
        };
        Returns: Database['public']['Tables']['cooking_events']['Row'];
      };
      cancel_cooking_event: {
        Args: {
          p_cooking_event_id: string;
          p_reason: string | null;
        };
        Returns: Database['public']['Tables']['cooking_events']['Row'];
      };
      complete_cooking_event: {
        Args: {
          p_cooking_event_id: string;
          p_actual_servings_prepared: number;
          p_deductions: Json;
          p_final_batch_weight_g: number | null;
          p_servings_consumed_now: number | null;
          p_meal_type: string | null;
          p_notes: string | null;
        };
        Returns: Json;
      };
      log_prepared_meal_consumption: {
        Args: {
          p_prepared_meal_id: string;
          p_servings_consumed: number;
          p_meal_type: string;
          p_notes: string | null;
          p_idempotency_key: string | null;
        };
        Returns: Json;
      };
      quick_add_meal_log: {
        Args: {
          p_meal_type: string;
          p_nutrition: Json;
          p_idempotency_key: string;
          p_notes: string | null;
          p_consumed_at: string | null;
        };
        Returns: Database['public']['Tables']['meal_logs']['Row'];
      };
      correct_meal_log: {
        Args: {
          p_meal_log_id: string;
          p_reason: string;
          p_new_meal_type: string;
          p_new_nutrition: Json;
          p_new_servings_consumed: number | null;
          p_new_grams_consumed: number | null;
          p_new_notes: string | null;
          p_new_idempotency_key: string | null;
          p_new_consumed_at: string | null;
        };
        Returns: Json;
      };
      get_or_create_active_grocery_list: {
        Args: Record<string, never>;
        Returns: Database['public']['Tables']['grocery_lists']['Row'];
      };
      toggle_grocery_item: {
        Args: {
          p_item_id: string;
        };
        Returns: Database['public']['Tables']['grocery_list_items']['Row'];
      };
    };
    Enums: Record<string, never>;
  };
}
