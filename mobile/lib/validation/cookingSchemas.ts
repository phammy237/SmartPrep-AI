import { z } from 'zod';

export const matchConfidenceSchema = z.enum(['exact', 'likely', 'uncertain', 'none']);
const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

export const startCookingEventSchema = z.object({
  recipeVersionId: z.string().uuid(),
  mealPlanItemId: z.string().uuid().optional(),
  plannedServings: z.number().finite().positive().optional(),
  idempotencyKey: z.string().min(1, 'An idempotency key is required'),
});

/**
 * One proposed deduction from the cooking-flow pantry review. `userConfirmed`
 * must be true before complete_cooking_event will actually deduct anything
 * for this ingredient (unless wasSkipped/notSourcedFromPantry) - matching
 * "no silent deduction from string similarity alone".
 */
export const deductionInputSchema = z.object({
  recipeIngredientId: z.string().uuid(),
  pantryItemId: z.string().uuid().optional(),
  requestedQuantity: z.number().finite().min(0).optional(),
  requestedUnit: z.string().optional(),
  deductedQuantity: z.number().finite().min(0),
  deductedUnit: z.string().optional(),
  estimatedGrams: z.number().finite().min(0).optional(),
  matchConfidence: matchConfidenceSchema.optional(),
  userConfirmed: z.boolean(),
  wasSkipped: z.boolean(),
});

export const completeCookingEventSchema = z
  .object({
    cookingEventId: z.string().uuid(),
    actualServingsPrepared: z.number().finite('Enter a valid amount').positive('Must be greater than zero'),
    deductions: z.array(deductionInputSchema),
    finalBatchWeightG: z.number().finite().positive().optional(),
    servingsConsumedNow: z.number().finite().min(0, 'Cannot be negative'),
    mealType: mealTypeSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.servingsConsumedNow === 0 || !!v.mealType, {
    message: 'Choose a meal type to log what you ate now',
    path: ['mealType'],
  });

export type StartCookingEventInput = z.infer<typeof startCookingEventSchema>;
export type DeductionInput = z.infer<typeof deductionInputSchema>;
export type CompleteCookingEventInput = z.infer<typeof completeCookingEventSchema>;
