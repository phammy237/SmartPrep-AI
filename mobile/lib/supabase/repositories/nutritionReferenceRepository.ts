import { IngredientConversionMeta } from '@/lib/nutrition/conversion';
import { NutrientBasisPer100g, toNutrientBasis } from '@/lib/nutrition/nutritionReference';
import { Database } from '@/types/database.types';
import { supabase } from '../client';

type CanonicalRow = Database['public']['Tables']['canonical_ingredient_nutrition']['Row'];
type OverrideRow = Database['public']['Tables']['user_ingredient_overrides']['Row'];
type UsdaFoodRow = Database['public']['Tables']['usda_foods']['Row'];
type BarcodeProductNutritionRow = Database['public']['Tables']['barcode_product_nutrition']['Row'];

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

// ===========================================================================
// Barcode product nutrition - global per-barcode cache (migration 0013)
// ===========================================================================

export interface BarcodeProductNutritionRef {
  barcode: string;
  provider: 'open_food_facts' | 'usda';
  sourceProductId: string;
  per100g: NutrientBasisPer100g;
  status: 'candidate' | 'verified';
  fdcId: number | null;
  description: string | null;
  brandOwner: string | null;
  sourceFetchedAt: string;
  updatedAt: string;
}

function mapBarcodeProductRow(row: BarcodeProductNutritionRow): BarcodeProductNutritionRef {
  return {
    barcode: row.barcode,
    provider: row.provider,
    sourceProductId: row.source_product_id,
    per100g: toNutrientBasis(row.nutrition_per_100g),
    status: row.status,
    fdcId: row.fdc_id,
    description: row.description,
    brandOwner: row.brand_owner,
    sourceFetchedAt: row.source_fetched_at,
    updatedAt: row.updated_at,
  };
}

/** The cached product nutrition for a normalized barcode, or null. Local read - never hits a provider. */
export async function fetchBarcodeProductNutrition(barcode: string): Promise<BarcodeProductNutritionRef | null> {
  const { data, error } = await supabase
    .from('barcode_product_nutrition')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBarcodeProductRow(data) : null;
}

export interface UpsertBarcodeCandidateInput {
  barcode: string;
  sourceProductId: string;
  per100g: NutrientBasisPer100g;
  description?: string | null;
  brandOwner?: string | null;
}

/**
 * Persist Open Food Facts nutrition as a `candidate` product record. Goes
 * through the security-definer RPC, which can ONLY ever write
 * status='candidate' / provider='open_food_facts' / fdc_id=null and never
 * downgrades an existing verified row.
 */
export async function upsertBarcodeProductCandidate(
  input: UpsertBarcodeCandidateInput,
): Promise<BarcodeProductNutritionRef> {
  const { data, error } = await supabase.rpc('upsert_barcode_product_candidate', {
    p_barcode: input.barcode,
    p_source_product_id: input.sourceProductId,
    p_nutrition_per_100g: input.per100g as unknown as Record<string, number>,
    p_description: input.description ?? null,
    p_brand_owner: input.brandOwner ?? null,
  });
  if (error) throw error;
  return mapBarcodeProductRow(data);
}

export type UsdaBrandedMatchResult =
  | {
      status: 'verified_match';
      barcode: string;
      fdcId: number;
      description: string;
      brandOwner: string | null;
      nutritionPer100g: NutrientBasisPer100g;
    }
  | { status: 'no_exact_match'; barcode: string }
  | { status: 'rate_limited' | 'upstream_error' | 'malformed_upstream' | 'config_error' | 'unauthenticated' };

/**
 * Ask the usda-lookup Edge Function for an EXACT branded-food GTIN match. The
 * Edge Function does the GTIN comparison server-side and, on a match, writes the
 * verified row itself (service role) - the client never asserts a match.
 */
export async function invokeUsdaBrandedByBarcode(barcode: string): Promise<UsdaBrandedMatchResult> {
  const { data, error } = await supabase.functions.invoke('usda-lookup', {
    body: { action: 'branded_by_barcode', barcode },
  });
  if (error) throw error;
  return data as UsdaBrandedMatchResult;
}
