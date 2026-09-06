import {
  GroceryItemSource,
  GroceryList,
  GroceryListItem,
  GroceryQuantityBasis,
  IngredientCategory,
  QuantityUnit,
} from '@/types';
import { Database, Json } from '@/types/database.types';
import { supabase } from '../client';

type GroceryListRow = Database['public']['Tables']['grocery_lists']['Row'];
type GroceryListItemRow = Database['public']['Tables']['grocery_list_items']['Row'];

/** The list header only - items are fetched separately. */
export interface GroceryListHeader {
  id: string;
  createdAt: string;
  status: GroceryListRow['status'];
}

function mapListRow(row: GroceryListRow): GroceryListHeader {
  return { id: row.id, createdAt: row.created_at, status: row.status };
}

function mapItemRow(row: GroceryListItemRow): GroceryListItem {
  return {
    id: row.id,
    ingredientId: row.catalog_ingredient_id ?? undefined,
    name: row.display_name,
    imageUri: row.image_uri,
    // Column is nullable; the UI groups strictly by the six categories, so an
    // unset category renders under "Other".
    category: (row.category ?? 'other') as IngredientCategory,
    quantity: row.quantity,
    unit: row.unit as QuantityUnit,
    isChecked: row.is_checked,
    source: row.source,
    quantityBasis: row.quantity_basis,
    sourceRecipeIds: row.source_recipe_version_ids.length > 0 ? row.source_recipe_version_ids : undefined,
    isManuallyAdded: row.source === 'manual' ? true : undefined,
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
