/**
 * Derive a recipe's nutrition from its ingredient-level gram quantities,
 * ingredient by ingredient, and report COVERAGE so a partially-resolved
 * recipe is never presented as fully known/verified.
 *
 * Pure: the caller supplies a `resolve` function that returns the merged
 * nutrition reference + conversion metadata for a canonical ingredient id
 * (nutritionService does the I/O). This module only does math + bookkeeping.
 */

import { NutritionStatus } from '@/types';
import { IngredientConversionMeta } from './conversion';
import { NutritionReference } from './nutritionReference';
import { resolveIngredientNutrition } from './resolveNutrition';

export interface RecipeIngredientForNutrition {
  ingredientId: string;
  quantity: number;
  unit: string;
  isOptional?: boolean;
}

export interface RecipeNutritionTotals {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

export interface RecipeNutritionCoverage {
  totalCount: number;
  resolvedCount: number;
  unresolvedIngredientIds: string[];
  totals: RecipeNutritionTotals;
  /** 'incomplete' if any ingredient is unresolved; else 'verified' only if EVERY resolved ingredient is verified; else 'estimated'. */
  status: NutritionStatus;
  /** True when at least one ingredient could not be resolved - `totals` is a partial sum. */
  isPartial: boolean;
}

export type ResolveIngredientReferenceFn = (ingredientId: string) => {
  reference: NutritionReference;
  conversionMeta?: IngredientConversionMeta;
};

const NUTRIENT_KEYS = ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg'] as const;

function roundNutrient(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

export function computeRecipeNutritionCoverage(
  ingredients: RecipeIngredientForNutrition[],
  resolve: ResolveIngredientReferenceFn,
): RecipeNutritionCoverage {
  const totalCount = ingredients.length;
  const unresolvedIngredientIds: string[] = [];
  let resolvedCount = 0;
  let allResolvedVerified = true;

  const sums: Record<(typeof NUTRIENT_KEYS)[number], { value: number; known: boolean }> = {
    calories: { value: 0, known: false },
    proteinG: { value: 0, known: false },
    carbsG: { value: 0, known: false },
    fatG: { value: 0, known: false },
    fiberG: { value: 0, known: false },
    sugarG: { value: 0, known: false },
    sodiumMg: { value: 0, known: false },
  };

  for (const ing of ingredients) {
    const { reference, conversionMeta } = resolve(ing.ingredientId);
    const resolution = resolveIngredientNutrition({
      quantity: ing.quantity,
      unit: ing.unit,
      conversionMeta,
      reference,
    });

    if (resolution.status === 'unresolved') {
      unresolvedIngredientIds.push(ing.ingredientId);
      continue;
    }

    resolvedCount += 1;
    if (resolution.status !== 'verified') allResolvedVerified = false;

    for (const key of NUTRIENT_KEYS) {
      const v = resolution.snapshot[key];
      if (typeof v === 'number') {
        sums[key].value += v;
        sums[key].known = true;
      }
    }
  }

  const totals: RecipeNutritionTotals = {
    calories: sums.calories.known ? roundNutrient(sums.calories.value) : null,
    proteinG: sums.proteinG.known ? roundNutrient(sums.proteinG.value) : null,
    carbsG: sums.carbsG.known ? roundNutrient(sums.carbsG.value) : null,
    fatG: sums.fatG.known ? roundNutrient(sums.fatG.value) : null,
    fiberG: sums.fiberG.known ? roundNutrient(sums.fiberG.value) : null,
    sugarG: sums.sugarG.known ? roundNutrient(sums.sugarG.value) : null,
    sodiumMg: sums.sodiumMg.known ? roundNutrient(sums.sodiumMg.value) : null,
  };

  const isPartial = unresolvedIngredientIds.length > 0;
  const status: NutritionStatus = isPartial
    ? 'incomplete'
    : resolvedCount > 0 && allResolvedVerified
      ? 'verified'
      : 'estimated';

  return { totalCount, resolvedCount, unresolvedIngredientIds, totals, status, isPartial };
}
