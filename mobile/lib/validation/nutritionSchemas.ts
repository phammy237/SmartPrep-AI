import { z } from 'zod';

/**
 * Mirrors migration 0003's is_valid_nutrition_snapshot SQL check - keep both
 * in sync by hand. Every nutrient is nullable/optional (unknown, never
 * fabricated as zero); only `status` is required, and at least one nutrient
 * must be known for the snapshot to mean anything.
 */
const nonNegativeFinite = z.number().finite('Must be a finite number').min(0, 'Cannot be negative');
const nutrientField = nonNegativeFinite.nullable().optional();

export const nutritionStatusSchema = z.enum(['verified', 'estimated', 'incomplete']);
export const nutritionCalculationBasisSchema = z.enum([
  'per_serving',
  'per_gram',
  'per_batch',
  'manual_entry',
  'per_quantity',
]);

export const nutritionSnapshotSchema = z
  .object({
    calories: nutrientField,
    proteinG: nutrientField,
    carbsG: nutrientField,
    fatG: nutrientField,
    fiberG: nutrientField,
    sugarG: nutrientField,
    sodiumMg: nutrientField,
    status: nutritionStatusSchema,
    calculationBasis: nutritionCalculationBasisSchema,
    uncertaintyNotes: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (v) => [v.calories, v.proteinG, v.carbsG, v.fatG, v.fiberG, v.sugarG, v.sodiumMg].some((x) => x !== null && x !== undefined),
    { message: 'At least one nutrient value must be known' },
  );

export type NutritionSnapshotInput = z.infer<typeof nutritionSnapshotSchema>;

/**
 * Stricter boundary used ONLY when importing/seeding a recipe's per-serving
 * nutrition: calories/protein/carbs/fat are required there (a "complete
 * estimated" recipe needs them to be useful for planning/cooking). The
 * universal nutritionSnapshotSchema above deliberately does NOT require
 * these - meal logs (a calories-only quick-add) and partially-known recipes
 * both depend on that looseness to avoid fabricating missing macros as 0.
 */
export const estimatedRecipeNutritionSchema = z.object({
  calories: nonNegativeFinite,
  proteinG: nonNegativeFinite,
  carbsG: nonNegativeFinite,
  fatG: nonNegativeFinite,
  fiberG: nutrientField,
  sugarG: nutrientField,
  sodiumMg: nutrientField,
  status: nutritionStatusSchema,
  calculationBasis: nutritionCalculationBasisSchema,
  uncertaintyNotes: z.string().trim().max(500).nullable().optional(),
});
