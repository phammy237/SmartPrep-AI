import { IngredientCategory, PantryItem, QuantityUnit, StorageLocation, UserProvidedDateType } from '@/types';
import { Database } from '@/types/database.types';
import { deriveExpirationUrgency } from '@/utils/expiration';
import { FRESHNESS_OVERRIDE_VALUES } from '@/utils/freshness';
import { supabase } from '../client';

type PantryItemRow = Database['public']['Tables']['pantry_items']['Row'];

function mapRow(row: PantryItemRow, timeZone: string): PantryItem {
  const urgency = deriveExpirationUrgency(
    row.estimated_expiration_date ?? undefined,
    row.expiration_confidence,
    timeZone,
  );
  const freshnessValues = FRESHNESS_OVERRIDE_VALUES[urgency.label];

  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    name: row.display_name,
    imageUri: row.image_uri,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit,
    freshness: {
      score: freshnessValues.score,
      confidence: freshnessValues.confidence,
      label: urgency.label,
      estimatedUseBy: urgency.message,
    },
    addedAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.scan_source,
    notes: row.notes ?? undefined,

    normalizedName: row.normalized_name,
    status: row.status,
    storageLocation: row.storage_location ?? undefined,
    quantityConfidence: row.quantity_confidence,
    purchaseDate: row.purchase_date ?? undefined,
    openedDate: row.opened_date ?? undefined,
    userProvidedDate: row.user_provided_date ?? undefined,
    userProvidedDateType: row.user_provided_date_type ?? undefined,
    estimatedExpirationDate: row.estimated_expiration_date ?? undefined,
    expirationConfidence: row.expiration_confidence,
    lastConfirmedAt: row.last_confirmed_at ?? undefined,

    estimatedGrams: row.estimated_grams ?? undefined,
    fdcId: row.fdc_id ?? undefined,
    usdaMatchConfidence: row.usda_match_confidence ?? undefined,
    barcode: row.barcode ?? undefined,
    brand: row.brand ?? undefined,
  };
}

export async function fetchPantryItems(userId: string, timeZone: string): Promise<PantryItem[]> {
  const { data, error } = await supabase.from('pantry_items').select('*').eq('user_id', userId);
  if (error) throw error;
  return data.map((row) => mapRow(row, timeZone));
}

