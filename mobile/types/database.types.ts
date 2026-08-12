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
    };
    Enums: Record<string, never>;
  };
}
