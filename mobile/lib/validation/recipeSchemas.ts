import { z } from 'zod';

export const saveRecipeSchema = z.object({
  recipeVersionId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
});

export type SaveRecipeInput = z.infer<typeof saveRecipeSchema>;
