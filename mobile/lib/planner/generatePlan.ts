/**
 * Deterministic `Generate My Week` schedule builder.
 *
 * Greedy, chronological, pure. For each day (earliest first) it scores every
 * recipe against the CURRENT virtual pantry using the SAME
 * `scoreRecommendationCandidate` that powers Home "Use Soon", picks the best
 * feasible recipe, virtually consumes its requirements (FEFO) so the next day
 * ranks against what's left, and records whether the pick was freshness-driven.
 *
 * It never mutates real pantry, never persists, never uses randomness.
 * plannerService owns the fetch + the `meal_plan_items` writes; this module
 * owns the maths.
 */

import { IngredientConversionMeta } from '@/lib/nutrition/conversion';
import {
  ExpiryState,
  RecommendationCandidate,
  UrgentIngredientDetail,
  scoreRecommendationCandidate,
} from '@/lib/freshness';
import { PantryItem, Recipe } from '@/types';
import {
  buildVirtualPantry,
  consumeVirtualAllocation,
  probeVirtualAllocation,
  virtualLotsForIngredient,
} from './virtualPantry';

export interface GeneratePlanInput {
  /** Chronological ISO dates (YYYY-MM-DD) to fill, one dinner each. */
  dates: string[];
  today: string;
  timeZone: string;
  now: Date;
  /** Hydrated recipes (coverage present). Ingredient list + staple flags are read; coverage is recomputed against the virtual pantry. */
  recipes: Recipe[];
  pantry: PantryItem[];
  conversionMeta: Map<string, IngredientConversionMeta>;
  /** Planned servings for a recipe. Defaults to `recipe.servings` (current planner behavior). */
  plannedServings?: (r: Recipe) => number;
  /** Extra score penalty per prior use of the same recipe this week (diversity). Default 4. */
  repeatPenalty?: number;
}

export interface PlannedSlot {
  date: string;
  recipeId: string;
  recipeVersionId: string;
  plannedServings: number;
  /** Chosen at least partly because it draws on expiring stock. */
  freshnessPrioritized: boolean;
  urgentIngredientIds: string[];
  urgentIngredientNames: string[];
  /** Smallest daysUntilExpiry among the urgent lots this recipe targets. */
  minUrgentDaysUntilExpiry?: number;
  /** Non-staple ingredients with no matching virtual stock at all. */
  missingIngredientCount: number;
}

export interface PlanExpiryWarning {
  code: 'expiry_after_planned_date';
  ingredientId: string;
  ingredientName: string;
  expirationDate: string;
  plannedDate: string;
  recipeVersionId: string;
}

export interface GeneratePlanResult {
  slots: PlannedSlot[];
  /** Distinct urgent-ingredient ids the generated week draws on. */
  urgentIngredientsTargeted: string[];
  recipesUsingUrgentStock: number;
  /** Σ missingIngredientCount over the selected slots - the rough grocery burden. */
  estimatedShortfallCount: number;
  warnings: PlanExpiryWarning[];
}

interface UrgentHit {
  id: string;
  name: string;
  state: ExpiryState;
  days?: number;
  expDate?: string;
  confirmed: boolean;
  unresolved: boolean;
}

interface ScoredRecipe {
  recipe: Recipe;
  recipeVersionId: string;
  plannedServings: number;
  factor: number;
  score: number;
  urgent: UrgentHit[];
  minUrgentDays?: number;
  missingIngredientCount: number;
}

const EPS = 0.001;

