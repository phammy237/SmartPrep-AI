import { INGREDIENTS, INGREDIENTS_BY_ID } from '@/data';
import { IngredientConversionMeta } from '@/lib/nutrition/conversion';
import { NutritionReference, basisHasAnyNutrient, toNutrientBasis } from '@/lib/nutrition/nutritionReference';
import {
  RecipeIngredientForNutrition,
  RecipeNutritionCoverage,
  computeRecipeNutritionCoverage as computeRecipeNutritionCoveragePure,
} from '@/lib/nutrition/recipeNutrition';
import { NutritionResolution, resolveIngredientNutrition } from '@/lib/nutrition/resolveNutrition';
import {
  BarcodeProductNutritionRef,
  CanonicalNutritionRef,
  UpsertUserOverrideInput,
  UsdaDetailsResult,
  UsdaSearchResult,
  UserIngredientOverride,
  deleteUserIngredientOverride,
  fetchBarcodeProductNutrition,
  fetchCanonicalIngredientNutrition,
  fetchUsdaFoodFromCache,
  fetchUserIngredientOverrides,
  invokeUsdaBrandedByBarcode,
  invokeUsdaDetails,
  invokeUsdaSearch,
  upsertBarcodeProductCandidate,
  upsertUserIngredientOverride,
} from '@/lib/supabase/repositories';
import { NutrientBasisPer100g } from '@/lib/nutrition/nutritionReference';
import { requireUserId } from './requireUserId';

export interface ResolvedIngredientReference {
  reference: NutritionReference;
  conversionMeta: IngredientConversionMeta;
}

function catalogReference(canonicalId: string): { reference: NutritionReference; conversionMeta: IngredientConversionMeta } {
  const catalog = INGREDIENTS_BY_ID[canonicalId];
  const conversionMeta: IngredientConversionMeta = {};
  if (catalog?.gramsPerUnit) conversionMeta.gramsPerUnit = { ...(catalog.gramsPerUnit as Record<string, number>) };
  if (typeof catalog?.densityGPerMl === 'number') conversionMeta.densityGPerMl = catalog.densityGPerMl;

  const per100g = (catalog?.nutritionPer100g ?? null) as NutrientBasisPer100g | null;
  const reference: NutritionReference = basisHasAnyNutrient(per100g)
    ? { status: catalog?.nutritionStatus ?? 'estimated', source: 'catalog_estimate', per100g, fdcId: catalog?.fdcId ?? null }
    : { status: 'none', source: 'none', per100g: null };
  return { reference, conversionMeta };
}

function mergeConversionMeta(base: IngredientConversionMeta, over: IngredientConversionMeta): IngredientConversionMeta {
  return {
    gramsPerUnit:
      base.gramsPerUnit || over.gramsPerUnit ? { ...(base.gramsPerUnit ?? {}), ...(over.gramsPerUnit ?? {}) } : undefined,
    densityGPerMl: over.densityGPerMl ?? base.densityGPerMl,
  };
}

function pickReference(
  canonical: CanonicalNutritionRef | undefined,
  override: UserIngredientOverride | undefined,
  catalog: NutritionReference,
): NutritionReference {
  // Precedence: user override (with nutrition) > server canonical row > catalog estimate > none.
  if (override && basisHasAnyNutrient(override.per100g)) {
    return { status: 'estimated', source: 'user_override', per100g: override.per100g, fdcId: null, verifiedAt: null };
  }
  if (canonical && basisHasAnyNutrient(canonical.per100g)) {
    return {
      status: canonical.status,
      source: canonical.fdcId != null ? 'usda' : 'catalog_estimate',
      per100g: canonical.per100g,
      fdcId: canonical.fdcId,
      verifiedAt: canonical.verifiedAt,
    };
  }
  return catalog;
}

/** Resolve one ingredient's nutrition reference + conversion metadata from all sources. */
async function resolveIngredientReference(canonicalId: string): Promise<ResolvedIngredientReference> {
  await requireUserId();
  const [canonicalRows, overrideRows] = await Promise.all([
    fetchCanonicalIngredientNutrition([canonicalId]),
    fetchUserIngredientOverrides([canonicalId]),
  ]);
  const catalog = catalogReference(canonicalId);
  const canonical = canonicalRows[0];
  const override = overrideRows[0];

  return {
    reference: pickReference(canonical, override, catalog.reference),
    conversionMeta: mergeConversionMeta(catalog.conversionMeta, override?.conversionMeta ?? {}),
  };
}

