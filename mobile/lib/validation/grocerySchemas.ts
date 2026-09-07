import { z } from 'zod';

import {
  ingredientCategorySchema,
  quantityUnitSchema,
  storageLocationSchema,
  userProvidedDateTypeSchema,
} from './pantrySchemas';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format');

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

/**
 * One reviewed line in the "add purchased items to pantry" flow. Pre-filled
 * from the grocery line, then edited by the user (a grocery quantity is what
 * was needed, not necessarily what was bought). `groceryItemId` is the stable
 * idempotency anchor - the same grocery line always transfers to the same
 * single pantry lot, regardless of the edited quantity/unit. Validated with
 * the same rules as a manual pantry add.
 */
export const groceryTransferItemSchema = z
  .object({
    groceryItemId: z.string().min(1),
    /** Catalog id from the grocery line, when it had one. */
    ingredientId: z.string().min(1).optional(),
    displayName: z.string().trim().min(1, 'Enter a name').max(120, 'Name is too long'),
    imageUri: z.string(),
    category: ingredientCategorySchema,
    quantity: z.number().finite('Enter a valid quantity').positive('Quantity must be greater than zero'),
    unit: quantityUnitSchema,
    storageLocation: storageLocationSchema.optional(),
    notes: z.string().trim().max(500, 'Keep notes under 500 characters').optional(),
    purchaseDate: isoDate.optional(),
    userProvidedDate: isoDate.optional(),
    userProvidedDateType: userProvidedDateTypeSchema.optional(),
  })
  .refine((v) => !v.userProvidedDate || !!v.userProvidedDateType, {
    message: 'Choose what kind of date this is (best by, use by, or sell by)',
    path: ['userProvidedDateType'],
  });

export type AddGroceryItemInput = z.infer<typeof addGroceryItemSchema>;
export type UpdateGroceryItemInput = z.infer<typeof updateGroceryItemSchema>;
export type GroceryTransferItemInput = z.infer<typeof groceryTransferItemSchema>;
