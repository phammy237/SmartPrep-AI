import { z } from 'zod';

export const logPreparedMealConsumptionSchema = z.object({
  preparedMealId: z.string().uuid(),
  servingsConsumed: z.number().finite('Enter a valid amount').positive('Must be greater than zero'),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export type LogPreparedMealConsumptionInput = z.infer<typeof logPreparedMealConsumptionSchema>;
