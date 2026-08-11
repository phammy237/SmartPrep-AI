import { QuantityUnit } from './common';
import { NutritionFacts } from './nutrition';

export type RecipeDifficulty = 'easy' | 'medium' | 'hard';

export type RecipeCollectionId =
  | 'use_it_before_you_lose_it'
  | 'cook_right_now'
  | 'almost_there'
  | 'quick_meals'
  | 'for_you'
  | 'something_different';

export interface RecipeIngredient {
  ingredientId: string;
  name: string;
  imageUri: string;
  quantity: number;
  unit: QuantityUnit;
  /** A pantry staple (salt, oil, etc.) that's excluded from "missing" counts. */
  isPantryStaple?: boolean;
  /**
   * Whether the user currently has this ingredient. Not stored in mock data -
   * recipeService hydrates this against the live pantry on every read, the
   * same way a real API would compute it server-side.
   */
  isOwned?: boolean;
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
  /** Estimated cost, in USD, of the ingredients the user doesn't already have. */
  additionalCostEstimate: number;
  /** 0-100 SmartPrep Match score. Hydrated by recipeService alongside `reasons`. */
  smartMatchScore: number;
  nutritionPerServing: NutritionFacts;
  reasons: RecommendationReason[];
  ingredients: RecipeIngredient[];
  steps: string[];
  cuisines: string[];
  tags: string[];
  collections: RecipeCollectionId[];
}
