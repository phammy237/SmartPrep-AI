import { z } from 'zod';

import { ingredientCategorySchema, quantityUnitSchema } from './pantrySchemas';

/** Manual "Add Item" from the grocery screen. */
export const addGroceryItemSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120, 'Name is too long'),
  category: ingredientCategorySchema,
  quantity: z.number().finite('Enter a valid quantity').positive('Quantity must be greater than zero'),
  unit: quantityUnitSchema,
});

/**
 * Editing an existing line (name / quantity / unit / category). Backend
 * capability - the current UI has no edit affordance, but the service and
 * repository support it and it is covered by tests.
 */
export const updateGroceryItemSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Enter a name').max(120, 'Name is too long').optional(),
    category: ingredientCategorySchema.optional(),
    quantity: z.number().finite('Enter a valid quantity').positive('Quantity must be greater than zero').optional(),
    unit: quantityUnitSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export type AddGroceryItemInput = z.infer<typeof addGroceryItemSchema>;
export type UpdateGroceryItemInput = z.infer<typeof updateGroceryItemSchema>;
