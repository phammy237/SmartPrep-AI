/**
 * Plan-level (whole-week) grocery demand.
 *
 * The recipe-detail flow answers "what does THIS recipe still need?" one
 * ingredient at a time. A meal plan needs the same question answered ACROSS
 * every planned recipe at once, and - critically - pantry stock must be
 * allocated against the *combined* demand exactly once, never once per recipe.
 *
 *   Recipe A: 300 g chicken   Recipe B: 400 g chicken   Pantry: 250 g chicken
 *   -> total demand 700 g, minus 250 g on hand once = 450 g to buy
 *   (NOT  A:50 + B:150 = 200, which would spend the same 250 g twice)
 *
 * This module does the aggregation and then hands the single combined
 * requirement to the shared `computeIngredientCoverage` engine - it invents no
 * coverage or conversion logic of its own. All unit math goes through
 * conversion.ts; incompatible units are kept as separate demand segments,
 * never force-combined.
 */

import { IngredientConversionMeta, convertQuantity, resolveQuantityToGrams, roundGrams } from './conversion';
import { IngredientCoverage, PantryLot, computeIngredientCoverage } from './pantryCoverage';
import { normalizeUnit, unitCategory } from './units';

export type PlanDemandStatus = IngredientCoverage['status'];

/** One planned-recipe's call on a single ingredient (already servings-scaled). */
export interface PlanDemandContribution {
  recipeVersionId: string;
  /** Servings-scaled required quantity. */
  quantity: number;
  unit: string;
  isPantryStaple: boolean;
}

/**
 * One shoppable chunk of an ingredient's plan demand. Usually there is exactly
 * one (all the recipes' calls combined). A second (or more) appears only when
 * some calls are in units that cannot be safely combined with the rest - those
 * become their own conservative segments rather than being dropped or guessed.
 */
export interface PlanDemandSegment {
  status: PlanDemandStatus;
  /** The aggregated requirement this segment represents. */
  requirement: { quantity: number; unit: string };
  /** Result of the single pantry allocation for this segment. */
  coverage: IngredientCoverage;
  /** True when this segment could not be unit-combined with the ingredient's main demand. */
  incombinable: boolean;
  contributingRecipeVersionIds: string[];
}

export interface PlanIngredientDemand {
  ingredientId: string;
  name: string;
  imageUri: string;
  /** Worst status across the segments (missing > unresolved > partial > covered). */
  status: PlanDemandStatus;
  segments: PlanDemandSegment[];
  contributions: PlanDemandContribution[];
  /** Every planned recipe version that called for this ingredient (staples included). */
  recipeVersionIds: string[];
}

export interface PlanGroceryDemandIngredientInput {
  ingredientId: string;
  name: string;
  imageUri: string;
  contributions: PlanDemandContribution[];
  /** In-stock pantry lots already matched to this canonical ingredient. */
  lots: PantryLot[];
  conversionMeta?: IngredientConversionMeta;
}

export interface PlanGroceryDemand {
  ingredients: PlanIngredientDemand[];
}

/** What `plannerService.getPlanGroceryDemand` returns - demand plus the reconciliation key. */
export interface PlanWeekGroceryDemand {
  /** Stable per (user, week) - reused on every "Add Week" so re-runs reconcile instead of doubling. */
  planGenerationKey: string;
  weekStart: string;
  weekEnd: string;
  /** Planned (status = 'planned') entries whose recipe resolved. */
  plannedRecipeCount: number;
  /** Planned entries whose recipe version could not be found (skipped, not silently dropped from the count). */
  unresolvedRecipeCount: number;
  demand: PlanGroceryDemand;
}

export function planGenerationKey(weekStart: string, weekEnd: string): string {
  return `mealplan_${weekStart}_${weekEnd}`;
}

const STATUS_RANK: Record<PlanDemandStatus, number> = { covered: 0, partial: 1, unresolved: 2, missing: 3 };

function validQty(q: unknown): q is number {
  return typeof q === 'number' && Number.isFinite(q) && q > 0;
}

function worstStatus(statuses: PlanDemandStatus[]): PlanDemandStatus {
  return statuses.reduce<PlanDemandStatus>(
    (worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst),
    'covered',
  );
}

interface UnitBucket {
  unitKey: string | null;
  rawUnit: string;
  quantity: number;
  recipeVersionIds: string[];
}

/** Sum every contribution that shares a normalized unit; keep unknown-unit calls separate. */
function bucketByUnit(contributions: PlanDemandContribution[]): UnitBucket[] {
  const byKey = new Map<string, UnitBucket>();
  const unknown: UnitBucket[] = [];
  for (const c of contributions) {
    const key = normalizeUnit(c.unit);
    if (key === null) {
      unknown.push({ unitKey: null, rawUnit: c.unit, quantity: c.quantity, recipeVersionIds: [c.recipeVersionId] });
      continue;
    }
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity = roundGrams(existing.quantity + c.quantity);
      if (!existing.recipeVersionIds.includes(c.recipeVersionId)) existing.recipeVersionIds.push(c.recipeVersionId);
    } else {
      byKey.set(key, { unitKey: key, rawUnit: c.unit, quantity: c.quantity, recipeVersionIds: [c.recipeVersionId] });
    }
  }
  return [...byKey.values(), ...unknown];
}

function unresolvedCoverage(
  ingredientId: string,
  quantity: number,
  unit: string,
  reason: IngredientCoverage['reason'],
): IngredientCoverage {
  return {
    status: 'unresolved',
    ingredientId,
    requiredQuantity: quantity,
    requiredUnit: unit,
    matchedLotCount: 0,
    basis: 'unresolved',
    reason,
  };
}

