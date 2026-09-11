import type { IngredientCoverage } from '@/lib/nutrition/pantryCoverage';
import { QuantityUnit } from './common';
import { NutritionFacts, NutritionSnapshot, NutritionStatus } from './nutrition';

export const RECIPE_DIFFICULTY_VALUES = ['easy', 'medium', 'hard'] as const;
export type RecipeDifficulty = (typeof RECIPE_DIFFICULTY_VALUES)[number];

export const RECIPE_COLLECTION_ID_VALUES = [
  'use_it_before_you_lose_it',
  'cook_right_now',
  'almost_there',
  'quick_meals',
  'for_you',
  'something_different',
] as const;
export type RecipeCollectionId = (typeof RECIPE_COLLECTION_ID_VALUES)[number];

/**
 * How much this recipe's provenance/nutrition can be trusted. 'demo' is the
 * only label Phase 3's seed data uses - never 'source_tested'/'community_tested'
 * without real provenance, never 'verified' nutrition without USDA (Phase 4+).
 */
export const RECIPE_TRUST_LABEL_VALUES = [
  'source_tested',
  'community_tested',
  'ai_experimental',
  'user_created',
  'demo',
] as const;
export type RecipeTrustLabel = (typeof RECIPE_TRUST_LABEL_VALUES)[number];

export interface RecipeIngredient {
  ingredientId: string;
  name: string;
  imageUri: string;
  quantity: number;
  unit: QuantityUnit;
  /** A pantry staple (salt, oil, etc.) that's excluded from "missing" counts. */
  isPantryStaple?: boolean;
  /**
   * Whether the user currently has ENOUGH of this ingredient. Hydrated by
   * recipeService on every read from `coverage` (true iff coverage.status is
   * 'covered'); kept for the many simple call sites that only need a boolean.
   */
  isOwned?: boolean;
  /**
   * Quantity-aware pantry coverage for this requirement (recipeService
   * computes it on read against the live pantry + the shared conversion
   * engine). Undefined only on a recipe that was never hydrated.
   */
  coverage?: IngredientCoverage;
  // --- Phase 3 additions - populated for the real (Supabase-backed) recipe
  // catalog (seeded by supabase/migrations/0004_recipe_catalog_seed.sql). ---
  /** recipe_ingredients.id - required to reference this ingredient in a cooking-event pantry deduction. */
  recipeIngredientId?: string;
  isOptional?: boolean;
  preparation?: string;
}

export interface RecommendationReason {
  id: string;
  text: string;
}

export interface Recipe {
  id: string;
  title: string;
  imageUri: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  difficulty: RecipeDifficulty;
  servings: number;
  /** Estimated cost, in USD, of the ingredients the user doesn't already have. Static seed-authored figure, not a live pricing estimate. */
  additionalCostEstimate: number;
  /** 0-100 pantry-overlap match score, computed at read time from live pantry ownership (owned/total ingredients) - not stored, not learned, not a recommendation model. */
  smartMatchScore: number;
  /**
   * Convenience non-null projection for existing simple display components.
   * Safe today because every Phase 3 recipe has complete per-serving macros;
   * any future incomplete recipe should be read via `nutritionSnapshot`
   * (below) instead, which honestly preserves unknown fields as null.
   */
  nutritionPerServing: NutritionFacts;
  reasons: RecommendationReason[];
  ingredients: RecipeIngredient[];
  steps: string[];
  cuisines: string[];
  tags: string[];
  collections: RecipeCollectionId[];
  // --- Phase 3 additions - populated for real (Supabase-backed) recipes only. ---
  /** recipe_versions.id - equal to `id` for real recipes. The exact immutable version this Recipe represents. */
  recipeVersionId?: string;
  nutritionStatus?: NutritionStatus;
  /** Honest, nullable-fields version of nutritionPerServing - use this for cooking/logging math, never the coalesced convenience field above. */
  nutritionSnapshot?: NutritionSnapshot;
  trustLabel?: RecipeTrustLabel;
}
