import { normalizeIngredientName } from '@/data';
import {
  GROCERY_ITEM_SOURCE_VALUES,
  GROCERY_LIST_STATUS_VALUES,
  GROCERY_QUANTITY_BASIS_VALUES,
  GroceryItemSource,
  GroceryList,
  GroceryListItem,
  GroceryListStatus,
  GroceryQuantityBasis,
  GroceryTripDetail,
  GroceryTripSummary,
  INGREDIENT_CATEGORY_VALUES,
  IngredientCategory,
  PANTRY_TRANSFER_STATUS_VALUES,
  QUANTITY_UNIT_VALUES,
  QuantityUnit,
} from '@/types';
import { Database, Json } from '@/types/database.types';
import { supabase } from '../client';
import { assertEnumValue, parseNullableEnumValue } from './enumMappers';

type GroceryListRow = Database['public']['Tables']['grocery_lists']['Row'];
type GroceryListItemRow = Database['public']['Tables']['grocery_list_items']['Row'];

/** The list header only - items are fetched separately. */
export interface GroceryListHeader {
  id: string;
  createdAt: string;
  status: GroceryListStatus;
}

function parseGroceryListStatus(value: string): GroceryListStatus {
  return assertEnumValue(GROCERY_LIST_STATUS_VALUES, value, 'grocery_lists.status');
}

function mapListRow(row: GroceryListRow): GroceryListHeader {
  return { id: row.id, createdAt: row.created_at, status: parseGroceryListStatus(row.status) };
}

const TRIP_PREVIEW_LIMIT = 4;

/** Derived counts + preview for a completed trip. `items` may be a partial projection. */
function mapTripSummary(
  row: Pick<GroceryListRow, 'id' | 'status' | 'created_at' | 'completed_at'>,
  items: Pick<GroceryListItemRow, 'display_name' | 'is_checked' | 'pantry_transfer_status'>[],
): GroceryTripSummary {
  return {
    id: row.id,
    status: parseGroceryListStatus(row.status),
    createdAt: row.created_at,
    // Completed trips always have completed_at (DB check). Fall back defensively.
    completedAt: row.completed_at ?? row.created_at,
    itemCount: items.length,
    acquiredCount: items.filter((i) => i.is_checked).length,
    transferredCount: items.filter((i) => i.pantry_transfer_status === 'transferred').length,
    itemPreview: items.slice(0, TRIP_PREVIEW_LIMIT).map((i) => i.display_name),
  };
}

function mapItemRow(row: GroceryListItemRow): GroceryListItem {
  const meta = (row.source_metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    ingredientId: row.catalog_ingredient_id ?? undefined,
    name: row.display_name,
    imageUri: row.image_uri,
    // Column is nullable; the UI groups strictly by the six categories, so an
    // unset category renders under "Other".
    category:
      parseNullableEnumValue(INGREDIENT_CATEGORY_VALUES, row.category, 'grocery_list_items.category') ?? 'other',
    quantity: row.quantity,
    unit: assertEnumValue(QUANTITY_UNIT_VALUES, row.unit, 'grocery_list_items.unit'),
    isChecked: row.is_checked,
    source: assertEnumValue(GROCERY_ITEM_SOURCE_VALUES, row.source, 'grocery_list_items.source'),
    quantityBasis: assertEnumValue(
      GROCERY_QUANTITY_BASIS_VALUES,
      row.quantity_basis,
      'grocery_list_items.quantity_basis',
    ),
    sourceRecipeIds: row.source_recipe_version_ids.length > 0 ? row.source_recipe_version_ids : undefined,
    isManuallyAdded: row.source === 'manual' ? true : undefined,
    // A generated line whose pantry comparison couldn't be resolved carries the
    // conservative full requirement - flag it so Grocery can ask for a check.
    needsQuantityCheck: meta.coverage === 'unresolved' ? true : undefined,
    pantryTransferStatus: assertEnumValue(
      PANTRY_TRANSFER_STATUS_VALUES,
      row.pantry_transfer_status,
      'grocery_list_items.pantry_transfer_status',
    ),
    pantryItemId: row.pantry_item_id ?? undefined,
    estimatedPrice: row.estimated_price ?? undefined,
    swapSuggestion: row.swap_suggestion ?? undefined,
    wasteNote: row.waste_note ?? undefined,
  };
}

