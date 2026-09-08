import { z } from 'zod';

import {
  ingredientCategorySchema,
  quantityUnitSchema,
  storageLocationSchema,
  userProvidedDateTypeSchema,
} from './pantrySchemas';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format');

/** Raw manual-entry field. Real normalization/validation is `normalizeBarcode`. */
export const manualBarcodeSchema = z.object({
  barcode: z.string().trim().min(1, 'Enter a barcode').max(32, 'That is too long for a barcode'),
});

/**
 * The reviewed barcode-intake form. Same shape as a manual pantry add, plus the
 * barcode provenance fields. The user's reviewed values are authoritative -
 * provider package size never bypasses this.
 */
export const createBarcodeItemSchema = z
  .object({
    barcode: z.string().trim().min(1).max(32),
    displayName: z.string().trim().min(1, 'Enter a name').max(120, 'Name is too long'),
    brand: z.string().trim().max(120).optional(),
    category: ingredientCategorySchema,
    quantity: z.number().finite('Enter a valid quantity').min(0, 'Quantity cannot be negative'),
    unit: quantityUnitSchema,
    storageLocation: storageLocationSchema.optional(),
    notes: z.string().trim().max(500, 'Keep notes under 500 characters').optional(),
    purchaseDate: isoDate.optional(),
    userProvidedDate: isoDate.optional(),
    userProvidedDateType: userProvidedDateTypeSchema.optional(),
    imageUrl: z.string().url().optional(),
    sourceProductId: z.string().trim().max(64).optional(),
  })
  .refine((v) => !v.userProvidedDate || !!v.userProvidedDateType, {
    message: 'Choose what kind of date this is (best by, use by, or sell by)',
    path: ['userProvidedDateType'],
  });

export type ManualBarcodeInput = z.infer<typeof manualBarcodeSchema>;
export type CreateBarcodeItemInput = z.infer<typeof createBarcodeItemSchema>;