export function generatePlan(input: GeneratePlanInput): GeneratePlanResult {
  const { dates, recipes, pantry, conversionMeta, timeZone, now } = input;
  const servingsOf = input.plannedServings ?? ((r: Recipe) => r.servings);
  const repeatPenalty = input.repeatPenalty ?? 4;

  const vp = buildVirtualPantry(pantry, timeZone, now);
  const usedCount = new Map<string, number>();
  const slots: PlannedSlot[] = [];
  const warnings: PlanExpiryWarning[] = [];

  for (const date of dates) {
    if (recipes.length === 0) break;

    const scored: ScoredRecipe[] = recipes.map((recipe) => {
      const recipeVersionId = recipe.recipeVersionId ?? recipe.id;
      const plannedServings = servingsOf(recipe);
      const factor = recipe.servings > 0 ? plannedServings / recipe.servings : 1;
      const nonStaple = recipe.ingredients.filter((i) => !i.isPantryStaple);

      let covered = 0;
      let missing = 0;
      const urgent: UrgentHit[] = [];

      for (const ing of nonStaple) {
        const lots = virtualLotsForIngredient(ing, vp);
        if (lots.length === 0) {
          missing += 1;
          continue;
        }
        const probe = probeVirtualAllocation(
          vp,
          ing,
          ing.quantity * factor,
          ing.unit,
          conversionMeta.get(ing.ingredientId),
        );
        if (probe.quantityUnresolved) {
          if (probe.worstUrgentLot) {
            urgent.push({
              id: ing.ingredientId,
              name: ing.name,
              state: probe.worstUrgentLot.expiryState,
              days: probe.worstUrgentLot.daysUntilExpiry,
              expDate: probe.worstUrgentLot.expirationDate,
              confirmed: probe.worstUrgentLot.isUserConfirmedDate,
              unresolved: true,
            });
          }
          continue;
        }
        if (probe.unresolvedRemainder <= EPS) covered += 1;
        if (probe.urgentQuantityUtilized > 0 && probe.worstUrgentLot) {
          urgent.push({
            id: ing.ingredientId,
            name: ing.name,
            state: probe.worstUrgentLot.expiryState,
            days: probe.worstUrgentLot.daysUntilExpiry,
            expDate: probe.worstUrgentLot.expirationDate,
            confirmed: probe.worstUrgentLot.isUserConfirmedDate,
            unresolved: false,
          });
        }
      }

      const candidate: RecommendationCandidate = {
        recipeId: recipe.id,
        recipeVersionId,
        title: recipe.title,
        imageUri: recipe.imageUri,
        coveredCount: covered,
        totalCount: nonStaple.length,
        missingIngredientCount: missing,
        urgentIngredients: urgent.map(
          (u): UrgentIngredientDetail => ({
            ingredientId: u.id,
            name: u.name,
            expiryState: u.state,
            expirationDate: u.expDate,
            daysUntilExpiry: u.days,
            isUserConfirmedDate: u.confirmed,
            quantityUnresolved: u.unresolved,
          }),
        ),
      };

      const urgentDays = urgent.map((u) => u.days).filter((d): d is number => typeof d === 'number');
      const priorUses = usedCount.get(recipeVersionId) ?? 0;
      return {
        recipe,
        recipeVersionId,
        plannedServings,
        factor,
        score: scoreRecommendationCandidate(candidate) - repeatPenalty * priorUses,
        urgent,
        minUrgentDays: urgentDays.length > 0 ? Math.min(...urgentDays) : undefined,
        missingIngredientCount: missing,
      };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // schedule earliest-expiring recipes on the earliest open days
      const da = a.minUrgentDays ?? Number.POSITIVE_INFINITY;
      const db = b.minUrgentDays ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      if (a.missingIngredientCount !== b.missingIngredientCount) {
        return a.missingIngredientCount - b.missingIngredientCount;
      }
      return a.recipeVersionId < b.recipeVersionId ? -1 : a.recipeVersionId > b.recipeVersionId ? 1 : 0;
    });

    const chosen = scored[0];
    usedCount.set(chosen.recipeVersionId, (usedCount.get(chosen.recipeVersionId) ?? 0) + 1);

    // Virtually consume the chosen recipe's requirements so later days rank
    // against what's left (prevents double-counting the same stock).
    for (const ing of chosen.recipe.ingredients) {
      if (ing.isPantryStaple) continue;
      consumeVirtualAllocation(
        vp,
        ing,
        ing.quantity * chosen.factor,
        ing.unit,
        conversionMeta.get(ing.ingredientId),
      );
    }

    // We are already on the earliest open date; a still-earlier expiry means
    // no arrangement fits it - surface it (once per ingredient) rather than
    // pretend the schedule solved it.
    for (const u of chosen.urgent) {
      if (u.expDate && u.expDate < date && !warnings.some((w) => w.ingredientId === u.id)) {
        warnings.push({
          code: 'expiry_after_planned_date',
          ingredientId: u.id,
          ingredientName: u.name,
          expirationDate: u.expDate,
          plannedDate: date,
          recipeVersionId: chosen.recipeVersionId,
        });
      }
    }

    slots.push({
      date,
      recipeId: chosen.recipe.id,
      recipeVersionId: chosen.recipeVersionId,
      plannedServings: chosen.plannedServings,
      freshnessPrioritized: chosen.urgent.length > 0,
      urgentIngredientIds: chosen.urgent.map((u) => u.id),
      urgentIngredientNames: chosen.urgent.map((u) => u.name),
      minUrgentDaysUntilExpiry: chosen.minUrgentDays,
      missingIngredientCount: chosen.missingIngredientCount,
    });
  }

  const urgentIngredientsTargeted = Array.from(
    new Set(slots.flatMap((s) => s.urgentIngredientIds)),
  );

  return {
    slots,
    urgentIngredientsTargeted,
    recipesUsingUrgentStock: slots.filter((s) => s.urgentIngredientIds.length > 0).length,
    estimatedShortfallCount: slots.reduce((sum, s) => sum + s.missingIngredientCount, 0),
    warnings,
  };
}
