import {
  UpdatePantryItemMetadataParams,
  adjustPantryQuantity,
  confirmPantryItem,
  createPantryItem,
  depletePantryItem,
  fetchPantryItem,
  fetchPantryItems,
  restorePantryItem,
  updatePantryItemMetadata,
} from '@/lib/supabase/repositories';
import { supabase } from '@/lib/supabase/client';
import { CreatePantryItemInput, EditPantryItemMetadataInput } from '@/lib/validation/pantrySchemas';
import { PantryItem } from '@/types';
import { estimateExpiration } from '@/utils/expiration';
import { generateId } from '@/utils/id';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Not signed in');
  }
  return data.user.id;
}

async function getPantry(timeZone: string): Promise<PantryItem[]> {
  const userId = await requireUserId();
  return fetchPantryItems(userId, timeZone);
}

async function getPantryItem(id: string, timeZone: string): Promise<PantryItem | null> {
  return fetchPantryItem(id, timeZone);
}

async function addManualPantryItem(input: CreatePantryItemInput, timeZone: string): Promise<PantryItem> {
  const ingredientId = generateId('ing-manual');
  const estimate = estimateExpiration({
    category: input.category,
    purchaseDate: input.purchaseDate,
    userProvidedDate: input.userProvidedDate,
  });

  return createPantryItem(
    {
      ingredientId,
      imageUri: ingredientPhotoUri(ingredientId, input.displayName),
      displayName: input.displayName,
      category: input.category,
      quantity: input.quantity,
      unit: input.unit,
      storageLocation: input.storageLocation,
      notes: input.notes,
      purchaseDate: input.purchaseDate,
      openedDate: input.openedDate,
      userProvidedDate: input.userProvidedDate,
      userProvidedDateType: input.userProvidedDateType,
      estimatedExpirationDate: estimate.estimatedExpirationDate,
      expirationConfidence: estimate.confidence,
      source: 'manual',
    },
    timeZone,
  );
}

/**
 * Recomputes the derived expiration estimate whenever a date or category
 * input actually changes, so estimated_expiration_date/expiration_confidence
 * never go stale relative to what's stored. A metadata edit that doesn't
 * touch any date field (renaming, changing storage location, etc.) skips
 * the extra read entirely.
 */
async function updateItemMetadata(id: string, patch: EditPantryItemMetadataInput, timeZone: string): Promise<PantryItem> {
  const touchesDates = patch.purchaseDate !== undefined || patch.userProvidedDate !== undefined || patch.category !== undefined;

  let estimatePatch: Pick<UpdatePantryItemMetadataParams, 'estimatedExpirationDate' | 'expirationConfidence'> = {};

  if (touchesDates) {
    const current = await fetchPantryItem(id, timeZone);
    if (current) {
      const estimate = estimateExpiration({
        category: patch.category ?? current.category,
        purchaseDate: patch.purchaseDate ?? current.purchaseDate,
        userProvidedDate: patch.userProvidedDate ?? current.userProvidedDate,
      });
      estimatePatch = {
        estimatedExpirationDate: estimate.estimatedExpirationDate ?? null,
        expirationConfidence: estimate.confidence,
      };
    }
  }

  return updatePantryItemMetadata(id, { ...patch, ...estimatePatch }, timeZone);
}

async function adjustQuantity(
  itemId: string,
  delta: number,
  eventType: 'adjusted' | 'consumed' | 'deducted_by_cooking',
  reason: string | undefined,
  timeZone: string,
): Promise<PantryItem> {
  return adjustPantryQuantity(itemId, delta, eventType, reason, timeZone);
}

/** Applies several deductions at once (e.g. after cooking, one per ingredient actually used), all tagged as 'deducted_by_cooking'. */
async function deductManyForCooking(
  items: { id: string; amountUsed: number }[],
  timeZone: string,
): Promise<PantryItem[]> {
  return Promise.all(items.map((item) => adjustPantryQuantity(item.id, -item.amountUsed, 'deducted_by_cooking', undefined, timeZone)));
}

async function depleteItem(
  itemId: string,
  eventType: 'depleted' | 'discarded' | 'corrected',
  reason: string | undefined,
  timeZone: string,
): Promise<PantryItem> {
  return depletePantryItem(itemId, eventType, reason, timeZone);
}

async function restoreItem(itemId: string, reason: string | undefined, timeZone: string): Promise<PantryItem> {
  return restorePantryItem(itemId, reason, timeZone);
}

async function confirmStillHave(itemId: string, timeZone: string): Promise<PantryItem> {
  return confirmPantryItem(itemId, timeZone);
}

export const pantryService = {
  getPantry,
  getPantryItem,
  addManualPantryItem,
  updateItemMetadata,
  adjustQuantity,
  deductManyForCooking,
  depleteItem,
  restoreItem,
  confirmStillHave,
};
