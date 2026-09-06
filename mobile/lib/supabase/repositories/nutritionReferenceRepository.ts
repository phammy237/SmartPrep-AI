import { IngredientConversionMeta } from '@/lib/nutrition/conversion';
import { NutrientBasisPer100g, toNutrientBasis } from '@/lib/nutrition/nutritionReference';
import { Database } from '@/types/database.types';
import { supabase } from '../client';

type CanonicalRow = Database['public']['Tables']['canonical_ingredient_nutrition']['Row'];
type OverrideRow = Database['public']['Tables']['user_ingredient_overrides']['Row'];
type UsdaFoodRow = Database['public']['Tables']['usda_foods']['Row'];

export interface CanonicalNutritionRef {
  canonicalIngredientId: string;
  per100g: NutrientBasisPer100g;
  status: 'estimated' | 'candidate' | 'verified';
  fdcId: number | null;
  verifiedAt: string | null;
}

export interface UserIngredientOverride {
  canonicalIngredientId: string;
  per100g: NutrientBasisPer100g | null;
  conversionMeta: IngredientConversionMeta;
  note: string | null;
}

export interface UsdaFood {
  fdcId: number;
  description: string;
  dataType: string | null;
  per100g: NutrientBasisPer100g;
  fetchedAt: string;
}

function toConversionMeta(gramsPerUnit: unknown, density: number | null): IngredientConversionMeta {
  const meta: IngredientConversionMeta = {};
  if (gramsPerUnit && typeof gramsPerUnit === 'object' && !Array.isArray(gramsPerUnit)) {
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(gramsPerUnit as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) clean[k] = v;
    }
    if (Object.keys(clean).length > 0) meta.gramsPerUnit = clean;
  }
  if (typeof density === 'number' && Number.isFinite(density) && density > 0) {
    meta.densityGPerMl = density;
  }
  return meta;
}

function mapCanonicalRow(row: CanonicalRow): CanonicalNutritionRef {
  return {
    canonicalIngredientId: row.canonical_ingredient_id,
    per100g: toNutrientBasis(row.nutrition_per_100g),
    status: row.status,
    fdcId: row.fdc_id,
    verifiedAt: row.verified_at,
  };
}

function mapOverrideRow(row: OverrideRow): UserIngredientOverride {
  return {
    canonicalIngredientId: row.canonical_ingredient_id,
    per100g: row.nutrition_per_100g == null ? null : toNutrientBasis(row.nutrition_per_100g),
    conversionMeta: toConversionMeta(row.grams_per_unit, row.density_g_per_ml),
    note: row.note,
  };
}

function mapUsdaFoodRow(row: UsdaFoodRow): UsdaFood {
  return {
    fdcId: row.fdc_id,
    description: row.description,
    dataType: row.data_type,
    per100g: toNutrientBasis(row.nutrition_per_100g),
    fetchedAt: row.fetched_at,
  };
}

/** Global per-100g references for the given catalog ingredient ids. */
export async function fetchCanonicalIngredientNutrition(ids: string[]): Promise<CanonicalNutritionRef[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('canonical_ingredient_nutrition')
    .select('*')
    .in('canonical_ingredient_id', ids);
  if (error) throw error;
  return data.map(mapCanonicalRow);
}

/** The signed-in user's ingredient overrides (RLS scopes this to their rows). */
export async function fetchUserIngredientOverrides(ids?: string[]): Promise<UserIngredientOverride[]> {
  let query = supabase.from('user_ingredient_overrides').select('*');
  if (ids && ids.length > 0) query = query.in('canonical_ingredient_id', ids);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(mapOverrideRow);
}

export interface UpsertUserOverrideInput {
  canonicalIngredientId: string;
  per100g?: NutrientBasisPer100g | null;
  gramsPerUnit?: Record<string, number> | null;
  densityGPerMl?: number | null;
  note?: string | null;
}

export async function upsertUserIngredientOverride(
  userId: string,
  input: UpsertUserOverrideInput,
): Promise<UserIngredientOverride> {
  const { data, error } = await supabase
    .from('user_ingredient_overrides')
    .upsert(
      {
        user_id: userId,
        canonical_ingredient_id: input.canonicalIngredientId,
        nutrition_per_100g: input.per100g ?? null,
        grams_per_unit: input.gramsPerUnit ?? null,
        density_g_per_ml: input.densityGPerMl ?? null,
        note: input.note ?? null,
      },
      { onConflict: 'user_id,canonical_ingredient_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return mapOverrideRow(data);
}

export async function deleteUserIngredientOverride(canonicalIngredientId: string): Promise<void> {
  const { error } = await supabase
    .from('user_ingredient_overrides')
    .delete()
    .eq('canonical_ingredient_id', canonicalIngredientId);
  if (error) throw error;
}

/** Read one cached USDA food by FDC id. Null when not cached yet. */
export async function fetchUsdaFoodFromCache(fdcId: number): Promise<UsdaFood | null> {
  const { data, error } = await supabase.from('usda_foods').select('*').eq('fdc_id', fdcId).maybeSingle();
  if (error) throw error;
  return data ? mapUsdaFoodRow(data) : null;
}

export interface UsdaSearchCandidate {
  fdcId: number;
  description: string;
  dataType: string | null;
  brandOwner: string | null;
  isExactDescriptionMatch: boolean;
}

export type UsdaSearchResult =
  | { status: 'ok'; candidates: UsdaSearchCandidate[] }
  | { status: 'no_match'; candidates: [] }
  | { status: 'rate_limited' | 'upstream_error' | 'malformed_upstream' | 'config_error' | 'unauthenticated' };

/** Search USDA via the Edge Function (the ONLY path - the API key never reaches the client). */
export async function invokeUsdaSearch(query: string): Promise<UsdaSearchResult> {
  const { data, error } = await supabase.functions.invoke('usda-lookup', {
    body: { action: 'search', query },
  });
  if (error) throw error;
  return data as UsdaSearchResult;
}

export type UsdaDetailsResult =
  | { status: 'ok'; food: { fdcId: number; description: string; dataType: string | null; nutritionPer100g: NutrientBasisPer100g } }
  | { status: 'unusable_food'; fdcId: number | null }
  | { status: 'rate_limited' | 'upstream_error' | 'malformed_upstream' | 'config_error' | 'unauthenticated' };

export async function invokeUsdaDetails(fdcId: number): Promise<UsdaDetailsResult> {
  const { data, error } = await supabase.functions.invoke('usda-lookup', {
    body: { action: 'details', fdcId },
  });
  if (error) throw error;
  return data as UsdaDetailsResult;
}
