/**
 * Pure normalizers for USDA FoodData Central responses. NO Deno / network /
 * env access here so this file is unit-testable with the app's normal jest
 * setup (see __tests__/normalize.test.ts). index.ts (the Edge Function) does
 * the auth check, the fetch, and the cache write, and delegates shape work here.
 *
 * SmartPrep only needs seven nutrients, per 100 g:
 *   calories (kcal), proteinG, carbsG, fatG, fiberG, sugarG, sodiumMg
 */

/** USDA FDC nutrient numbers -> our keys. Energy prefers kcal (1008); kJ (1062) is converted. */
export const USDA_NUTRIENT_NUMBERS: Record<string, 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG' | 'sugarG' | 'sodiumMg' | 'caloriesKj'> = {
  '1008': 'calories',
  '2047': 'calories', // Energy (Atwater General)
  '2048': 'calories', // Energy (Atwater Specific)
  '1062': 'caloriesKj',
  '1003': 'proteinG',
  '1004': 'fatG',
  '1005': 'carbsG',
  '1079': 'fiberG',
  '2000': 'sugarG',
  '1093': 'sodiumMg',
};

export interface NormalizedNutrition {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
}

export type NormalizedFoodDetail =
  | {
      status: 'ok';
      fdcId: number;
      description: string;
      dataType: string | null;
      brandOwner: string | null;
      servingSize: number | null;
      servingSizeUnit: string | null;
      nutritionPer100g: NormalizedNutrition;
    }
  | { status: 'malformed' }
  | { status: 'unusable_food'; fdcId: number | null; reason: 'no_recognized_nutrients' };

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Normalize a `/v1/food/{fdcId}` response to per-100g nutrition. */
export function normalizeFoodDetail(raw: unknown): NormalizedFoodDetail {
  if (!raw || typeof raw !== 'object') return { status: 'malformed' };
  const r = raw as Record<string, unknown>;
  const fdcId = num(r.fdcId);
  const foodNutrients = r.foodNutrients;
  if (fdcId === null || !Array.isArray(foodNutrients)) {
    return { status: 'malformed' };
  }

  const out: NormalizedNutrition = {};
  let caloriesKj: number | null = null;

  for (const entry of foodNutrients) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const nutrient = (e.nutrient ?? {}) as Record<string, unknown>;
    const numberKey = String(nutrient.number ?? e.nutrientNumber ?? '');
    const mapped = USDA_NUTRIENT_NUMBERS[numberKey];
    if (!mapped) continue;
    const amount = num(e.amount ?? e.value);
    if (amount === null) continue;
    if (mapped === 'caloriesKj') {
      caloriesKj = amount;
    } else if (out[mapped] === undefined) {
      out[mapped] = amount;
    }
  }

  if (out.calories === undefined && caloriesKj !== null) {
    out.calories = Math.round((caloriesKj / 4.184) * 10) / 10;
  }

  if (Object.keys(out).length === 0) {
    return { status: 'unusable_food', fdcId, reason: 'no_recognized_nutrients' };
  }

  return {
    status: 'ok',
    fdcId,
    description: typeof r.description === 'string' ? r.description : '',
    dataType: typeof r.dataType === 'string' ? r.dataType : null,
    brandOwner: typeof r.brandOwner === 'string' ? r.brandOwner : null,
    servingSize: num(r.servingSize),
    servingSizeUnit: typeof r.servingSizeUnit === 'string' ? r.servingSizeUnit : null,
    nutritionPer100g: out,
  };
}

export interface SearchCandidate {
  fdcId: number;
  description: string;
  dataType: string | null;
  brandOwner: string | null;
  /** Normalized description equals the normalized query exactly. */
  isExactDescriptionMatch: boolean;
}

export type NormalizedSearch =
  | { status: 'ok'; candidates: SearchCandidate[] }
  | { status: 'no_match'; candidates: [] }
  | { status: 'malformed' };

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Data types where an exact-description match is defensible enough to auto-verify (documented rule; nothing auto-verifies in this phase). */
export const AUTO_VERIFY_DATA_TYPES = ['Foundation', 'SR Legacy'];

