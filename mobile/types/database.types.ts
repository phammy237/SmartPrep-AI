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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      barcode_product_nutrition: {
        Row: {
          barcode: string
          brand_owner: string | null
          created_at: string
          created_by: string | null
          description: string | null
          fdc_id: number | null
          id: string
          nutrition_per_100g: Json
          provider: string
          source_fetched_at: string
          source_product_id: string
          status: string
          updated_at: string
        }
        Insert: {
          barcode: string
          brand_owner?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fdc_id?: number | null
          id?: string
          nutrition_per_100g: Json
          provider: string
          source_fetched_at?: string
          source_product_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          brand_owner?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fdc_id?: number | null
          id?: string
          nutrition_per_100g?: Json
          provider?: string
          source_fetched_at?: string
          source_product_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      canonical_ingredient_nutrition: {
        Row: {
          canonical_ingredient_id: string
          created_at: string
          fdc_id: number | null
          match_rule: string | null
          nutrition_per_100g: Json
          status: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          canonical_ingredient_id: string
          created_at?: string
          fdc_id?: number | null
          match_rule?: string | null
          nutrition_per_100g: Json
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          canonical_ingredient_id?: string
          created_at?: string
          fdc_id?: number | null
          match_rule?: string | null
          nutrition_per_100g?: Json
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canonical_ingredient_nutrition_fdc_id_fkey"
            columns: ["fdc_id"]
            isOneToOne: false
            referencedRelation: "usda_foods"
            referencedColumns: ["fdc_id"]
          },
        ]
      }
      cooking_event_ingredients: {
        Row: {
          cooking_event_id: string
          created_at: string
          deducted_quantity: number
          deducted_unit: string | null
          estimated_grams: number | null
          id: string
          match_confidence: string | null
          pantry_event_id: string | null
          pantry_item_id: string | null
          recipe_ingredient_id: string
          requested_quantity: number
          requested_unit: string | null
          user_confirmed: boolean
          user_id: string
          was_skipped: boolean
        }
        Insert: {
          cooking_event_id: string
          created_at?: string
          deducted_quantity?: number
          deducted_unit?: string | null
          estimated_grams?: number | null
          id?: string
          match_confidence?: string | null
          pantry_event_id?: string | null
          pantry_item_id?: string | null
          recipe_ingredient_id: string
          requested_quantity: number
          requested_unit?: string | null
          user_confirmed?: boolean
          user_id: string
          was_skipped?: boolean
        }
        Update: {
          cooking_event_id?: string
          created_at?: string
          deducted_quantity?: number
          deducted_unit?: string | null
          estimated_grams?: number | null
          id?: string
          match_confidence?: string | null
          pantry_event_id?: string | null
          pantry_item_id?: string | null
          recipe_ingredient_id?: string
          requested_quantity?: number
          requested_unit?: string | null
          user_confirmed?: boolean
          user_id?: string
          was_skipped?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cooking_event_ingredients_cooking_event_id_fkey"
            columns: ["cooking_event_id"]
            isOneToOne: false
            referencedRelation: "cooking_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cooking_event_ingredients_pantry_event_id_fkey"
            columns: ["pantry_event_id"]
            isOneToOne: false
            referencedRelation: "pantry_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cooking_event_ingredients_pantry_item_id_fkey"
            columns: ["pantry_item_id"]
            isOneToOne: false
            referencedRelation: "pantry_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cooking_event_ingredients_recipe_ingredient_id_fkey"
            columns: ["recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      cooking_events: {
        Row: {
          actual_servings_prepared: number | null
          completed_at: string | null
          created_at: string
          final_batch_weight_g: number | null
          id: string
          idempotency_key: string
          meal_plan_item_id: string | null
          pantry_deduction_status: string
          planned_servings: number
          recipe_version_id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_servings_prepared?: number | null
          completed_at?: string | null
          created_at?: string
          final_batch_weight_g?: number | null
          id?: string
          idempotency_key: string
          meal_plan_item_id?: string | null
          pantry_deduction_status?: string
          planned_servings: number
          recipe_version_id: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_servings_prepared?: number | null
          completed_at?: string | null
          created_at?: string
          final_batch_weight_g?: number | null
          id?: string
          idempotency_key?: string
          meal_plan_item_id?: string | null
          pantry_deduction_status?: string
          planned_servings?: number
          recipe_version_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cooking_events_meal_plan_item_id_fkey"
            columns: ["meal_plan_item_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cooking_events_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      dietary_preferences: {
        Row: {
          allergens: string[]
          created_at: string
          dietary_patterns: string[]
          equipment: string[]
          excluded_ingredients: string[]
          max_cook_time: string
          novelty_preference: string | null
          preferred_cuisines: string[]
          priorities: Json
          updated_at: string
          user_id: string
          weekly_grocery_budget: number | null
        }
        Insert: {
          allergens?: string[]
          created_at?: string
          dietary_patterns?: string[]
          equipment?: string[]
          excluded_ingredients?: string[]
          max_cook_time?: string
          novelty_preference?: string | null
          preferred_cuisines?: string[]
          priorities?: Json
          updated_at?: string
          user_id: string
          weekly_grocery_budget?: number | null
        }
        Update: {
          allergens?: string[]
          created_at?: string
          dietary_patterns?: string[]
          equipment?: string[]
          excluded_ingredients?: string[]
          max_cook_time?: string
          novelty_preference?: string | null
          preferred_cuisines?: string[]
          priorities?: Json
          updated_at?: string
          user_id?: string
          weekly_grocery_budget?: number | null
        }
        Relationships: []
      }
      grocery_list_items: {
        Row: {
          catalog_ingredient_id: string | null
          category: string | null
          checked_at: string | null
          created_at: string
          display_name: string
          estimated_price: number | null
          grocery_list_id: string
          id: string
          image_uri: string
          is_checked: boolean
          normalized_name: string
          pantry_item_id: string | null
          pantry_transfer_status: string
          pantry_transferred_at: string | null
          quantity: number
          quantity_basis: string
          sort_order: number
          source: string
          source_metadata: Json
          source_recipe_version_ids: string[]
          swap_suggestion: string | null
          unit: string
          updated_at: string
          user_id: string
          waste_note: string | null
        }
        Insert: {
          catalog_ingredient_id?: string | null
          category?: string | null
          checked_at?: string | null
          created_at?: string
          display_name: string
          estimated_price?: number | null
          grocery_list_id: string
          id?: string
          image_uri?: string
          is_checked?: boolean
          normalized_name: string
          pantry_item_id?: string | null
          pantry_transfer_status?: string
          pantry_transferred_at?: string | null
          quantity?: number
          quantity_basis?: string
          sort_order?: number
          source?: string
          source_metadata?: Json
          source_recipe_version_ids?: string[]
          swap_suggestion?: string | null
          unit: string
          updated_at?: string
          user_id: string
          waste_note?: string | null
        }
        Update: {
          catalog_ingredient_id?: string | null
          category?: string | null
          checked_at?: string | null
          created_at?: string
          display_name?: string
          estimated_price?: number | null
          grocery_list_id?: string
          id?: string
          image_uri?: string
          is_checked?: boolean
          normalized_name?: string
          pantry_item_id?: string | null
          pantry_transfer_status?: string
          pantry_transferred_at?: string | null
          quantity?: number
          quantity_basis?: string
          sort_order?: number
          source?: string
          source_metadata?: Json
          source_recipe_version_ids?: string[]
          swap_suggestion?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
          waste_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grocery_list_items_list_fk"
            columns: ["grocery_list_id", "user_id"]
            isOneToOne: false
            referencedRelation: "grocery_lists"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "grocery_list_items_pantry_item_id_fkey"
            columns: ["pantry_item_id"]
            isOneToOne: false
            referencedRelation: "pantry_items"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_lists: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          source: string
          source_metadata: Json
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          source?: string
          source_metadata?: Json
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          source?: string
          source_metadata?: Json
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_logs: {
        Row: {
          consumed_at: string
          cooking_event_id: string | null
          created_at: string
          grams_consumed: number | null
          id: string
          idempotency_key: string | null
          local_date: string
          log_source: string
          meal_type: string
          notes: string | null
          nutrition_snapshot: Json
          nutrition_status: string
          prepared_meal_id: string | null
          recipe_version_id: string | null
          replaced_by_log_id: string | null
          servings_consumed: number | null
          timezone: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          consumed_at?: string
          cooking_event_id?: string | null
          created_at?: string
          grams_consumed?: number | null
          id?: string
          idempotency_key?: string | null
          local_date: string
          log_source: string
          meal_type: string
          notes?: string | null
          nutrition_snapshot: Json
          nutrition_status: string
          prepared_meal_id?: string | null
          recipe_version_id?: string | null
          replaced_by_log_id?: string | null
          servings_consumed?: number | null
          timezone?: string
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          consumed_at?: string
          cooking_event_id?: string | null
          created_at?: string
          grams_consumed?: number | null
          id?: string
          idempotency_key?: string | null
          local_date?: string
          log_source?: string
          meal_type?: string
          notes?: string | null
          nutrition_snapshot?: Json
          nutrition_status?: string
          prepared_meal_id?: string | null
          recipe_version_id?: string | null
          replaced_by_log_id?: string | null
          servings_consumed?: number | null
          timezone?: string
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_logs_cooking_event_id_fkey"
            columns: ["cooking_event_id"]
            isOneToOne: false
            referencedRelation: "cooking_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_logs_prepared_meal_id_fkey"
            columns: ["prepared_meal_id"]
            isOneToOne: false
            referencedRelation: "prepared_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_logs_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_logs_replaced_by_log_id_fkey"
            columns: ["replaced_by_log_id"]
            isOneToOne: false
            referencedRelation: "meal_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_items: {
        Row: {
          created_at: string
          id: string
          meal_slot: string
          notes: string | null
          planned_servings: number
          recipe_version_id: string
          scheduled_date: string
          scheduled_time: string | null
          status: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meal_slot: string
          notes?: string | null
          planned_servings: number
          recipe_version_id: string
          scheduled_date: string
          scheduled_time?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meal_slot?: string
          notes?: string | null
          planned_servings?: number
          recipe_version_id?: string
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_items_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_goals: {
        Row: {
          carbs_target_g: number
          created_at: string
          daily_calories: number
          effective_end: string | null
          effective_start: string
          fat_target_g: number
          fiber_target_g: number | null
          goal_type: string
          id: string
          macro_preference: string
          protein_min_g: number
          units: string
          user_id: string
          weight_goal_direction: string | null
          weight_goal_target_date: string | null
          weight_goal_target_lbs: number | null
        }
        Insert: {
          carbs_target_g: number
          created_at?: string
          daily_calories: number
          effective_end?: string | null
          effective_start?: string
          fat_target_g: number
          fiber_target_g?: number | null
          goal_type?: string
          id?: string
          macro_preference?: string
          protein_min_g: number
          units?: string
          user_id: string
          weight_goal_direction?: string | null
          weight_goal_target_date?: string | null
          weight_goal_target_lbs?: number | null
        }
        Update: {
          carbs_target_g?: number
          created_at?: string
          daily_calories?: number
          effective_end?: string | null
          effective_start?: string
          fat_target_g?: number
          fiber_target_g?: number | null
          goal_type?: string
          id?: string
          macro_preference?: string
          protein_min_g?: number
          units?: string
          user_id?: string
          weight_goal_direction?: string | null
          weight_goal_target_date?: string | null
          weight_goal_target_lbs?: number | null
        }
        Relationships: []
      }
      pantry_events: {
        Row: {
          confidence: string | null
          created_at: string
          estimated_gram_delta: number | null
          event_type: string
          id: string
          occurred_at: string
          pantry_item_id: string
          quantity_after: number | null
          quantity_before: number | null
          quantity_delta: number
          reason: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          unit: string | null
          user_id: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          estimated_gram_delta?: number | null
          event_type: string
          id?: string
          occurred_at?: string
          pantry_item_id: string
          quantity_after?: number | null
          quantity_before?: number | null
          quantity_delta?: number
          reason?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          unit?: string | null
          user_id: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          estimated_gram_delta?: number | null
          event_type?: string
          id?: string
          occurred_at?: string
          pantry_item_id?: string
          quantity_after?: number | null
          quantity_before?: number | null
          quantity_delta?: number
          reason?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pantry_events_pantry_item_id_fkey"
            columns: ["pantry_item_id"]
            isOneToOne: false
            referencedRelation: "pantry_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_items: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string
          created_at: string
          display_name: string
          estimated_expiration_date: string | null
          estimated_grams: number | null
          expiration_confidence: string
          fdc_id: string | null
          id: string
          image_uri: string
          ingredient_id: string
          last_confirmed_at: string | null
          normalized_name: string
          notes: string | null
          opened_date: string | null
          purchase_date: string | null
          quantity: number
          quantity_confidence: string
          scan_source: string
          source_grocery_item_id: string | null
          source_receipt_candidate_id: string | null
          source_receipt_id: string | null
          source_scan_detection_id: string | null
          status: string
          storage_location: string | null
          unit: string
          updated_at: string
          usda_match_confidence: string | null
          user_id: string
          user_provided_date: string | null
          user_provided_date_type: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category: string
          created_at?: string
          display_name: string
          estimated_expiration_date?: string | null
          estimated_grams?: number | null
          expiration_confidence?: string
          fdc_id?: string | null
          id?: string
          image_uri?: string
          ingredient_id: string
          last_confirmed_at?: string | null
          normalized_name: string
          notes?: string | null
          opened_date?: string | null
          purchase_date?: string | null
          quantity?: number
          quantity_confidence?: string
          scan_source?: string
          source_grocery_item_id?: string | null
          source_receipt_candidate_id?: string | null
          source_receipt_id?: string | null
          source_scan_detection_id?: string | null
          status?: string
          storage_location?: string | null
          unit: string
          updated_at?: string
          usda_match_confidence?: string | null
          user_id: string
          user_provided_date?: string | null
          user_provided_date_type?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string
          created_at?: string
          display_name?: string
          estimated_expiration_date?: string | null
          estimated_grams?: number | null
          expiration_confidence?: string
          fdc_id?: string | null
          id?: string
          image_uri?: string
          ingredient_id?: string
          last_confirmed_at?: string | null
          normalized_name?: string
          notes?: string | null
          opened_date?: string | null
          purchase_date?: string | null
          quantity?: number
          quantity_confidence?: string
          scan_source?: string
          source_grocery_item_id?: string | null
          source_receipt_candidate_id?: string | null
          source_receipt_id?: string | null
          source_scan_detection_id?: string | null
          status?: string
          storage_location?: string | null
          unit?: string
          updated_at?: string
          usda_match_confidence?: string | null
          user_id?: string
          user_provided_date?: string | null
          user_provided_date_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pantry_items_source_grocery_item_id_fkey"
            columns: ["source_grocery_item_id"]
            isOneToOne: false
            referencedRelation: "grocery_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      prepared_meals: {
        Row: {
          cooking_event_id: string
          created_at: string
          id: string
          nutrition_per_gram: Json | null
          nutrition_per_serving: Json
          nutrition_snapshot: Json
          prepared_at: string
          recipe_version_id: string
          remaining_batch_weight_g: number | null
          servings_remaining: number
          status: string
          storage_location: string | null
          total_batch_weight_g: number | null
          total_servings_prepared: number
          updated_at: string
          use_by_date: string | null
          user_id: string
        }
        Insert: {
          cooking_event_id: string
          created_at?: string
          id?: string
          nutrition_per_gram?: Json | null
          nutrition_per_serving: Json
          nutrition_snapshot: Json
          prepared_at?: string
          recipe_version_id: string
          remaining_batch_weight_g?: number | null
          servings_remaining: number
          status?: string
          storage_location?: string | null
          total_batch_weight_g?: number | null
          total_servings_prepared: number
          updated_at?: string
          use_by_date?: string | null
          user_id: string
        }
        Update: {
          cooking_event_id?: string
          created_at?: string
          id?: string
          nutrition_per_gram?: Json | null
          nutrition_per_serving?: Json
          nutrition_snapshot?: Json
          prepared_at?: string
          recipe_version_id?: string
          remaining_batch_weight_g?: number | null
          servings_remaining?: number
          status?: string
          storage_location?: string | null
          total_batch_weight_g?: number | null
          total_servings_prepared?: number
          updated_at?: string
          use_by_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prepared_meals_cooking_event_id_fkey"
            columns: ["cooking_event_id"]
            isOneToOne: false
            referencedRelation: "cooking_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepared_meals_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_provider: string
          cooking_confidence: number
          created_at: string
          display_name: string
          email: string
          household_size: number
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          auth_provider?: string
          cooking_confidence?: number
          created_at?: string
          display_name?: string
          email: string
          household_size?: number
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          auth_provider?: string
          cooking_confidence?: number
          created_at?: string
          display_name?: string
          email?: string
          household_size?: number
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      receipt_scan_items: {
        Row: {
          candidate_id: string
          candidate_status: string
          category: string | null
          created_at: string
          display_name: string
          id: string
          ocr_confidence: number | null
          pantry_item_id: string | null
          quantity: number | null
          raw_text: string
          receipt_scan_id: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          candidate_id: string
          candidate_status?: string
          category?: string | null
          created_at?: string
          display_name: string
          id?: string
          ocr_confidence?: number | null
          pantry_item_id?: string | null
          quantity?: number | null
          raw_text: string
          receipt_scan_id: string
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          candidate_id?: string
          candidate_status?: string
          category?: string | null
          created_at?: string
          display_name?: string
          id?: string
          ocr_confidence?: number | null
          pantry_item_id?: string | null
          quantity?: number | null
          raw_text?: string
          receipt_scan_id?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_scan_items_pantry_item_id_fkey"
            columns: ["pantry_item_id"]
            isOneToOne: false
            referencedRelation: "pantry_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_scan_items_receipt_scan_id_fkey"
            columns: ["receipt_scan_id"]
            isOneToOne: false
            referencedRelation: "receipt_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_scans: {
        Row: {
          client_receipt_id: string
          created_at: string
          id: string
          item_count: number
          line_count: number
          merchant_name: string | null
          ocr_source: string | null
          purchased_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_receipt_id: string
          created_at?: string
          id?: string
          item_count?: number
          line_count?: number
          merchant_name?: string | null
          ocr_source?: string | null
          purchased_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_receipt_id?: string
          created_at?: string
          id?: string
          item_count?: number
          line_count?: number
          merchant_name?: string | null
          ocr_source?: string | null
          purchased_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          catalog_ingredient_id: string | null
          created_at: string
          display_name: string
          estimated_grams: number | null
          id: string
          is_optional: boolean
          is_pantry_staple: boolean
          normalized_name: string
          preparation: string | null
          quantity: number | null
          recipe_version_id: string
          sort_order: number
          unit: string | null
        }
        Insert: {
          catalog_ingredient_id?: string | null
          created_at?: string
          display_name: string
          estimated_grams?: number | null
          id?: string
          is_optional?: boolean
          is_pantry_staple?: boolean
          normalized_name: string
          preparation?: string | null
          quantity?: number | null
          recipe_version_id: string
          sort_order?: number
          unit?: string | null
        }
        Update: {
          catalog_ingredient_id?: string | null
          created_at?: string
          display_name?: string
          estimated_grams?: number | null
          id?: string
          is_optional?: boolean
          is_pantry_staple?: boolean
          normalized_name?: string
          preparation?: string | null
          quantity?: number | null
          recipe_version_id?: string
          sort_order?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_versions: {
        Row: {
          additional_cost_estimate: number | null
          collections: string[]
          cook_time_minutes: number | null
          created_at: string
          cuisines: string[]
          demo_reasons: Json
          description: string | null
          difficulty: string | null
          id: string
          image_uri: string | null
          instructions: string[]
          nutrition_snapshot: Json
          nutrition_status: string
          parent_version_id: string | null
          prep_time_minutes: number | null
          recipe_id: string
          servings: number
          source_metadata: Json
          tags: string[]
          title: string
          version_number: number
          version_reason: string
        }
        Insert: {
          additional_cost_estimate?: number | null
          collections?: string[]
          cook_time_minutes?: number | null
          created_at?: string
          cuisines?: string[]
          demo_reasons?: Json
          description?: string | null
          difficulty?: string | null
          id?: string
          image_uri?: string | null
          instructions?: string[]
          nutrition_snapshot: Json
          nutrition_status: string
          parent_version_id?: string | null
          prep_time_minutes?: number | null
          recipe_id: string
          servings: number
          source_metadata?: Json
          tags?: string[]
          title: string
          version_number: number
          version_reason?: string
        }
        Update: {
          additional_cost_estimate?: number | null
          collections?: string[]
          cook_time_minutes?: number | null
          created_at?: string
          cuisines?: string[]
          demo_reasons?: Json
          description?: string | null
          difficulty?: string | null
          id?: string
          image_uri?: string | null
          instructions?: string[]
          nutrition_snapshot?: Json
          nutrition_status?: string
          parent_version_id?: string | null
          prep_time_minutes?: number | null
          recipe_id?: string
          servings?: number
          source_metadata?: Json
          tags?: string[]
          title?: string
          version_number?: number
          version_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_versions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          attribution: string | null
          created_at: string
          external_source_id: string | null
          id: string
          legacy_mock_id: string | null
          owner_id: string | null
          source_provider: string | null
          source_type: string
          source_url: string | null
          trust_label: string
          updated_at: string
          visibility: string
        }
        Insert: {
          attribution?: string | null
          created_at?: string
          external_source_id?: string | null
          id?: string
          legacy_mock_id?: string | null
          owner_id?: string | null
          source_provider?: string | null
          source_type: string
          source_url?: string | null
          trust_label: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          attribution?: string | null
          created_at?: string
          external_source_id?: string | null
          id?: string
          legacy_mock_id?: string | null
          owner_id?: string | null
          source_provider?: string | null
          source_type?: string
          source_url?: string | null
          trust_label?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      saved_recipes: {
        Row: {
          id: string
          notes: string | null
          recipe_version_id: string
          saved_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          recipe_version_id: string
          saved_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          recipe_version_id?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_recipes_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_detections: {
        Row: {
          canonical_ingredient_id: string | null
          category: string | null
          created_at: string
          detection_id: string
          display_name: string
          id: string
          identity_edited: boolean
          pantry_item_id: string | null
          quantity: number
          quantity_edited: boolean
          scan_id: string
          section: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          canonical_ingredient_id?: string | null
          category?: string | null
          created_at?: string
          detection_id: string
          display_name: string
          id?: string
          identity_edited?: boolean
          pantry_item_id?: string | null
          quantity: number
          quantity_edited?: boolean
          scan_id: string
          section?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          canonical_ingredient_id?: string | null
          category?: string | null
          created_at?: string
          detection_id?: string
          display_name?: string
          id?: string
          identity_edited?: boolean
          pantry_item_id?: string | null
          quantity?: number
          quantity_edited?: boolean
          scan_id?: string
          section?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_detections_pantry_item_id_fkey"
            columns: ["pantry_item_id"]
            isOneToOne: false
            referencedRelation: "pantry_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_detections_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_sections: {
        Row: {
          created_at: string
          id: string
          scan_id: string
          section: string
          skipped: boolean
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          scan_id: string
          section: string
          skipped?: boolean
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          scan_id?: string
          section?: string
          skipped?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "scan_sections_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          client_scan_id: string
          confirmed_at: string | null
          created_at: string
          id: string
          mode: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_scan_id: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          mode: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_scan_id?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          mode?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usda_foods: {
        Row: {
          brand_owner: string | null
          data_type: string | null
          description: string
          fdc_id: number
          fetched_at: string
          fetched_by: string | null
          nutrition_per_100g: Json
          serving_size: number | null
          serving_size_unit: string | null
        }
        Insert: {
          brand_owner?: string | null
          data_type?: string | null
          description: string
          fdc_id: number
          fetched_at?: string
          fetched_by?: string | null
          nutrition_per_100g: Json
          serving_size?: number | null
          serving_size_unit?: string | null
        }
        Update: {
          brand_owner?: string | null
          data_type?: string | null
          description?: string
          fdc_id?: number
          fetched_at?: string
          fetched_by?: string | null
          nutrition_per_100g?: Json
          serving_size?: number | null
          serving_size_unit?: string | null
        }
        Relationships: []
      }
      user_ingredient_overrides: {
        Row: {
          canonical_ingredient_id: string
          created_at: string
          density_g_per_ml: number | null
          grams_per_unit: Json | null
          id: string
          note: string | null
          nutrition_per_100g: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          canonical_ingredient_id: string
          created_at?: string
          density_g_per_ml?: number | null
          grams_per_unit?: Json | null
          id?: string
          note?: string | null
          nutrition_per_100g?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          canonical_ingredient_id?: string
          created_at?: string
          density_g_per_ml?: number | null
          grams_per_unit?: Json | null
          id?: string
          note?: string | null
          nutrition_per_100g?: Json | null
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
      adjust_pantry_quantity: {
        Args: {
          p_delta: number
          p_event_type: string
          p_item_id: string
          p_reason?: string
        }
        Returns: {
          barcode: string | null
          brand: string | null
          category: string
          created_at: string
          display_name: string
          estimated_expiration_date: string | null
          estimated_grams: number | null
          expiration_confidence: string
          fdc_id: string | null
          id: string
          image_uri: string
          ingredient_id: string
          last_confirmed_at: string | null
          normalized_name: string
          notes: string | null
          opened_date: string | null
          purchase_date: string | null
          quantity: number
          quantity_confidence: string
          scan_source: string
          source_grocery_item_id: string | null
          source_receipt_candidate_id: string | null
          source_receipt_id: string | null
          source_scan_detection_id: string | null
          status: string
          storage_location: string | null
          unit: string
          updated_at: string
          usda_match_confidence: string | null
          user_id: string
          user_provided_date: string | null
          user_provided_date_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pantry_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      begin_receipt_review: {
        Args: {
          p_client_receipt_id: string
          p_items?: Json
          p_line_count?: number
          p_merchant_name?: string
          p_ocr_source?: string
          p_purchased_at?: string
        }
        Returns: Json
      }
      begin_scan_confirmation: {
        Args: {
          p_client_scan_id: string
          p_detections?: Json
          p_mode: string
          p_sections?: Json
          p_started_at?: string
        }
        Returns: Json
      }
      cancel_cooking_event: {
        Args: { p_cooking_event_id: string; p_reason?: string }
        Returns: {
          actual_servings_prepared: number | null
          completed_at: string | null
          created_at: string
          final_batch_weight_g: number | null
          id: string
          idempotency_key: string
          meal_plan_item_id: string | null
          pantry_deduction_status: string
          planned_servings: number
          recipe_version_id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cooking_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_cooking_event: {
        Args: {
          p_actual_servings_prepared: number
          p_cooking_event_id: string
          p_deductions?: Json
          p_final_batch_weight_g?: number
          p_meal_type?: string
          p_notes?: string
          p_servings_consumed_now?: number
        }
        Returns: Json
      }
      complete_grocery_list: { Args: { p_list_id: string }; Returns: Json }
      confirm_pantry_item: {
        Args: { p_item_id: string }
        Returns: {
          barcode: string | null
          brand: string | null
          category: string
          created_at: string
          display_name: string
          estimated_expiration_date: string | null
          estimated_grams: number | null
          expiration_confidence: string
          fdc_id: string | null
          id: string
          image_uri: string
          ingredient_id: string
          last_confirmed_at: string | null
          normalized_name: string
          notes: string | null
          opened_date: string | null
          purchase_date: string | null
          quantity: number
          quantity_confidence: string
          scan_source: string
          source_grocery_item_id: string | null
          source_receipt_candidate_id: string | null
          source_receipt_id: string | null
          source_scan_detection_id: string | null
          status: string
          storage_location: string | null
          unit: string
          updated_at: string
          usda_match_confidence: string | null
          user_id: string
          user_provided_date: string | null
          user_provided_date_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pantry_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      correct_meal_log: {
        Args: {
          p_meal_log_id: string
          p_new_consumed_at?: string
          p_new_grams_consumed?: number
          p_new_idempotency_key?: string
          p_new_meal_type: string
          p_new_notes?: string
          p_new_nutrition: Json
          p_new_servings_consumed?: number
          p_reason: string
        }
        Returns: Json
      }
      create_pantry_item: {
        Args: {
          p_barcode?: string
          p_brand?: string
          p_category: string
          p_display_name: string
          p_estimated_expiration_date?: string
          p_expiration_confidence?: string
          p_fdc_id?: string
          p_image_uri: string
          p_ingredient_id: string
          p_notes?: string
          p_opened_date?: string
          p_purchase_date?: string
          p_quantity: number
          p_source?: string
          p_source_grocery_item_id?: string
          p_source_receipt_candidate_id?: string
          p_source_receipt_id?: string
          p_source_scan_detection_id?: string
          p_storage_location?: string
          p_unit: string
          p_user_provided_date?: string
          p_user_provided_date_type?: string
        }
        Returns: {
          barcode: string | null
          brand: string | null
          category: string
          created_at: string
          display_name: string
          estimated_expiration_date: string | null
          estimated_grams: number | null
          expiration_confidence: string
          fdc_id: string | null
          id: string
          image_uri: string
          ingredient_id: string
          last_confirmed_at: string | null
          normalized_name: string
          notes: string | null
          opened_date: string | null
          purchase_date: string | null
          quantity: number
          quantity_confidence: string
          scan_source: string
          source_grocery_item_id: string | null
          source_receipt_candidate_id: string | null
          source_receipt_id: string | null
          source_scan_detection_id: string | null
          status: string
          storage_location: string | null
          unit: string
          updated_at: string
          usda_match_confidence: string | null
          user_id: string
          user_provided_date: string | null
          user_provided_date_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pantry_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      deplete_pantry_item: {
        Args: { p_event_type: string; p_item_id: string; p_reason?: string }
        Returns: {
          barcode: string | null
          brand: string | null
          category: string
          created_at: string
          display_name: string
          estimated_expiration_date: string | null
          estimated_grams: number | null
          expiration_confidence: string
          fdc_id: string | null
          id: string
          image_uri: string
          ingredient_id: string
          last_confirmed_at: string | null
          normalized_name: string
          notes: string | null
          opened_date: string | null
          purchase_date: string | null
          quantity: number
          quantity_confidence: string
          scan_source: string
          source_grocery_item_id: string | null
          source_receipt_candidate_id: string | null
          source_receipt_id: string | null
          source_scan_detection_id: string | null
          status: string
          storage_location: string | null
          unit: string
          updated_at: string
          usda_match_confidence: string | null
          user_id: string
          user_provided_date: string | null
          user_provided_date_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pantry_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_receipt_review: {
        Args: { p_receipt_scan_id: string; p_skipped_candidate_ids?: string[] }
        Returns: {
          client_receipt_id: string
          created_at: string
          id: string
          item_count: number
          line_count: number
          merchant_name: string | null
          ocr_source: string | null
          purchased_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "receipt_scans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_scan_confirmation: {
        Args: { p_scan_id: string }
        Returns: {
          client_scan_id: string
          confirmed_at: string | null
          created_at: string
          id: string
          mode: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "scans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_kitchen_impact_summary: {
        Args: {
          p_end_date?: string
          p_start_date?: string
          p_timezone?: string
        }
        Returns: Json
      }
      get_or_create_active_grocery_list: {
        Args: never
        Returns: {
          completed_at: string | null
          created_at: string
          id: string
          source: string
          source_metadata: Json
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "grocery_lists"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_nonempty_nutrient_basis: { Args: { basis: Json }; Returns: boolean }
      is_valid_nutrition_snapshot: {
        Args: { snapshot: Json }
        Returns: boolean
      }
      link_receipt_scan_item: {
        Args: {
          p_candidate_id: string
          p_pantry_item_id: string
          p_receipt_scan_id: string
        }
        Returns: undefined
      }
      link_scan_detection: {
        Args: {
          p_detection_id: string
          p_pantry_item_id: string
          p_scan_id: string
        }
        Returns: undefined
      }
      log_prepared_meal_consumption: {
        Args: {
          p_idempotency_key?: string
          p_meal_type: string
          p_notes?: string
          p_prepared_meal_id: string
          p_servings_consumed: number
        }
        Returns: Json
      }
      quick_add_meal_log: {
        Args: {
          p_consumed_at?: string
          p_idempotency_key: string
          p_meal_type: string
          p_notes?: string
          p_nutrition: Json
        }
        Returns: {
          consumed_at: string
          cooking_event_id: string | null
          created_at: string
          grams_consumed: number | null
          id: string
          idempotency_key: string | null
          local_date: string
          log_source: string
          meal_type: string
          notes: string | null
          nutrition_snapshot: Json
          nutrition_status: string
          prepared_meal_id: string | null
          recipe_version_id: string | null
          replaced_by_log_id: string | null
          servings_consumed: number | null
          timezone: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "meal_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      replace_nutrition_goals: {
        Args: {
          p_carbs_target_g: number
          p_daily_calories: number
          p_fat_target_g: number
          p_fiber_target_g: number
          p_macro_preference: string
          p_protein_min_g: number
          p_weight_goal_direction: string
          p_weight_goal_target_date: string
          p_weight_goal_target_lbs: number
        }
        Returns: {
          carbs_target_g: number
          created_at: string
          daily_calories: number
          effective_end: string | null
          effective_start: string
          fat_target_g: number
          fiber_target_g: number | null
          goal_type: string
          id: string
          macro_preference: string
          protein_min_g: number
          units: string
          user_id: string
          weight_goal_direction: string | null
          weight_goal_target_date: string | null
          weight_goal_target_lbs: number | null
        }
        SetofOptions: {
          from: "*"
          to: "nutrition_goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_pantry_item: {
        Args: { p_item_id: string; p_reason?: string }
        Returns: {
          barcode: string | null
          brand: string | null
          category: string
          created_at: string
          display_name: string
          estimated_expiration_date: string | null
          estimated_grams: number | null
          expiration_confidence: string
          fdc_id: string | null
          id: string
          image_uri: string
          ingredient_id: string
          last_confirmed_at: string | null
          normalized_name: string
          notes: string | null
          opened_date: string | null
          purchase_date: string | null
          quantity: number
          quantity_confidence: string
          scan_source: string
          source_grocery_item_id: string | null
          source_receipt_candidate_id: string | null
          source_receipt_id: string | null
          source_scan_detection_id: string | null
          status: string
          storage_location: string | null
          unit: string
          updated_at: string
          usda_match_confidence: string | null
          user_id: string
          user_provided_date: string | null
          user_provided_date_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pantry_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      scale_nutrition_snapshot: {
        Args: { factor: number; snapshot: Json }
        Returns: Json
      }
      start_cooking_event: {
        Args: {
          p_idempotency_key?: string
          p_meal_plan_item_id?: string
          p_planned_servings?: number
          p_recipe_version_id: string
        }
        Returns: {
          actual_servings_prepared: number | null
          completed_at: string | null
          created_at: string
          final_batch_weight_g: number | null
          id: string
          idempotency_key: string
          meal_plan_item_id: string | null
          pantry_deduction_status: string
          planned_servings: number
          recipe_version_id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cooking_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      toggle_grocery_item: {
        Args: { p_item_id: string }
        Returns: {
          catalog_ingredient_id: string | null
          category: string | null
          checked_at: string | null
          created_at: string
          display_name: string
          estimated_price: number | null
          grocery_list_id: string
          id: string
          image_uri: string
          is_checked: boolean
          normalized_name: string
          pantry_item_id: string | null
          pantry_transfer_status: string
          pantry_transferred_at: string | null
          quantity: number
          quantity_basis: string
          sort_order: number
          source: string
          source_metadata: Json
          source_recipe_version_ids: string[]
          swap_suggestion: string | null
          unit: string
          updated_at: string
          user_id: string
          waste_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "grocery_list_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transfer_grocery_item_to_pantry: {
        Args: {
          p_category: string
          p_display_name: string
          p_estimated_expiration_date?: string
          p_expiration_confidence?: string
          p_grocery_item_id: string
          p_image_uri: string
          p_ingredient_id: string
          p_notes?: string
          p_purchase_date?: string
          p_quantity: number
          p_storage_location?: string
          p_unit: string
          p_user_provided_date?: string
          p_user_provided_date_type?: string
        }
        Returns: {
          barcode: string | null
          brand: string | null
          category: string
          created_at: string
          display_name: string
          estimated_expiration_date: string | null
          estimated_grams: number | null
          expiration_confidence: string
          fdc_id: string | null
          id: string
          image_uri: string
          ingredient_id: string
          last_confirmed_at: string | null
          normalized_name: string
          notes: string | null
          opened_date: string | null
          purchase_date: string | null
          quantity: number
          quantity_confidence: string
          scan_source: string
          source_grocery_item_id: string | null
          source_receipt_candidate_id: string | null
          source_receipt_id: string | null
          source_scan_detection_id: string | null
          status: string
          storage_location: string | null
          unit: string
          updated_at: string
          usda_match_confidence: string | null
          user_id: string
          user_provided_date: string | null
          user_provided_date_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pantry_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_barcode_product_candidate: {
        Args: {
          p_barcode: string
          p_brand_owner?: string
          p_description?: string
          p_nutrition_per_100g: Json
          p_source_product_id: string
        }
        Returns: {
          barcode: string
          brand_owner: string | null
          created_at: string
          created_by: string | null
          description: string | null
          fdc_id: number | null
          id: string
          nutrition_per_100g: Json
          provider: string
          source_fetched_at: string
          source_product_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "barcode_product_nutrition"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_verified_barcode_product: {
        Args: {
          p_barcode: string
          p_brand_owner?: string
          p_created_by?: string
          p_description?: string
          p_fdc_id: number
          p_nutrition_per_100g: Json
          p_usda_data_type?: string
          p_usda_description?: string
          p_usda_serving_size?: number
          p_usda_serving_size_unit?: string
        }
        Returns: {
          barcode: string
          brand_owner: string | null
          created_at: string
          created_by: string | null
          description: string | null
          fdc_id: number | null
          id: string
          nutrition_per_100g: Json
          provider: string
          source_fetched_at: string
          source_product_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "barcode_product_nutrition"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
    Enums: {},
  },
} as const