/** Batch variant for recipes - one round trip for the whole ingredient list. */
async function resolveIngredientReferences(canonicalIds: string[]): Promise<Map<string, ResolvedIngredientReference>> {
  await requireUserId();
  const uniqueIds = Array.from(new Set(canonicalIds));
  const [canonicalRows, overrideRows] = await Promise.all([
    fetchCanonicalIngredientNutrition(uniqueIds),
    fetchUserIngredientOverrides(uniqueIds),
  ]);
  const canonicalById = new Map(canonicalRows.map((r) => [r.canonicalIngredientId, r]));
  const overrideById = new Map(overrideRows.map((r) => [r.canonicalIngredientId, r]));

  const out = new Map<string, ResolvedIngredientReference>();
  for (const id of uniqueIds) {
    const catalog = catalogReference(id);
    out.set(id, {
      reference: pickReference(canonicalById.get(id), overrideById.get(id), catalog.reference),
      conversionMeta: mergeConversionMeta(catalog.conversionMeta, overrideById.get(id)?.conversionMeta ?? {}),
    });
  }
  return out;
}

export interface ResolveQuantityNutritionArgs {
  canonicalIngredientId: string;
  quantity: number;
  unit: string;
  /**
   * Set for a barcode-added pantry item. The product-specific nutrition cache
   * (verified USDA branded match > Open Food Facts candidate) is consulted first
   * and outranks the generic canonical ingredient - a branded package's own
   * label beats an ingredient average. Falls through to the canonical path when
   * there is no usable product record. Local read only; never calls a provider.
   */
  barcode?: string;
}

function productReference(product: BarcodeProductNutritionRef): NutritionReference {
  return {
    status: product.status === 'verified' ? 'verified' : 'candidate',
    source: product.status === 'verified' ? 'usda' : 'open_food_facts',
    per100g: product.per100g,
    fdcId: product.fdcId,
    verifiedAt: product.status === 'verified' ? product.updatedAt : null,
  };
}

/** Full pipeline for one quantity: identity -> reference -> grams -> snapshot with provenance. */
async function resolveQuantityNutrition(args: ResolveQuantityNutritionArgs): Promise<NutritionResolution> {
  await requireUserId();

  if (args.barcode) {
    const product = await fetchBarcodeProductNutrition(args.barcode);
    if (product && basisHasAnyNutrient(product.per100g)) {
      const { conversionMeta } = catalogReference(args.canonicalIngredientId);
      return resolveIngredientNutrition({
        quantity: args.quantity,
        unit: args.unit,
        conversionMeta,
        reference: productReference(product),
      });
    }
  }

  const { reference, conversionMeta } = await resolveIngredientReference(args.canonicalIngredientId);
  return resolveIngredientNutrition({
    quantity: args.quantity,
    unit: args.unit,
    conversionMeta,
    reference,
  });
}

export interface EnrichBarcodeProductArgs {
  barcode: string;
  /** Open Food Facts per-100g values from the review lookup (already normalized). */
  offPer100g?: NutrientBasisPer100g | null;
  sourceProductId?: string;
  description?: string;
  brand?: string;
}

export interface ProductNutritionResolution {
  status: 'verified' | 'candidate' | 'unresolved';
  source: 'usda' | 'open_food_facts' | 'none';
  per100g: NutrientBasisPer100g | null;
  fdcId: number | null;
  description?: string;
  brandOwner?: string;
}

/**
 * Barcode-intake enrichment - called ONCE from the review screen, never during
 * ordinary Pantry reads. Persists the best defensible product nutrition and
 * reports what resolved:
 *   1. If OFF gave usable per-100g nutrition -> persist it as a `candidate`
 *      (security-definer RPC; cannot set verified / an fdc_id).
 *   2. Ask USDA for an EXACT branded-GTIN match (at most one USDA call) -> the
 *      Edge Function verifies server-side and writes the `verified` row itself.
 * A USDA failure/absence never blocks intake - the OFF candidate (or unresolved)
 * stands.
 */