/** Resolves (creating on first use) the caller's single active grocery list. */
export async function fetchOrCreateActiveGroceryList(): Promise<GroceryListHeader> {
  const { data, error } = await supabase.rpc('get_or_create_active_grocery_list');
  if (error) throw error;
  if (!data) throw new Error('Could not resolve an active grocery list');
  return mapListRow(data as GroceryListRow);
}

export async function fetchGroceryListItems(listId: string): Promise<GroceryListItem[]> {
  const { data, error } = await supabase
    .from('grocery_list_items')
    .select('*')
    .eq('grocery_list_id', listId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return data.map(mapItemRow);
}

/** One round-trip fetch of the list header plus its items. */
export async function fetchActiveGroceryList(): Promise<GroceryList> {
  const header = await fetchOrCreateActiveGroceryList();
  const items = await fetchGroceryListItems(header.id);
  return { id: header.id, createdAt: header.createdAt, items };
}

export interface InsertGroceryItemParams {
  catalogIngredientId?: string | null;
  displayName: string;
  imageUri?: string;
  category?: IngredientCategory | null;
  quantity: number;
  unit: QuantityUnit;
  source?: GroceryItemSource;
  sourceRecipeVersionIds?: string[];
  quantityBasis?: GroceryQuantityBasis;
  /** e.g. { coverage: 'unresolved', reason: 'missing_density' } - provenance for a generated line. */
  sourceMetadata?: Record<string, unknown>;
  sortOrder?: number;
}

export async function insertGroceryListItems(
  userId: string,
  listId: string,
  items: InsertGroceryItemParams[],
): Promise<GroceryListItem[]> {
  if (items.length === 0) return [];
  const rows: Database['public']['Tables']['grocery_list_items']['Insert'][] = items.map((it) => ({
    grocery_list_id: listId,
    user_id: userId,
    catalog_ingredient_id: it.catalogIngredientId ?? null,
    display_name: it.displayName,
    // normalized_name is NOT NULL with no default, so the generated Insert type
    // requires it. The DB's grocery_list_items_sync_normalized_name BEFORE
    // INSERT trigger (migration 0005) authoritatively re-derives it from
    // display_name on every write; we send the same value via the shared
    // normalizer so the row satisfies the type contract and stays correct even
    // if that trigger were ever removed. (SQL: lower(regexp_replace(trim(x),
    // '\s+', ' ', 'g')) === normalizeIngredientName.)
    normalized_name: normalizeIngredientName(it.displayName),
    image_uri: it.imageUri ?? '',
    category: it.category ?? null,
    quantity: it.quantity,
    unit: it.unit,
    source: it.source ?? 'manual',
    source_recipe_version_ids: it.sourceRecipeVersionIds ?? [],
    quantity_basis: it.quantityBasis ?? 'as_entered',
    ...(it.sourceMetadata !== undefined ? { source_metadata: it.sourceMetadata as Json } : {}),
    ...(it.sortOrder !== undefined ? { sort_order: it.sortOrder } : {}),
  }));
  const { data, error } = await supabase.from('grocery_list_items').insert(rows).select();
  if (error) throw error;
  return data.map(mapItemRow);
}

export async function insertGroceryListItem(
  userId: string,
  listId: string,
  params: InsertGroceryItemParams,
): Promise<GroceryListItem> {
  const [item] = await insertGroceryListItems(userId, listId, [params]);
  return item;
}

export interface UpdateGroceryItemParams {
  displayName?: string;
  category?: IngredientCategory;
  quantity?: number;
  unit?: QuantityUnit;
  sourceRecipeVersionIds?: string[];
  quantityBasis?: GroceryQuantityBasis;
}

/**
 * Plain single-table update. Deliberately cannot touch is_checked (that goes
 * through toggle_grocery_item so checked_at stays in sync) or user_id /
 * grocery_list_id.
 */
export async function updateGroceryListItem(id: string, patch: UpdateGroceryItemParams): Promise<GroceryListItem> {
  const { data, error } = await supabase
    .from('grocery_list_items')
    .update({
      ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.sourceRecipeVersionIds !== undefined
        ? { source_recipe_version_ids: patch.sourceRecipeVersionIds }
        : {}),
      ...(patch.quantityBasis !== undefined ? { quantity_basis: patch.quantityBasis } : {}),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapItemRow(data);
}

export async function toggleGroceryListItemChecked(id: string): Promise<GroceryListItem> {
  const { data, error } = await supabase.rpc('toggle_grocery_item', { p_item_id: id });
  if (error) throw error;
  return mapItemRow(data as GroceryListItemRow);
}

export async function deleteGroceryListItem(id: string): Promise<void> {
  const { error } = await supabase.from('grocery_list_items').delete().eq('id', id);
  if (error) throw error;
}

/** Removes every checked item from a list in one statement. */
export async function deleteCheckedGroceryListItems(listId: string): Promise<void> {
  const { error } = await supabase
    .from('grocery_list_items')
    .delete()
    .eq('grocery_list_id', listId)
    .eq('is_checked', true);
  if (error) throw error;
}

/**
 * Removes the still-UNCHECKED, meal-plan-generated lines for one plan
 * generation key - the reconciliation step that makes "Add Week to Grocery
 * List" idempotent. Never touches manual lines, checked lines, recipe-detail
 * lines, or another week's plan lines. Returns how many rows were removed.
 *
 * `listId` is always the caller's ACTIVE list (its only caller resolves it via
 * get_or_create_active_grocery_list); the require-active-parent trigger (0010)
 * additionally rejects any delete against a completed trip's rows.
 */
export async function deletePlanGeneratedGroceryItems(
  listId: string,
  planGenerationKey: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('grocery_list_items')
    .delete()
    .eq('grocery_list_id', listId)
    .eq('source', 'meal_plan')
    .eq('is_checked', false)
    .filter('source_metadata->>planGenerationKey', 'eq', planGenerationKey)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// --- Shopping-trip lifecycle (Phase 8) -------------------------------------

export interface CompleteGroceryListResult {
  completed: { id: string; status: GroceryListStatus; createdAt: string; completedAt: string | null };
  active: { id: string; createdAt: string };
}

/**
 * Atomically finishes the given active list (-> completed) and returns it plus
 * the fresh replacement active list, via the security-definer
 * `complete_grocery_list` RPC. Idempotent: a repeat call for an
 * already-completed list returns that list + the current active one, unchanged.
 */
export async function completeGroceryList(listId: string): Promise<CompleteGroceryListResult> {
  const { data, error } = await supabase.rpc('complete_grocery_list', { p_list_id: listId });
  if (error) throw error;
  const result = data as unknown as { completedList: GroceryListRow; activeList: GroceryListRow };
  return {
    completed: {
      id: result.completedList.id,
      status: parseGroceryListStatus(result.completedList.status),
      createdAt: result.completedList.created_at,
      completedAt: result.completedList.completed_at,
    },
    active: { id: result.activeList.id, createdAt: result.activeList.created_at },
  };
}

type TripJoinRow = GroceryListRow & {
  grocery_list_items: Pick<GroceryListItemRow, 'display_name' | 'is_checked' | 'pantry_transfer_status'>[];
};

/** Completed shopping trips for the History list, newest first. RLS scopes to the owner. */
export async function fetchGroceryHistory(): Promise<GroceryTripSummary[]> {
  const { data, error } = await supabase
    .from('grocery_lists')
    .select('*, grocery_list_items(display_name, is_checked, pantry_transfer_status)')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as TripJoinRow[]).map((row) => mapTripSummary(row, row.grocery_list_items));
}

type TripDetailJoinRow = GroceryListRow & { grocery_list_items: GroceryListItemRow[] };

/**
 * One completed / archived trip with its full (read-only) item list. Returns
 * null for an unknown id, one not owned by the caller, or the ACTIVE list
 * (which is not a "trip").
 */
export async function fetchGroceryTrip(tripId: string): Promise<GroceryTripDetail | null> {
  const { data, error } = await supabase
    .from('grocery_lists')
    .select('*, grocery_list_items(*)')
    .eq('id', tripId)
    .neq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as TripDetailJoinRow;
  const items = [...row.grocery_list_items]
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map(mapItemRow);
  return {
    ...mapTripSummary(row, row.grocery_list_items),
    items,
  };
}