/** Normalize a `/v1/foods/search` response to a candidate list. */
export function normalizeSearchResponse(raw: unknown, query: string): NormalizedSearch {
  if (!raw || typeof raw !== 'object') return { status: 'malformed' };
  const foods = (raw as Record<string, unknown>).foods;
  if (!Array.isArray(foods)) return { status: 'malformed' };

  const q = normalizeText(String(query ?? ''));
  const candidates: SearchCandidate[] = [];
  for (const food of foods) {
    if (!food || typeof food !== 'object') continue;
    const f = food as Record<string, unknown>;
    const fdcId = num(f.fdcId);
    if (fdcId === null) continue;
    const description = typeof f.description === 'string' ? f.description : '';
    candidates.push({
      fdcId,
      description,
      dataType: typeof f.dataType === 'string' ? f.dataType : null,
      brandOwner: typeof f.brandOwner === 'string' ? f.brandOwner : null,
      isExactDescriptionMatch: q.length > 0 && normalizeText(description) === q,
    });
  }

  if (candidates.length === 0) return { status: 'no_match', candidates: [] };
  return { status: 'ok', candidates };
}

/**
 * The verification rule (documented; NOT auto-applied in this phase - it needs
 * an explicit confirm flow). A candidate may be treated as `verified` only
 * when it is the SOLE exact-description match and comes from a whole-food
 * reference data type. Anything else stays `candidate`.
 */
export function isDefensiblyVerified(search: NormalizedSearch): { verified: boolean; fdcId: number | null } {
  if (search.status !== 'ok') return { verified: false, fdcId: null };
  const exact = search.candidates.filter((c) => c.isExactDescriptionMatch && c.dataType && AUTO_VERIFY_DATA_TYPES.includes(c.dataType));
  if (exact.length === 1) return { verified: true, fdcId: exact[0].fdcId };
  return { verified: false, fdcId: null };
}

// ===========================================================================
// Exact GTIN / UPC verification for barcode intake.
//
// Mirrors lib/barcode/normalize.ts#gtinEquivalent (no cross-runtime import).
// Two codes are the SAME GTIN iff their 14-digit zero-padded forms are equal -
// this is the standard GS1 equivalence and covers "UPC-A 012345678905" vs its
// zero-padded GTIN-13 "0012345678905".
// ===========================================================================

/** Digits only. Returns '' for anything non-numeric or empty. */
function digitsOnly(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : '';
  return /^[0-9\s-]*$/.test(s) ? s.replace(/[\s-]/g, '') : '';
}

/** True when a and b are the same GTIN (zero-padded to 14 and compared). */
export function gtinEquivalent(a: unknown, b: unknown): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (da.length < 8 || da.length > 14 || db.length < 8 || db.length > 14) return false;
  return da.padStart(14, '0') === db.padStart(14, '0');
}

export type BrandedGtinMatch =
  | { status: 'verified_match'; fdcId: number; description: string; brandOwner: string | null; gtinUpc: string }
  | { status: 'no_exact_match' }
  | { status: 'malformed' };

/**
 * Inspect a `/v1/foods/search` (dataType=Branded) response and accept a result
 * ONLY when EXACTLY ONE distinct food carries a `gtinUpc` that is GTIN-equivalent
 * to the scanned barcode. Never trusts the first result, name, or brand; an
 * ambiguous multi-match is treated as no match (do not guess).
 */
export function matchBrandedByGtin(raw: unknown, scannedBarcode: string): BrandedGtinMatch {
  if (!raw || typeof raw !== 'object') return { status: 'malformed' };
  const foods = (raw as Record<string, unknown>).foods;
  if (!Array.isArray(foods)) return { status: 'malformed' };
  if (digitsOnly(scannedBarcode).length < 8) return { status: 'no_exact_match' };

  const matches = new Map<number, { description: string; brandOwner: string | null; gtinUpc: string }>();
  for (const food of foods) {
    if (!food || typeof food !== 'object') continue;
    const f = food as Record<string, unknown>;
    const fdcId = num(f.fdcId);
    const gtinUpc = typeof f.gtinUpc === 'string' ? f.gtinUpc : null;
    if (fdcId === null || !gtinUpc) continue;
    if (!gtinEquivalent(gtinUpc, scannedBarcode)) continue;
    if (!matches.has(fdcId)) {
      matches.set(fdcId, {
        description: typeof f.description === 'string' ? f.description : '',
        brandOwner: typeof f.brandOwner === 'string' ? f.brandOwner : null,
        gtinUpc,
      });
    }
  }

  if (matches.size !== 1) return { status: 'no_exact_match' };
  const [[fdcId, info]] = [...matches.entries()];
  return { status: 'verified_match', fdcId, description: info.description, brandOwner: info.brandOwner, gtinUpc: info.gtinUpc };
}
