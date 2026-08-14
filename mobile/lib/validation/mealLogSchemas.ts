import { z } from 'zod';

import { nutritionSnapshotSchema } from './nutritionSchemas';

const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

export const quickAddMealLogSchema = z.object({
  mealType: mealTypeSchema,
  nutrition: nutritionSnapshotSchema,
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(1, 'An idempotency key is required'),
  consumedAt: z.string().optional(),
});

export const voidMealLogSchema = z.object({
  mealLogId: z.string().uuid(),
  reason: z.string().trim().min(1, 'A reason is required').max(300),
});

export const correctMealLogSchema = z.object({
  mealLogId: z.string().uuid(),
  reason: z.string().trim().min(1, 'A reason is required').max(300),
  newMealType: mealTypeSchema,
  newNutrition: nutritionSnapshotSchema,
  newServingsConsumed: z.number().finite().positive().optional(),
  newGramsConsumed: z.number().finite().positive().optional(),
  newNotes: z.string().trim().max(500).optional(),
  newIdempotencyKey: z.string().min(1).optional(),
  newConsumedAt: z.string().datetime({ offset: true }).optional(),
});

export type QuickAddMealLogInput = z.infer<typeof quickAddMealLogSchema>;
export type VoidMealLogInput = z.infer<typeof voidMealLogSchema>;
export type CorrectMealLogInput = z.infer<typeof correctMealLogSchema>;