export async function fetchPantryItem(id: string, timeZone: string): Promise<PantryItem | null> {
  const { data, error } = await supabase.from('pantry_items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data, timeZone) : null;
}

export interface CreatePantryItemParams {
  ingredientId: string;
  imageUri: string;
  displayName: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
  storageLocation?: StorageLocation;
  notes?: string;
  purchaseDate?: string;
  openedDate?: string;
  userProvidedDate?: string;
  userProvidedDateType?: UserProvidedDateType;
  estimatedExpirationDate?: string;
  expirationConfidence?: PantryItem['expirationConfidence'];
  source?: PantryItem['source'];
  /**
   * Scan confirmation only: the stable ScanDetection id. Makes create_pantry_item
   * idempotent for that detection (a repeat call returns the existing row rather
   * than inserting a duplicate). Always null for manual / grocery adds.
   */
  sourceScanDetectionId?: string;
}

export async function createPantryItem(params: CreatePantryItemParams, timeZone: string): Promise<PantryItem> {
  const { data, error } = await supabase.rpc('create_pantry_item', {
    p_ingredient_id: params.ingredientId,
    p_display_name: params.displayName,
    p_image_uri: params.imageUri,
    p_category: params.category,
    p_quantity: params.quantity,
    p_unit: params.unit,
    p_storage_location: params.storageLocation ?? null,
    p_notes: params.notes ?? null,
    p_purchase_date: params.purchaseDate ?? null,
    p_opened_date: params.openedDate ?? null,
    p_user_provided_date: params.userProvidedDate ?? null,
    p_user_provided_date_type: params.userProvidedDateType ?? null,
    p_estimated_expiration_date: params.estimatedExpirationDate ?? null,
    p_expiration_confidence: params.expirationConfidence ?? 'unknown',
    p_source: params.source ?? 'manual',
    p_source_scan_detection_id: params.sourceScanDetectionId ?? null,
    // Grocery transfers go through transfer_grocery_item_to_pantry, which sets
    // this itself; a direct manual/scan create never carries a grocery source.
    p_source_grocery_item_id: null,
  });
  if (error) throw error;
  return mapRow(data, timeZone);
}

export interface TransferGroceryItemParams {
  /** The grocery line being transferred - the idempotency anchor. */
  groceryItemId: string;
  ingredientId: string;
  imageUri: string;
  displayName: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
  storageLocation?: StorageLocation;
  notes?: string;
  purchaseDate?: string;
  userProvidedDate?: string;
  userProvidedDateType?: UserProvidedDateType;
  estimatedExpirationDate?: string;
  expirationConfidence?: PantryItem['expirationConfidence'];
}

/**
 * Atomic, idempotent transfer of one acquired grocery line into a pantry lot,
 * via the security-definer transfer_grocery_item_to_pantry RPC (which verifies
 * ownership + acquisition, creates the lot through the shared create_pantry_item
 * invariant, links it back, and marks the line transferred). A retry returns
 * the same pantry item - never a duplicate row or ledger event.
 */
export async function transferGroceryItemToPantry(
  params: TransferGroceryItemParams,
  timeZone: string,
): Promise<PantryItem> {
  const { data, error } = await supabase.rpc('transfer_grocery_item_to_pantry', {
    p_grocery_item_id: params.groceryItemId,
    p_ingredient_id: params.ingredientId,
    p_display_name: params.displayName,
    p_image_uri: params.imageUri,
    p_category: params.category,
    p_quantity: params.quantity,
    p_unit: params.unit,
    p_storage_location: params.storageLocation ?? null,
    p_notes: params.notes ?? null,
    p_purchase_date: params.purchaseDate ?? null,
    p_user_provided_date: params.userProvidedDate ?? null,
    p_user_provided_date_type: params.userProvidedDateType ?? null,
    p_estimated_expiration_date: params.estimatedExpirationDate ?? null,
    p_expiration_confidence: params.expirationConfidence ?? 'unknown',
  });
  if (error) throw error;
  return mapRow(data, timeZone);
}

export interface UpdatePantryItemMetadataParams {
  displayName?: string;
  category?: IngredientCategory;
  unit?: QuantityUnit;
  notes?: string | null;
  storageLocation?: StorageLocation | null;
  purchaseDate?: string | null;
  openedDate?: string | null;
  userProvidedDate?: string | null;
  userProvidedDateType?: UserProvidedDateType | null;
  estimatedExpirationDate?: string | null;
  expirationConfidence?: PantryItem['expirationConfidence'];
}

/**
 * Plain table UPDATE, not an RPC - the client only has column-level grants
 * for metadata (see migration 0002), so this can never touch quantity or
 * status regardless of what's passed here; the database enforces that, not
 * this function.
 */
export async function updatePantryItemMetadata(
  id: string,
  patch: UpdatePantryItemMetadataParams,
  timeZone: string,
): Promise<PantryItem> {
  const { data, error } = await supabase
    .from('pantry_items')
    .update({
      ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.storageLocation !== undefined ? { storage_location: patch.storageLocation } : {}),
      ...(patch.purchaseDate !== undefined ? { purchase_date: patch.purchaseDate } : {}),
      ...(patch.openedDate !== undefined ? { opened_date: patch.openedDate } : {}),
      ...(patch.userProvidedDate !== undefined ? { user_provided_date: patch.userProvidedDate } : {}),
      ...(patch.userProvidedDateType !== undefined ? { user_provided_date_type: patch.userProvidedDateType } : {}),
      ...(patch.estimatedExpirationDate !== undefined
        ? { estimated_expiration_date: patch.estimatedExpirationDate }
        : {}),
      ...(patch.expirationConfidence !== undefined ? { expiration_confidence: patch.expirationConfidence } : {}),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapRow(data, timeZone);
}

export async function adjustPantryQuantity(
  itemId: string,
  delta: number,
  eventType: 'adjusted' | 'consumed' | 'deducted_by_cooking',
  reason: string | undefined,
  timeZone: string,
): Promise<PantryItem> {
  const { data, error } = await supabase.rpc('adjust_pantry_quantity', {
    p_item_id: itemId,
    p_delta: delta,
    p_event_type: eventType,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return mapRow(data, timeZone);
}

export async function depletePantryItem(
  itemId: string,
  eventType: 'depleted' | 'discarded' | 'corrected',
  reason: string | undefined,
  timeZone: string,
): Promise<PantryItem> {
  const { data, error } = await supabase.rpc('deplete_pantry_item', {
    p_item_id: itemId,
    p_event_type: eventType,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return mapRow(data, timeZone);
}

export async function restorePantryItem(itemId: string, reason: string | undefined, timeZone: string): Promise<PantryItem> {
  const { data, error } = await supabase.rpc('restore_pantry_item', {
    p_item_id: itemId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return mapRow(data, timeZone);
}

export async function confirmPantryItem(itemId: string, timeZone: string): Promise<PantryItem> {
  const { data, error } = await supabase.rpc('confirm_pantry_item', { p_item_id: itemId });
  if (error) throw error;
  return mapRow(data, timeZone);
}