/**
 * Aggregate one ingredient's plan demand and allocate pantry against it ONCE.
 */
function demandForIngredient(input: PlanGroceryDemandIngredientInput): PlanIngredientDemand {
  const { ingredientId, name, imageUri, contributions, lots, conversionMeta } = input;
  const recipeVersionIds = Array.from(new Set(contributions.map((c) => c.recipeVersionId)));

  // Staples are never shopped; drop them and any call with no usable quantity.
  const shoppable = contributions.filter((c) => !c.isPantryStaple && validQty(c.quantity));

  if (shoppable.length === 0) {
    return {
      ingredientId,
      name,
      imageUri,
      status: 'covered',
      segments: [],
      contributions,
      recipeVersionIds,
    };
  }

  const buckets = bucketByUnit(shoppable);
  const known = buckets.filter((b): b is UnitBucket & { unitKey: string } => b.unitKey !== null);
  const unknownUnitBuckets = buckets.filter((b) => b.unitKey === null);

  const segments: PlanDemandSegment[] = [];

  // Calls whose unit isn't in the taxonomy at all -> conservative, flagged, never dropped.
  for (const b of unknownUnitBuckets) {
    segments.push({
      status: 'unresolved',
      requirement: { quantity: b.quantity, unit: b.rawUnit },
      coverage: unresolvedCoverage(ingredientId, b.quantity, b.rawUnit, 'unsupported_unit'),
      incombinable: true,
      contributingRecipeVersionIds: b.recipeVersionIds,
    });
  }

  if (known.length === 1) {
    // The common case: every call in one unit -> one combined requirement,
    // one pantry allocation.
    const b = known[0];
    segments.push({
      status: 'covered', // replaced below
      requirement: { quantity: b.quantity, unit: b.unitKey },
      coverage: computeIngredientCoverage({
        ingredientId,
        requiredQuantity: b.quantity,
        requiredUnit: b.unitKey,
        lots,
        conversionMeta,
      }),
      incombinable: false,
      contributingRecipeVersionIds: b.recipeVersionIds,
    });
  } else if (known.length > 1) {
    const categories = new Set(known.map((b) => unitCategory(b.unitKey)));
    const soleCategory = categories.size === 1 ? [...categories][0] : null;

    if (soleCategory === 'mass' || soleCategory === 'volume') {
      // All calls in one convertible category (mass or volume): combine
      // deterministically with NO metadata needed (300 g + 0.5 kg -> 800 g;
      // 200 ml + 0.3 L -> 500 ml). One requirement, one pantry allocation.
      const targetUnit = known[0].unitKey;
      let total = 0;
      const ids: string[] = [];
      for (const b of known) {
        const c = convertQuantity({ quantity: b.quantity, fromUnit: b.unitKey, toUnit: targetUnit });
        total += c.status === 'converted' ? c.value : b.quantity;
        ids.push(...b.recipeVersionIds);
      }
      total = roundGrams(total);
      segments.push({
        status: 'covered', // replaced below
        requirement: { quantity: total, unit: targetUnit },
        coverage: computeIngredientCoverage({
          ingredientId,
          requiredQuantity: total,
          requiredUnit: targetUnit,
          lots,
          conversionMeta,
        }),
        incombinable: false,
        contributingRecipeVersionIds: Array.from(new Set(ids)),
      });
    } else {
      // Units span categories (e.g. count + mass). Combine everything that
      // resolves to grams into ONE gram requirement (one pantry allocation);
      // anything that can't resolve stays its own conservative segment - pantry
      // is NOT consulted for it (it can't be, and doing so would double-spend
      // the stock the gram demand already used).
      const resolved: { grams: number; recipeVersionIds: string[] }[] = [];
      const unresolvedBuckets: {
        bucket: UnitBucket & { unitKey: string };
        reason: IngredientCoverage['reason'];
      }[] = [];
      for (const b of known) {
        const g = resolveQuantityToGrams(b.quantity, b.unitKey, conversionMeta);
        if (g.status === 'converted') resolved.push({ grams: g.grams, recipeVersionIds: b.recipeVersionIds });
        else unresolvedBuckets.push({ bucket: b, reason: g.reason });
      }

      if (resolved.length > 0) {
        const grams = roundGrams(resolved.reduce((s, r) => s + r.grams, 0));
        const ids = Array.from(new Set(resolved.flatMap((r) => r.recipeVersionIds)));
        segments.push({
          status: 'covered', // replaced below
          requirement: { quantity: grams, unit: 'g' },
          coverage: computeIngredientCoverage({
            ingredientId,
            requiredQuantity: grams,
            requiredUnit: 'g',
            lots,
            conversionMeta,
          }),
          incombinable: false,
          contributingRecipeVersionIds: ids,
        });
      }

      for (const { bucket: b, reason } of unresolvedBuckets) {
        segments.push({
          status: 'unresolved',
          requirement: { quantity: b.quantity, unit: b.unitKey },
          coverage: unresolvedCoverage(ingredientId, b.quantity, b.unitKey, reason),
          incombinable: true,
          contributingRecipeVersionIds: b.recipeVersionIds,
        });
      }
    }
  }

  for (const seg of segments) seg.status = seg.coverage.status;

  return {
    ingredientId,
    name,
    imageUri,
    status: worstStatus(segments.map((s) => s.status)),
    segments,
    contributions,
    recipeVersionIds,
  };
}

/** Pure whole-plan aggregation. Caller supplies the gathered recipe/pantry data. */
export function computePlanGroceryDemand(input: { ingredients: PlanGroceryDemandIngredientInput[] }): PlanGroceryDemand {
  return { ingredients: input.ingredients.map(demandForIngredient) };
}
