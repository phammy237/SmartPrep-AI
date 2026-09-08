/**
 * Open Food Facts provider adapter.
 *
 * OFF has a dedicated barcode endpoint, needs no API key, and covers US
 * packaged groceries well - it is SmartPrep's single barcode->product source.
 * (USDA FoodData Central has NO barcode endpoint; a UPC "search" there is a
 * fuzzy full-text match that can return the wrong product, so it is not used
 * as a barcode resolver. See the task report for the precedence rationale.)
 *
 * Data is under the Open Database License (ODbL). Attribution ("Powered by
 * Open Food Facts") is shown on the review screen. Product images are
 * hotlinked from the OFF CDN, never copied into Supabase.
 *
 * `mapOpenFoodFactsProduct` is pure and fixture-tested. `fetchOpenFoodFactsProduct`
 * is the only thing that touches the network.
 */

import { normalizeUnit } from '@/lib/nutrition/units';
import { IngredientCategory, QuantityUnit } from '@/types';
import {
  BarcodeLookupResult,
  BarcodeNutritionPer100g,
  BarcodeProductCandidate,
} from './types';

/** Descriptive User-Agent OFF asks every client to send. Replace the contact before a public release. */
export const OFF_USER_AGENT = 'SmartPrep/1.0 (pantry barcode intake; contact: support@smartprep.app)';

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'image_front_url',
  'image_url',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'serving_size',
  'serving_quantity',
  'nutriments',
  'ingredients_text',
  'ingredients_text_en',
  'categories_tags',
].join(',');

// --- pure helpers ----------------------------------------------------------

const PANTRY_UNITS: ReadonlySet<string> = new Set([
  'item', 'container', 'bag', 'bottle', 'can', 'package', 'serving', 'g', 'kg', 'oz', 'lb', 'ml', 'L',
]);

/** Map a provider unit token to a supported pantry `QuantityUnit`, or undefined. */
export function toPantryUnit(token: string | undefined | null): QuantityUnit | undefined {
  if (!token) return undefined;
  const key = normalizeUnit(String(token));
  if (!key) return undefined;
  const mapped = key === 'l' ? 'L' : key;
  return PANTRY_UNITS.has(mapped) ? (mapped as QuantityUnit) : undefined;
}

function numOrNull(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/** Parse a package string like "500 g", "1,5 L", "16 oz" -> { quantity, unit } (unit only if supported). */
export function parseQuantityText(text: string | undefined): { quantity?: number; unit?: QuantityUnit } {
  if (!text) return {};
  const m = String(text).match(/([\d]+(?:[.,]\d+)?)\s*([a-zA-Z]+)/);
  if (!m) return {};
  const quantity = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) return {};
  return { quantity, unit: toPantryUnit(m[2]) };
}

const CATEGORY_KEYWORDS: [RegExp, IngredientCategory][] = [
  [/yogurt|milk|cheese|cream|dairy|butter/i, 'dairy'],
  [/frozen/i, 'frozen'],
  [/fruit|vegetable|produce|salad/i, 'produce'],
  [/meat|poultry|fish|seafood|beef|chicken|pork|tofu|egg/i, 'protein'],
  [/beverage|drink|soda|juice|water|snack|cereal|pasta|rice|sauce|bread|flour|sugar|oil|canned/i, 'pantry'],
];

/** Conservative coarse category from OFF `categories_tags`. Defaults to 'other'. */
export function guessCategory(tags: unknown): IngredientCategory {
  if (!Array.isArray(tags)) return 'other';
  const joined = tags.filter((t) => typeof t === 'string').join(' ');
  for (const [re, category] of CATEGORY_KEYWORDS) {
    if (re.test(joined)) return category;
  }
  return 'other';
}

