import {
  EXPIRATION_CONFIDENCE_VALUES,
  INGREDIENT_CATEGORY_VALUES,
  IngredientCategory,
  PANTRY_ITEM_SOURCE_VALUES,
  PANTRY_ITEM_STATUS_VALUES,
  PantryItem,
  QUANTITY_CONFIDENCE_VALUES,
  QUANTITY_UNIT_VALUES,
  QuantityUnit,
  STORAGE_LOCATION_VALUES,
  StorageLocation,
  USER_PROVIDED_DATE_TYPE_VALUES,
  UserProvidedDateType,
} from '@/types';
import { Database } from '@/types/database.types';
import { deriveExpirationUrgency } from '@/utils/expiration';
import { FRESHNESS_OVERRIDE_VALUES } from '@/utils/freshness';
import { supabase } from '../client';
import { assertEnumValue, parseNullableEnumValue } from './enumMappers';

type PantryItemRow = Database['public']['Tables']['pantry_items']['Row'];

function mapRow(row: PantryItemRow, timeZone: string): PantryItem {
  const expirationConfidence = assertEnumValue(
    EXPIRATION_CONFIDENCE_VALUES,
    row.expiration_confidence,
    'pantry_items.expiration_confidence',
  );
  const urgency = deriveExpirationUrgency(
    row.estimated_expiration_date ?? undefined,
    expirationConfidence,
    timeZone,
  );
  const freshnessValues = FRESHNESS_OVERRIDE_VALUES[urgency.label];

  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    name: row.display_name,
    imageUri: row.image_uri,
    category: assertEnumValue(INGREDIENT_CATEGORY_VALUES, row.category, 'pantry_items.category'),
    quantity: row.quantity,
    unit: assertEnumValue(QUANTITY_UNIT_VALUES, row.unit, 'pantry_items.unit'),
    freshness: {
      score: freshnessValues.score,
      confidence: freshnessValues.confidence,
      label: urgency.label,
      estimatedUseBy: urgency.message,
    },
    addedAt: row.created_at,
    updatedAt: row.updated_at,
    source: assertEnumValue(PANTRY_ITEM_SOURCE_VALUES, row.scan_source, 'pantry_items.scan_source'),
    notes: row.notes ?? undefined,

    normalizedName: row.normalized_name,
    status: assertEnumValue(PANTRY_ITEM_STATUS_VALUES, row.status, 'pantry_items.status'),
    storageLocation: parseNullableEnumValue(
      STORAGE_LOCATION_VALUES,
      row.storage_location,
      'pantry_items.storage_location',
    ),
    quantityConfidence: assertEnumValue(
      QUANTITY_CONFIDENCE_VALUES,
      row.quantity_confidence,
      'pantry_items.quantity_confidence',
    ),
    purchaseDate: row.purchase_date ?? undefined,
    openedDate: row.opened_date ?? undefined,
    userProvidedDate: row.user_provided_date ?? undefined,
    userProvidedDateType: parseNullableEnumValue(
      USER_PROVIDED_DATE_TYPE_VALUES,
      row.user_provided_date_type,
      'pantry_items.user_provided_date_type',
    ),
    estimatedExpirationDate: row.estimated_expiration_date ?? undefined,
    expirationConfidence,
    lastConfirmedAt: row.last_confirmed_at ?? undefined,

    estimatedGrams: row.estimated_grams ?? undefined,
    fdcId: row.fdc_id ?? undefined,
    usdaMatchConfidence: row.usda_match_confidence ?? undefined,
    barcode: row.barcode ?? undefined,
    brand: row.brand ?? undefined,
    sourceReceiptCandidateId: row.source_receipt_candidate_id ?? undefined,
    sourceReceiptId: row.source_receipt_id ?? undefined,
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
  /** Barcode intake only: the normalized UPC/EAN, stored as provenance (NOT an idempotency key). */
  barcode?: string;
  /** Barcode intake only: brand string from the product lookup. */
  brand?: string;
  /** Only when a defensible USDA FoodData Central match was made (not in barcode v1). */
  fdcId?: string;
  /** Receipt intake only: the stable per-session candidate id. Makes create_pantry_item idempotent per receipt line. */
  sourceReceiptCandidateId?: string;
  /** Receipt intake only: the receipt_scans.id, for provenance/history. */
  sourceReceiptId?: string;
}