async function enrichBarcodeProductNutrition(args: EnrichBarcodeProductArgs): Promise<ProductNutritionResolution> {
  await requireUserId();

  const offBasis = args.offPer100g ? toNutrientBasis(args.offPer100g) : {};
  let candidate: BarcodeProductNutritionRef | null = null;
  if (basisHasAnyNutrient(offBasis)) {
    try {
      candidate = await upsertBarcodeProductCandidate({
        barcode: args.barcode,
        sourceProductId: args.sourceProductId ?? args.barcode,
        per100g: offBasis,
        description: args.description ?? null,
        brandOwner: args.brand ?? null,
      });
    } catch {
      candidate = null;
    }
  }

  let usda: Awaited<ReturnType<typeof invokeUsdaBrandedByBarcode>> | null = null;
  try {
    usda = await invokeUsdaBrandedByBarcode(args.barcode);
  } catch {
    usda = null;
  }

  if (usda && usda.status === 'verified_match') {
    return {
      status: 'verified',
      source: 'usda',
      per100g: toNutrientBasis(usda.nutritionPer100g),
      fdcId: usda.fdcId,
      description: usda.description,
      brandOwner: usda.brandOwner ?? undefined,
    };
  }

  const persisted = candidate ?? (await fetchBarcodeProductNutrition(args.barcode).catch(() => null));
  if (persisted && basisHasAnyNutrient(persisted.per100g)) {
    return {
      status: persisted.status === 'verified' ? 'verified' : 'candidate',
      source: persisted.status === 'verified' ? 'usda' : 'open_food_facts',
      per100g: persisted.per100g,
      fdcId: persisted.fdcId,
      description: persisted.description ?? undefined,
      brandOwner: persisted.brandOwner ?? undefined,
    };
  }

  return { status: 'unresolved', source: 'none', per100g: null, fdcId: null };
}

/** USDA name search via the Edge Function (auth-gated; API key stays server-side). */
async function searchUsda(query: string): Promise<UsdaSearchResult> {
  await requireUserId();
  return invokeUsdaSearch(query);
}

/** USDA food details, cache-first: hit `usda_foods` before the Edge Function / USDA. */
async function getUsdaFood(fdcId: number): Promise<UsdaDetailsResult> {
  await requireUserId();
  const cached = await fetchUsdaFoodFromCache(fdcId);
  if (cached && basisHasAnyNutrient(cached.per100g)) {
    return {
      status: 'ok',
      food: { fdcId: cached.fdcId, description: cached.description, dataType: cached.dataType, nutritionPer100g: cached.per100g },
    };
  }
  return invokeUsdaDetails(fdcId);
}

/**
 * Merged conversion metadata (catalog default + user overrides) per canonical
 * ingredient. Used by recipeService for quantity-aware coverage and by
 * groceryService for shortfall lines - so unit conversion lives in exactly
 * one shared place, never re-implemented per feature.
 */
async function getConversionMetaMap(canonicalIds?: string[]): Promise<Map<string, IngredientConversionMeta>> {
  await requireUserId();
  const overrides = await fetchUserIngredientOverrides(canonicalIds && canonicalIds.length > 0 ? canonicalIds : undefined);
  const overrideById = new Map(overrides.map((o) => [o.canonicalIngredientId, o]));

  const ids =
    canonicalIds && canonicalIds.length > 0
      ? Array.from(new Set(canonicalIds))
      : Array.from(new Set([...INGREDIENTS.map((i) => i.id), ...overrideById.keys()]));

  const out = new Map<string, IngredientConversionMeta>();
  for (const id of ids) {
    const merged = mergeConversionMeta(catalogReference(id).conversionMeta, overrideById.get(id)?.conversionMeta ?? {});
    if (merged.gramsPerUnit || merged.densityGPerMl !== undefined) out.set(id, merged);
  }
  return out;
}

/**
 * Recipe nutrition coverage: resolves every ingredient's reference + conversion
 * metadata, then runs the pure aggregator. `verified` only when EVERY resolved
 * ingredient is verified; `incomplete` whenever any ingredient is unresolved -
 * never presents a partial recipe as fully verified.
 */
async function getRecipeNutritionCoverage(
  ingredients: RecipeIngredientForNutrition[],
): Promise<RecipeNutritionCoverage> {
  const refs = await resolveIngredientReferences(ingredients.map((i) => i.ingredientId));
  return computeRecipeNutritionCoveragePure(ingredients, (id) => {
    const r = refs.get(id);
    return { reference: r?.reference ?? { status: 'none', source: 'none', per100g: null }, conversionMeta: r?.conversionMeta };
  });
}

async function setIngredientOverride(input: UpsertUserOverrideInput): Promise<UserIngredientOverride> {
  const userId = await requireUserId();
  return upsertUserIngredientOverride(userId, input);
}

async function clearIngredientOverride(canonicalIngredientId: string): Promise<void> {
  await requireUserId();
  return deleteUserIngredientOverride(canonicalIngredientId);
}

export const nutritionService = {
  resolveIngredientReference,
  resolveIngredientReferences,
  resolveQuantityNutrition,
  enrichBarcodeProductNutrition,
  getConversionMetaMap,
  getRecipeNutritionCoverage,
  searchUsda,
  getUsdaFood,
  setIngredientOverride,
  clearIngredientOverride,
};
