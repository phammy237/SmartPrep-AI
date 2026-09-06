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