function readNutriments(nutriments: Record<string, unknown> | undefined): BarcodeNutritionPer100g {
  const n = nutriments ?? {};
  const sodiumG = numOrNull(n['sodium_100g']);
  const saltG = numOrNull(n['salt_100g']);
  // OFF stores sodium in GRAMS per 100g; SmartPrep uses mg. salt->sodium is the
  // exact GS1 factor 0.393, not a fabrication - used only if sodium is absent.
  const sodiumMg =
    sodiumG != null ? round2(sodiumG * 1000) : saltG != null ? round2(saltG * 393.4) : null;
  return {
    calories: numOrNull(n['energy-kcal_100g']),
    proteinG: numOrNull(n['proteins_100g']),
    carbsG: numOrNull(n['carbohydrates_100g']),
    fatG: numOrNull(n['fat_100g']),
    fiberG: numOrNull(n['fiber_100g']),
    sugarG: numOrNull(n['sugars_100g']),
    sodiumMg,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Map a raw OFF v2 `product` object to the provider-neutral candidate. Pure -
 * every missing field degrades to undefined/null, never a fabricated value.
 * `barcode` is the value SmartPrep scanned (kept as provenance even if the
 * OFF hit came from a padded variant).
 */
export function mapOpenFoodFactsProduct(product: Record<string, unknown>, barcode: string): BarcodeProductCandidate {
  const productName =
    firstNonEmpty(product['product_name_en'], product['product_name'], product['generic_name']) ?? '';
  const brand = firstNonEmpty(String(product['brands'] ?? '').split(',')[0]);
  const imageRaw = firstNonEmpty(product['image_front_url'], product['image_url']);
  const imageUrl = imageRaw && /^https:\/\//.test(imageRaw) ? imageRaw : undefined;

  const productQuantity = numOrNull(product['product_quantity']);
  const productQuantityUnit = toPantryUnit(product['product_quantity_unit'] as string);
  const quantityText = firstNonEmpty(product['quantity']);
  const parsed = parseQuantityText(quantityText);

  const packageQuantity =
    productQuantity != null && productQuantityUnit ? productQuantity : parsed.quantity;
  const packageUnit = productQuantity != null && productQuantityUnit ? productQuantityUnit : parsed.unit;

  const nutritionValues = readNutriments(product['nutriments'] as Record<string, unknown> | undefined);
  const hasAnyValue = Object.values(nutritionValues).some((v) => v != null);

  const servingParsed = parseQuantityText(firstNonEmpty(product['serving_size']));
  const servingQuantity = numOrNull(product['serving_quantity']);

  return {
    barcode,
    productName,
    brand,
    imageUrl,
    packageQuantity: packageQuantity && packageQuantity > 0 ? packageQuantity : undefined,
    packageUnit,
    packageRawText: quantityText,
    ingredientsText: firstNonEmpty(product['ingredients_text_en'], product['ingredients_text']),
    nutrition: hasAnyValue
      ? { per100g: nutritionValues, source: 'open_food_facts', hasAnyValue: true }
      : undefined,
    servingSize: servingParsed.quantity ?? (servingQuantity ?? undefined),
    servingUnit: servingParsed.unit ?? (servingQuantity != null ? 'g' : undefined),
    categoryGuess: guessCategory(product['categories_tags']),
    source: 'open_food_facts',
    sourceProductId: String(product['code'] ?? barcode),
    completeness: {
      hasName: productName.length > 0,
      hasBrand: !!brand,
      hasNutrition: hasAnyValue,
      hasPackageSize: !!(packageQuantity && packageUnit),
      hasImage: !!imageUrl,
    },
  };
}

// --- network -------------------------------------------------------------

export interface OffFetchDeps {
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

/**
 * Fetch one product by barcode from Open Food Facts. Returns a provider-neutral
 * result; every failure mode is mapped to an explicit reason (no canned
 * fallback product is ever synthesized).
 */
export async function fetchOpenFoodFactsProduct(
  barcode: string,
  lookupKey: string,
  deps: OffFetchDeps = {},
): Promise<BarcodeLookupResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  const url = `${OFF_BASE}/${encodeURIComponent(lookupKey)}.json?fields=${OFF_FIELDS}`;

  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': deps.userAgent ?? OFF_USER_AGENT, Accept: 'application/json' },
    });
  } catch {
    return { status: 'error', reason: 'offline', barcode };
  }

  if (res.status === 404) return { status: 'not_found', barcode };
  if (res.status === 429) return { status: 'error', reason: 'rate_limited', barcode };
  if (res.status === 401 || res.status === 403) return { status: 'error', reason: 'auth', barcode };
  if (res.status >= 500) return { status: 'error', reason: 'provider_unavailable', barcode };
  if (!res.ok) return { status: 'error', reason: 'provider_unavailable', barcode };

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return { status: 'error', reason: 'malformed_response', barcode };
  }

  const status = body['status'];
  const product = body['product'];
  if (status === 0 || status === '0' || !product || typeof product !== 'object') {
    return { status: 'not_found', barcode };
  }

  return { status: 'found', product: mapOpenFoodFactsProduct(product as Record<string, unknown>, barcode) };
}
