import { INGREDIENTS_BY_ID, resolveCanonicalIngredient } from '@/data';
import { NutritionResolution } from '@/lib/nutrition/resolveNutrition';
import {
  UpdatePantryItemMetadataParams,
  adjustPantryQuantity,
  confirmPantryItem,
  createPantryItem,
  depletePantryItem,
  fetchPantryItem,
  fetchPantryItems,
  restorePantryItem,
  transferGroceryItemToPantry,
  updatePantryItemMetadata,
} from '@/lib/supabase/repositories';
import { supabase } from '@/lib/supabase/client';
import { GroceryTransferItemInput } from '@/lib/validation/grocerySchemas';
import { CreatePantryItemInput, EditPantryItemMetadataInput } from '@/lib/validation/pantrySchemas';
import { IngredientCategory, PantryItem, QuantityUnit } from '@/types';
import { estimateExpiration } from '@/utils/expiration';
import { generateId } from '@/utils/id';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';
import { nutritionService } from './nutritionService';

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Not signed in');
  }
  return data.user.id;
}

interface ResolvedPantryIdentity {
  /** Canonical catalog id when one resolves exactly; otherwise the hint or a fresh synthetic id. */
  ingredientId: string;
  imageUri: string;
  /** True when the display name / hint resolved to a real catalog ingredient. */
  canonical: boolean;
}

/**
 * The single place a pantry item gets its identity, shared by manual add and
 * Scan confirm (and future OCR). Exact-only catalog resolution (id, then
 * normalized name / alias) - never fuzzy. When it resolves, downstream
 * quantity coverage and nutrition resolution work by canonical id; when it
 * doesn't, the item still persists with a synthetic id (nothing is blocked).
 */
function resolvePantryIdentity(opts: { hintId?: string; name: string; fallbackImageUri: string }): ResolvedPantryIdentity {
  const catalog =
    (opts.hintId ? INGREDIENTS_BY_ID[opts.hintId] : undefined) ??
    (opts.hintId ? resolveCanonicalIngredient(opts.hintId) : null) ??
    resolveCanonicalIngredient(opts.name);
  if (catalog) {
    return { ingredientId: catalog.id, imageUri: catalog.imageUri, canonical: true };
  }
  return { ingredientId: opts.hintId ?? generateId('ing-manual'), imageUri: opts.fallbackImageUri, canonical: false };
}

async function getPantry(timeZone: string): Promise<PantryItem[]> {
  const userId = await requireUserId();
  return fetchPantryItems(userId, timeZone);
}

async function getPantryItem(id: string, timeZone: string): Promise<PantryItem | null> {
  return fetchPantryItem(id, timeZone);
}

async function addManualPantryItem(input: CreatePantryItemInput, timeZone: string): Promise<PantryItem> {
  const identity = resolvePantryIdentity({
    name: input.displayName,
    fallbackImageUri: ingredientPhotoUri(generateId('ing-manual'), input.displayName),
  });
  const estimate = estimateExpiration({
    category: input.category,
    purchaseDate: input.purchaseDate,
    userProvidedDate: input.userProvidedDate,
  });

  return createPantryItem(
    {
      ingredientId: identity.ingredientId,
      imageUri: identity.imageUri,
      displayName: input.displayName,
      // The user's explicit category pick is respected; only identity + photo
      // come from the canonical match.
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

export interface ScanPantryItemInput {
  ingredientId: string;
  name: string;
  imageUri: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
  /**
   * The stable confirmed-detection id. Passed straight to create_pantry_item so
   * the write is idempotent for that detection - a retry after a lost response
   * returns the already-created item instead of a duplicate.
   */
  sourceScanDetectionId?: string;
}

/**
 * Creates a pantry item from a confirmed Scan detection through the SAME
 * identity path as a manual add. Scan/OCR must never grow its own pantry
 * insert or enrichment logic - it calls here.
 */
async function createScanItem(input: ScanPantryItemInput, timeZone: string): Promise<PantryItem> {
  const identity = resolvePantryIdentity({ hintId: input.ingredientId, name: input.name, fallbackImageUri: input.imageUri });
  return createPantryItem(
    {
      ingredientId: identity.ingredientId,
      imageUri: identity.imageUri,
      displayName: input.name,
      category: input.category,
      quantity: input.quantity,
      unit: input.unit,
      // A scan has no printed date to trust.
      expirationConfidence: 'unknown',
      source: 'scan',
      sourceScanDetectionId: input.sourceScanDetectionId,
    },
    timeZone,
  );
}

/**
 * Creates a pantry lot from a reviewed, ACQUIRED grocery line through the SAME
 * identity + expiration + creation path as a manual add - only the provenance
 * (`source = 'grocery'`, `source_grocery_item_id`) and the idempotency anchor
 * differ. The user's reviewed quantity/unit/name/dates are used verbatim; a
 * retry returns the already-created lot (DB-enforced), it does not re-apply
 * edits. Nutrition is NOT resolved here - a transferred item enriches at read
 * time exactly like any other pantry item.
 */
async function createGroceryTransferItem(input: GroceryTransferItemInput, timeZone: string): Promise<PantryItem> {
  const identity = resolvePantryIdentity({
    hintId: input.ingredientId,
    name: input.displayName,
    fallbackImageUri: input.imageUri || ingredientPhotoUri(generateId('ing-grocery'), input.displayName),
  });
  // Same rule as addManualPantryItem: a printed date wins ('high'); else a
  // purchase date drives the category heuristic ('medium'); with neither,
  // confidence stays 'unknown' and no date is fabricated.
  const estimate = estimateExpiration({
    category: input.category,
    purchaseDate: input.purchaseDate,
    userProvidedDate: input.userProvidedDate,
  });
  return transferGroceryItemToPantry(
    {
      groceryItemId: input.groceryItemId,
      ingredientId: identity.ingredientId,
      imageUri: identity.imageUri,
      displayName: input.displayName,
      category: input.category,
      quantity: input.quantity,
      unit: input.unit,
      storageLocation: input.storageLocation,
      notes: input.notes,
      purchaseDate: input.purchaseDate,
      userProvidedDate: input.userProvidedDate,
      userProvidedDateType: input.userProvidedDateType,
      estimatedExpirationDate: estimate.estimatedExpirationDate,
      expirationConfidence: estimate.confidence,
    },
    timeZone,
  );
}

/**
 * Read-time nutrition enrichment for a pantry item. Secondary to persistence:
 * returns an explicit `unresolved` resolution (not an error) when the item's
 * quantity/unit cannot be converted or no reference exists - never fabricates
 * a snapshot, never converts a candidate USDA match to verified. Genuine
 * infrastructure failures (auth, Supabase) DO propagate so the caller knows
 * enrichment failed rather than silently seeing "unresolved".
 */
async function resolveItemNutrition(item: Pick<PantryItem, 'ingredientId' | 'quantity' | 'unit'>): Promise<NutritionResolution> {
  return nutritionService.resolveQuantityNutrition({
    canonicalIngredientId: item.ingredientId,
    quantity: item.quantity,
    unit: item.unit,
  });
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
  createScanItem,
  createGroceryTransferItem,
  resolveItemNutrition,
  updateItemMetadata,
  adjustQuantity,
  depleteItem,
  restoreItem,
  confirmStillHave,
};
