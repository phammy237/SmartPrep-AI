import { z } from 'zod';

export const ingredientCategorySchema = z.enum(['produce', 'protein', 'dairy', 'pantry', 'frozen', 'other']);

export const quantityUnitSchema = z.enum([
  'item',
  'container',
  'bag',
  'bottle',
  'can',
  'package',
  'serving',
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'L',
]);

export const storageLocationSchema = z.enum(['fridge', 'freezer', 'pantry', 'counter', 'other']);

export const userProvidedDateTypeSchema = z.enum(['best_by', 'use_by', 'sell_by']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format');

export const createPantryItemSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Enter a name').max(120, 'Name is too long'),
    category: ingredientCategorySchema,
    quantity: z.number().finite('Enter a valid quantity').min(0, 'Quantity cannot be negative'),
    unit: quantityUnitSchema,
    storageLocation: storageLocationSchema.optional(),
    notes: z.string().trim().max(500, 'Keep notes under 500 characters').optional(),
    purchaseDate: isoDate.optional(),
    openedDate: isoDate.optional(),
    userProvidedDate: isoDate.optional(),
    userProvidedDateType: userProvidedDateTypeSchema.optional(),
  })
  .refine((v) => !v.userProvidedDate || !!v.userProvidedDateType, {
    message: 'Choose what kind of date this is (best by, use by, or sell by)',
    path: ['userProvidedDateType'],
  });

export const editPantryItemMetadataSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter a name').max(120, 'Name is too long').optional(),
  category: ingredientCategorySchema.optional(),
  unit: quantityUnitSchema.optional(),
  storageLocation: storageLocationSchema.optional(),
  notes: z.string().trim().max(500, 'Keep notes under 500 characters').optional(),
  purchaseDate: isoDate.optional(),
  openedDate: isoDate.optional(),
  userProvidedDate: isoDate.optional(),
  userProvidedDateType: userProvidedDateTypeSchema.optional(),
});

export const adjustQuantitySchema = z.object({
  itemId: z.string().min(1),
  delta: z.number().finite('Enter a valid amount').refine((v) => v !== 0, 'Change must not be zero'),
  eventType: z.enum(['adjusted', 'consumed', 'deducted_by_cooking']),
  reason: z.string().trim().max(200).optional(),
});

export const depleteItemSchema = z.object({
  itemId: z.string().min(1),
  eventType: z.enum(['depleted', 'discarded', 'corrected']),
  reason: z.string().trim().max(200).optional(),
});

export const restoreItemSchema = z.object({
  itemId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
});

export const confirmItemSchema = z.object({
  itemId: z.string().min(1),
});

export const pantryStatusFilterSchema = z.enum(['active', 'depleted']);
export const pantryCategoryFilterSchema = z.union([ingredientCategorySchema, z.literal('all')]);
export const pantrySortOptionSchema = z.enum(['urgency', 'name', 'recentlyAdded']);

export type CreatePantryItemInput = z.infer<typeof createPantryItemSchema>;
export type EditPantryItemMetadataInput = z.infer<typeof editPantryItemMetadataSchema>;
export type AdjustQuantityInput = z.infer<typeof adjustQuantitySchema>;
export type DepleteItemInput = z.infer<typeof depleteItemSchema>;
export type RestoreItemInput = z.infer<typeof restoreItemSchema>;
export type ConfirmItemInput = z.infer<typeof confirmItemSchema>;