export async function createPantryItem(params: CreatePantryItemParams, timeZone: string): Promise<PantryItem> {
  // Every optional p_* below is a `DEFAULT NULL` SQL param (migrations 0002 /
  // 0008); a grocery source is never set on this path (grocery transfers use
  // transfer_grocery_item_to_pantry). Omitting is identical to sending SQL NULL.
  const { data, error } = await supabase.rpc('create_pantry_item', {
    p_ingredient_id: params.ingredientId,
    p_display_name: params.displayName,
    p_image_uri: params.imageUri,
    p_category: params.category,
    p_quantity: params.quantity,
    p_unit: params.unit,
    p_expiration_confidence: params.expirationConfidence ?? 'unknown',
    p_source: params.source ?? 'manual',
    ...(params.storageLocation != null ? { p_storage_location: params.storageLocation } : {}),
    ...(params.notes != null ? { p_notes: params.notes } : {}),
    ...(params.purchaseDate != null ? { p_purchase_date: params.purchaseDate } : {}),
    ...(params.openedDate != null ? { p_opened_date: params.openedDate } : {}),
    ...(params.userProvidedDate != null ? { p_user_provided_date: params.userProvidedDate } : {}),
    ...(params.userProvidedDateType != null ? { p_user_provided_date_type: params.userProvidedDateType } : {}),
    ...(params.estimatedExpirationDate != null
      ? { p_estimated_expiration_date: params.estimatedExpirationDate }
      : {}),
    ...(params.sourceScanDetectionId != null ? { p_source_scan_detection_id: params.sourceScanDetectionId } : {}),
    ...(params.barcode != null ? { p_barcode: params.barcode } : {}),
    ...(params.brand != null ? { p_brand: params.brand } : {}),
    ...(params.fdcId != null ? { p_fdc_id: params.fdcId } : {}),
    ...(params.sourceReceiptCandidateId != null
      ? { p_source_receipt_candidate_id: params.sourceReceiptCandidateId }
      : {}),
    ...(params.sourceReceiptId != null ? { p_source_receipt_id: params.sourceReceiptId } : {}),
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
  // The optional p_* below are all `DEFAULT NULL` SQL params (migration 0009) -
  // omitting is identical to sending SQL NULL.
  const { data, error } = await supabase.rpc('transfer_grocery_item_to_pantry', {
    p_grocery_item_id: params.groceryItemId,
    p_ingredient_id: params.ingredientId,
    p_display_name: params.displayName,
    p_image_uri: params.imageUri,
    p_category: params.category,
    p_quantity: params.quantity,
    p_unit: params.unit,
    p_expiration_confidence: params.expirationConfidence ?? 'unknown',
    ...(params.storageLocation != null ? { p_storage_location: params.storageLocation } : {}),
    ...(params.notes != null ? { p_notes: params.notes } : {}),
    ...(params.purchaseDate != null ? { p_purchase_date: params.purchaseDate } : {}),
    ...(params.userProvidedDate != null ? { p_user_provided_date: params.userProvidedDate } : {}),
    ...(params.userProvidedDateType != null ? { p_user_provided_date_type: params.userProvidedDateType } : {}),
    ...(params.estimatedExpirationDate != null
      ? { p_estimated_expiration_date: params.estimatedExpirationDate }
      : {}),
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
  // p_reason is a `DEFAULT NULL` SQL param (migration 0002).
  const { data, error } = await supabase.rpc('adjust_pantry_quantity', {
    p_item_id: itemId,
    p_delta: delta,
    p_event_type: eventType,
    ...(reason != null ? { p_reason: reason } : {}),
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
  // p_reason is a `DEFAULT NULL` SQL param (migration 0002).
  const { data, error } = await supabase.rpc('deplete_pantry_item', {
    p_item_id: itemId,
    p_event_type: eventType,
    ...(reason != null ? { p_reason: reason } : {}),
  });
  if (error) throw error;
  return mapRow(data, timeZone);
}

export async function restorePantryItem(itemId: string, reason: string | undefined, timeZone: string): Promise<PantryItem> {
  // p_reason is a `DEFAULT NULL` SQL param (migration 0002).
  const { data, error } = await supabase.rpc('restore_pantry_item', {
    p_item_id: itemId,
    ...(reason != null ? { p_reason: reason } : {}),
  });
  if (error) throw error;
  return mapRow(data, timeZone);
}

export async function confirmPantryItem(itemId: string, timeZone: string): Promise<PantryItem> {
  const { data, error } = await supabase.rpc('confirm_pantry_item', { p_item_id: itemId });
  if (error) throw error;
  return mapRow(data, timeZone);
}
