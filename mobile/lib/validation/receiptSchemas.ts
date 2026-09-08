import { z } from 'zod';

import {
  ingredientCategorySchema,
  quantityUnitSchema,
  storageLocationSchema,
  userProvidedDateTypeSchema,
} from './pantrySchemas';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format');

/**
 * One reviewed receipt candidate the user chose to add. The user's edited
 * name/quantity/unit/category are authoritative; `rawText` is carried only as
 * provenance evidence. `candidateId` + `receiptScanId` are the idempotency
 * anchor (unique per user via `pantry_items.source_receipt_candidate_id`).
 */
export const confirmReceiptItemSchema = z
  .object({
    receiptScanId: z.string().uuid(),
    candidateId: z.string().trim().min(1).max(64),
    rawText: z.string().trim().max(300),
    displayName: z.string().trim().min(1, 'Enter a name').max(120, 'Name is too long'),
    category: ingredientCategorySchema,
    quantity: z.number().finite('Enter a valid quantity').min(0, 'Quantity cannot be negative'),
    unit: quantityUnitSchema,
    storageLocation: storageLocationSchema.optional(),
    notes: z.string().trim().max(500).optional(),
    /** Pre-filled from the receipt date for every selected item; user-editable. */
    purchaseDate: isoDate.optional(),
    userProvidedDate: isoDate.optional(),
    userProvidedDateType: userProvidedDateTypeSchema.optional(),
  })
  .refine((v) => !v.userProvidedDate || !!v.userProvidedDateType, {
    message: 'Choose what kind of date this is (best by, use by, or sell by)',
    path: ['userProvidedDateType'],
  });

export const confirmReceiptBatchSchema = z.object({
  receiptScanId: z.string().uuid(),
  items: z.array(confirmReceiptItemSchema).min(1, 'Select at least one item'),
  skippedCandidateIds: z.array(z.string().trim().min(1)).default([]),
});

export type ConfirmReceiptItemInput = z.infer<typeof confirmReceiptItemSchema>;
export type ConfirmReceiptBatchInput = z.infer<typeof confirmReceiptBatchSchema>;
