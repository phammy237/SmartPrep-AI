import { MealLog } from './mealLog';
import { PreparedMeal } from './preparedMeal';

export const COOKING_EVENT_STATUS_VALUES = ['started', 'completed', 'cancelled'] as const;
export type CookingEventStatus = (typeof COOKING_EVENT_STATUS_VALUES)[number];

export const PANTRY_DEDUCTION_STATUS_VALUES = ['pending', 'applied', 'skipped'] as const;
export type PantryDeductionStatus = (typeof PANTRY_DEDUCTION_STATUS_VALUES)[number];

export const MATCH_CONFIDENCE_VALUES = ['exact', 'likely', 'uncertain', 'none'] as const;
export type MatchConfidence = (typeof MATCH_CONFIDENCE_VALUES)[number];

export interface CookingEvent {
  id: string;
  recipeVersionId: string;
  mealPlanItemId?: string;
  status: CookingEventStatus;
  plannedServings: number;
  actualServingsPrepared?: number;
  finalBatchWeightG?: number;
  pantryDeductionStatus: PantryDeductionStatus;
  startedAt: string;
  completedAt?: string;
}

/**
 * A single recipe ingredient's proposed pantry mapping, shown to the user
 * for review/correction before completing cooking. Never applied silently -
 * `userConfirmed` must be true (or `wasSkipped`/`notSourcedFromPantry` set)
 * before complete_cooking_event will act on it.
 */
export interface PantryDeductionProposal {
  recipeIngredientId: string;
  ingredientName: string;
  requestedQuantity?: number;
  requestedUnit?: string;
  isOptional: boolean;
  pantryItemId?: string;
  pantryItemName?: string;
  availableQuantity?: number;
  pantryUnit?: string;
  /** True only when the proposed pantry item's unit exactly matches the recipe's requested unit - Phase 3 has no unit-conversion table, so mismatched units are never auto-converted. */
  unitsCompatible: boolean;
  deductedQuantity: number;
  deductedUnit?: string;
  matchConfidence: MatchConfidence;
  userConfirmed: boolean;
  wasSkipped: boolean;
  notSourcedFromPantry: boolean;
}

export interface CookingEventIngredient {
  id: string;
  cookingEventId: string;
  recipeIngredientId: string;
  pantryItemId?: string;
  requestedQuantity: number;
  requestedUnit?: string;
  deductedQuantity: number;
  deductedUnit?: string;
  estimatedGrams?: number;
  matchConfidence?: MatchConfidence;
  userConfirmed: boolean;
  wasSkipped: boolean;
}

export interface CompleteCookingEventResult {
  cookingEvent: CookingEvent;
  preparedMeal: PreparedMeal;
  mealLog?: MealLog;
  deductions: CookingEventIngredient[];
}
