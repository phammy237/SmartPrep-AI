import { IngredientCategory, QuantityUnit } from './common';
import { NutrientKey, NutritionFacts } from './nutrition';

/** Nutrients per 100 g. Every field optional - unknown is absent, never a fabricated 0. */
export type IngredientNutritionPer100g = Partial<Record<NutrientKey, number>>;

/**
 * How much to trust an ingredient's authored per-100g nutrition:
 *   estimated  - a reasonable approximation authored in the catalog
 *   candidate  - a USDA row is linked but not confirmed
 *   verified   - a defensible USDA match or explicit confirmation
 */
export const INGREDIENT_NUTRITION_STATUS_VALUES = ['estimated', 'candidate', 'verified'] as const;
export type IngredientNutritionStatus = (typeof INGREDIENT_NUTRITION_STATUS_VALUES)[number];

/**
 * Canonical catalog entry for an ingredient - the "what is this" record.
 * PantryItem, ScanDetection, RecipeIngredient, GroceryListItem all reference
 * one of these via ingredientId, but also denormalize name/imageUri/category
 * onto themselves for fast list rendering without a catalog lookup.
 *
 * Phase 4 adds the fields needed to normalize quantities to grams and resolve
 * nutrition: `normalizedName` + `aliases` for conservative identity matching
 * (exact only, no fuzzy AI), `gramsPerUnit` / `densityGPerMl` as the default
 * conversion metadata, and `nutritionPer100g` as an authored fallback
 * reference. Authoritative / USDA-verified references live server-side
 * (`canonical_ingredient_nutrition`); per-user tweaks live in
 * `user_ingredient_overrides`.
 */
export interface Ingredient {
  id: string;
  name: string;
  /** lowercased, trimmed, whitespace-collapsed `name` - the key for exact identity matching. */
  normalizedName: string;
  category: IngredientCategory;
  /** Real photo URL representing this ingredient. */
  imageUri: string;
  defaultUnit: QuantityUnit;
  /** Nutrition for one fixed reference serving (see `servingDescription`) - legacy, not gram-anchored. */
  nutritionPerServing: NutritionFacts;
  /** e.g. "1/2 cup", "1 egg" - the serving `nutritionPerServing` describes. */
  servingDescription: string;

  // --- Phase 4: normalization foundation (all optional) ---
  /** Other exact spellings that resolve to this same canonical ingredient. */
  aliases?: string[];
  /** Grams for ONE of a given count unit, keyed by canonical unit string (e.g. { item: 174, clove: 3 }). */
  gramsPerUnit?: Partial<Record<string, number>>;
  /** Grams per millilitre, for volume<->mass conversion (e.g. milk 1.03, olive oil 0.913). */
  densityGPerMl?: number;
  /** Authored per-100g nutrition - the fallback reference when no server row exists. */
  nutritionPer100g?: IngredientNutritionPer100g;
  /** Trust level of `nutritionPer100g`. Defaults to 'estimated' when that field is set. */
  nutritionStatus?: IngredientNutritionStatus;
  /** A confidently-exact USDA FoodData Central id, when one has been authored. Presence alone does NOT mean verified. */
  fdcId?: number;
}
