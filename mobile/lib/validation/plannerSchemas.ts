import { z } from 'zod';

export const mealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const mealPlanStatusSchema = z.enum(['planned', 'completed', 'skipped', 'cancelled']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format');
const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM format');

export const createMealPlanEntrySchema = z.object({
  scheduledDate: isoDate,
  scheduledTime: isoTime.optional(),
  timezone: z.string().min(1),
  mealSlot: mealSlotSchema,
  recipeVersionId: z.string().uuid(),
  plannedServings: z.number().finite('Enter a valid amount').positive('Must be greater than zero'),
  notes: z.string().trim().max(500).optional(),
});

export const updateMealPlanEntrySchema = z.object({
  scheduledDate: isoDate.optional(),
  scheduledTime: isoTime.nullable().optional(),
  mealSlot: mealSlotSchema.optional(),
  recipeVersionId: z.string().uuid().optional(),
  plannedServings: z.number().finite('Enter a valid amount').positive('Must be greater than zero').optional(),
  status: mealPlanStatusSchema.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type CreateMealPlanEntryInput = z.infer<typeof createMealPlanEntrySchema>;
export type UpdateMealPlanEntryInput = z.infer<typeof updateMealPlanEntrySchema>;
