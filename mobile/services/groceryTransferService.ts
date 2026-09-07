import { GroceryTransferItemInput, groceryTransferItemSchema } from '@/lib/validation/grocerySchemas';
import { GroceryListItem, PantryItem } from '@/types';
import { pantryService } from './pantryService';
import { requireUserId } from './requireUserId';

/**
 * Cross-domain glue: acquired Grocery lines -> real Pantry lots. Kept out of
 * groceryService (which never touches the pantry) and out of any screen. It
 * only orchestrates - identity resolution, expiration estimation, the atomic
 * per-line transfer, and the DB-enforced idempotency all live in
 * pantryService.createGroceryTransferItem / the transfer RPC.
 *
 * Transfer identity is the grocery-list-item id. One acquired line produces
 * exactly one pantry lot; re-submitting a line (retry, or including an
 * already-transferred one in a later bulk run) returns that same lot rather
 * than a duplicate. Editing the reviewed quantity/unit does not change which
 * pantry lot the line maps to.
 */

/** Grocery lines eligible for transfer: acquired and not yet transferred. */
export function getTransferableGroceryItems(items: GroceryListItem[]): GroceryListItem[] {
  return items.filter((item) => item.isChecked && item.pantryTransferStatus !== 'transferred');
}

/** Pre-fill a review row from a grocery line - editable before it is confirmed. */
export function groceryLineToTransferInput(item: GroceryListItem): GroceryTransferItemInput {
  return {
    groceryItemId: item.id,
    ingredientId: item.ingredientId,
    displayName: item.name,
    imageUri: item.imageUri,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
  };
}

export interface GroceryTransferResult {
  transferred: { groceryItemId: string; pantryItem: PantryItem }[];
  /** Lines whose transfer failed - safe to retry (idempotent); the rest are untouched. */
  failed: { groceryItemId: string; error: unknown }[];
}

/**
 * Transfers a reviewed set of grocery lines into the pantry. Partial failure is
 * honest: successful lines are reported in `transferred`, failed ones in
 * `failed`, and re-running with the failed ids (or the whole set) never
 * duplicates the ones that already went through.
 */
async function transferItemsToPantry(
  inputs: GroceryTransferItemInput[],
  timeZone = 'UTC',
): Promise<GroceryTransferResult> {
  await requireUserId();
  if (inputs.length === 0) return { transferred: [], failed: [] };

  const parsed = inputs.map((input) => groceryTransferItemSchema.parse(input));

  const results = await Promise.allSettled(
    parsed.map((input) => pantryService.createGroceryTransferItem(input, timeZone)),
  );

  const transferred: GroceryTransferResult['transferred'] = [];
  const failed: GroceryTransferResult['failed'] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      transferred.push({ groceryItemId: parsed[index].groceryItemId, pantryItem: result.value });
    } else {
      failed.push({ groceryItemId: parsed[index].groceryItemId, error: result.reason });
    }
  });

  return { transferred, failed };
}

export const groceryTransferService = {
  getTransferableGroceryItems,
  groceryLineToTransferInput,
  transferItemsToPantry,
};
