// Supabase Edge Function: usda-lookup
//
// The ONLY Edge Function in this phase. It exists solely to keep USDA_API_KEY
// off the client: the Expo app never sees the key, it calls this function,
// this function calls USDA FoodData Central with the secret, and returns only
// the seven nutrients SmartPrep needs (normalized to per 100 g).
//
// Actions:
//   { "action": "search",             "query": "chicken breast" }
//   { "action": "details",            "fdcId": 171077 }
//   { "action": "branded_by_barcode", "barcode": "0123456789012" }
//
// Requires an authenticated caller (Bearer JWT). On a successful `details`
// fetch it best-effort upserts the normalized food into public.usda_foods
// (service role) so repeat lookups of a verified ingredient never hit USDA.
//
// `branded_by_barcode` searches USDA Branded foods by the raw GTIN, accepts a
// result ONLY when exactly one food's `gtinUpc` is GTIN-equivalent to the
// scanned code (never name/brand/first-result), and then writes the verified
// record ATOMICALLY via the service-role-only upsert_verified_barcode_product
// RPC. It returns `verified_match` ONLY after that write succeeds; if the write
// fails it returns `persist_failed` so the app never treats it as verified.
//
// Secrets (set with `npx supabase secrets set ...`, never EXPO_PUBLIC_*):
//   USDA_API_KEY               - FoodData Central API key
//   SUPABASE_URL               - injected by the platform
//   SUPABASE_ANON_KEY          - injected by the platform (for auth check)
//   SUPABASE_SERVICE_ROLE_KEY  - injected by the platform (for the cache write)
//
// NOT deployed by this task. `supabase functions deploy usda-lookup` + the
// secret above are still required.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  matchBrandedByGtin,
  normalizeFoodDetail,
  normalizeSearchResponse,
} from './normalize.ts';

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function requireUser(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return null;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

async function callUsda(path: string, apiKey: string): Promise<{ ok: true; body: unknown } | { ok: false; kind: 'rate_limited' | 'upstream_error' | 'malformed_upstream' }> {
  let res: Response;
  try {
    res = await fetch(`${USDA_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { ok: false, kind: 'upstream_error' };
  }
  if (res.status === 429) return { ok: false, kind: 'rate_limited' };
  if (!res.ok) return { ok: false, kind: 'upstream_error' };
  try {
    return { ok: true, body: await res.json() };
  } catch {
    return { ok: false, kind: 'malformed_upstream' };
  }
}

async function cacheFood(food: {
  fdcId: number;
  description: string;
  dataType: string | null;
  brandOwner: string | null;
  servingSize: number | null;
  servingSizeUnit: string | null;
  nutritionPer100g: Record<string, number>;
}, userId: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  try {
    await admin.from('usda_foods').upsert(
      {
        fdc_id: food.fdcId,
        description: food.description,
        data_type: food.dataType,
        brand_owner: food.brandOwner,
        serving_size: food.servingSize,
        serving_size_unit: food.servingSizeUnit,
        nutrition_per_100g: food.nutritionPer100g,
        fetched_at: new Date().toISOString(),
        fetched_by: userId,
      },
      { onConflict: 'fdc_id' },
    );
  } catch {
    // Cache write is best-effort - never fail the lookup because of it.
  }
}

/**
 * Persist an exact-GTIN-matched USDA product as the AUTHORITATIVE verified
 * barcode nutrition, via the service-role-only upsert_verified_barcode_product
 * RPC (one transaction: usda_foods + barcode_product_nutrition). Returns whether
 * it actually landed - the caller only claims `verified_match` when this is
 * true. NOT best-effort: a failure here means the verification failed.
 */
async function persistVerifiedBarcodeProduct(row: {
  barcode: string;
  fdcId: number;
  description: string;
  brandOwner: string | null;
  dataType: string | null;
  servingSize: number | null;
  servingSizeUnit: string | null;
  nutritionPer100g: Record<string, number>;
}, userId: string): Promise<{ ok: true; nutritionPer100g: Record<string, number> } | { ok: false }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return { ok: false };
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  try {
    const { data, error } = await admin.rpc('upsert_verified_barcode_product', {
      p_barcode: row.barcode,
      p_fdc_id: row.fdcId,
      p_nutrition_per_100g: row.nutritionPer100g,
      p_description: row.description || null,
      p_brand_owner: row.brandOwner,
      p_usda_description: row.description || null,
      p_usda_data_type: row.dataType,
      p_usda_serving_size: row.servingSize,
      p_usda_serving_size_unit: row.servingSizeUnit,
      p_created_by: userId,
    });
    if (error || !data) return { ok: false };
    const persisted = (data as { nutrition_per_100g?: Record<string, number> }).nutrition_per_100g;
    return { ok: true, nutritionPer100g: persisted ?? row.nutritionPer100g };
  } catch {
    return { ok: false };
  }
}

/** A syntactically valid, length-bounded barcode (digits only, 8-14). */
function isBoundedBarcode(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[0-9]{8,14}$/.test(raw);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ status: 'method_not_allowed' }, 405);

  const user = await requireUser(req);
  if (!user) return json({ status: 'unauthenticated' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ status: 'invalid_request', reason: 'body must be JSON' }, 400);
  }

  const apiKey = Deno.env.get('USDA_API_KEY');
  if (!apiKey) return json({ status: 'config_error' }, 500);

  const action = payload.action;

  if (action === 'search') {
    const query = typeof payload.query === 'string' ? payload.query.trim() : '';
    if (query.length < 2) return json({ status: 'invalid_request', reason: 'query must be at least 2 characters' }, 400);

    const usda = await callUsda(`/foods/search?query=${encodeURIComponent(query)}&pageSize=10`, apiKey);
    if (!usda.ok) return json({ status: usda.kind }, usda.kind === 'rate_limited' ? 429 : 502);

    const normalized = normalizeSearchResponse(usda.body, query);
    if (normalized.status === 'malformed') return json({ status: 'malformed_upstream' }, 502);
    return json({ status: normalized.status, candidates: normalized.candidates });
  }

  if (action === 'details') {
    const fdcId = Number(payload.fdcId);
    if (!Number.isInteger(fdcId) || fdcId <= 0) {
      return json({ status: 'invalid_request', reason: 'fdcId must be a positive integer' }, 400);
    }

    const usda = await callUsda(`/food/${fdcId}`, apiKey);
    if (!usda.ok) return json({ status: usda.kind }, usda.kind === 'rate_limited' ? 429 : 502);

    const normalized = normalizeFoodDetail(usda.body);
    if (normalized.status === 'malformed') return json({ status: 'malformed_upstream' }, 502);
    if (normalized.status === 'unusable_food') return json({ status: 'unusable_food', fdcId: normalized.fdcId }, 200);

    await cacheFood(
      {
        fdcId: normalized.fdcId,
        description: normalized.description,
        dataType: normalized.dataType,
        brandOwner: normalized.brandOwner,
        servingSize: normalized.servingSize,
        servingSizeUnit: normalized.servingSizeUnit,
        nutritionPer100g: normalized.nutritionPer100g as Record<string, number>,
      },
      user.id,
    );

    return json({
      status: 'ok',
      food: {
        fdcId: normalized.fdcId,
        description: normalized.description,
        dataType: normalized.dataType,
        brandOwner: normalized.brandOwner,
        servingSize: normalized.servingSize,
        servingSizeUnit: normalized.servingSizeUnit,
        nutritionPer100g: normalized.nutritionPer100g,
      },
    });
  }

  if (action === 'branded_by_barcode') {
    const barcode = typeof payload.barcode === 'string' ? payload.barcode.trim() : '';
    if (!isBoundedBarcode(barcode)) {
      return json({ status: 'invalid_request', reason: 'barcode must be 8-14 digits' }, 400);
    }

    // USDA has no barcode endpoint; the branded search DOES index gtinUpc, so
    // query the raw code and verify gtinUpc server-side. Bounded page size.
    const search = await callUsda(
      `/foods/search?query=${encodeURIComponent(barcode)}&dataType=Branded&pageSize=25`,
      apiKey,
    );
    if (!search.ok) return json({ status: search.kind }, search.kind === 'rate_limited' ? 429 : 502);

    const match = matchBrandedByGtin(search.body, barcode);
    if (match.status === 'malformed') return json({ status: 'malformed_upstream' }, 502);
    if (match.status === 'no_exact_match') return json({ status: 'no_exact_match', barcode });

    const detail = await callUsda(`/food/${match.fdcId}`, apiKey);
    if (!detail.ok) return json({ status: detail.kind }, detail.kind === 'rate_limited' ? 429 : 502);

    const normalized = normalizeFoodDetail(detail.body);
    if (normalized.status === 'malformed') return json({ status: 'malformed_upstream' }, 502);
    if (normalized.status === 'unusable_food') {
      // We proved the GTIN but USDA has no usable nutrients - not verifiable.
      return json({ status: 'no_exact_match', barcode });
    }

    const description = normalized.description || match.description;
    const brandOwner = normalized.brandOwner ?? match.brandOwner;

    // "verified" is only real once the authoritative cache row is persisted.
    const persist = await persistVerifiedBarcodeProduct(
      {
        barcode,
        fdcId: normalized.fdcId,
        description,
        brandOwner,
        dataType: normalized.dataType,
        servingSize: normalized.servingSize,
        servingSizeUnit: normalized.servingSizeUnit,
        nutritionPer100g: normalized.nutritionPer100g as Record<string, number>,
      },
      user.id,
    );
    if (!persist.ok) {
      // GTIN matched but the verified record did not land - do NOT let the app
      // treat this as verified. It keeps the OFF candidate / stays unresolved.
      return json({ status: 'persist_failed', barcode }, 200);
    }

    return json({
      status: 'verified_match',
      barcode,
      fdcId: normalized.fdcId,
      description,
      brandOwner,
      nutritionPer100g: persist.nutritionPer100g,
    });
  }

  return json({ status: 'invalid_request', reason: "action must be 'search', 'details' or 'branded_by_barcode'" }, 400);
});
