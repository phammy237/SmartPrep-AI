-- Correctness pass: make "verified" barcode nutrition mean "persisted".
--
-- Before this, the usda-lookup Edge Function wrote usda_foods and
-- barcode_product_nutrition as two independent best-effort upserts and then
-- returned `verified_match` to the app regardless of whether either landed.
-- The review/create flow could therefore stamp pantry_items.fdc_id while
-- barcode_product_nutrition had no verified row - so Pantry Detail later
-- resolved that same item as non-verified.
--
-- This migration adds ONE server-only RPC that writes both records in a single
-- transaction. The Edge Function awaits it and only returns `verified_match`
-- when it succeeds; anything else is reported as an unpersisted result and the
-- app keeps the Open Food Facts candidate (or stays unresolved) and never
-- stores an fdc_id.
--
-- No schema change - only a function.

-- ============================================================================
-- upsert_verified_barcode_product - SERVICE ROLE ONLY
-- ============================================================================
-- security definer, no auth.uid() gate: this is called exclusively by the
-- usda-lookup Edge Function with the service-role key, AFTER a server-side
-- exact GTIN match. It is NOT granted to `authenticated` - an ordinary client
-- still cannot create a verified row (the client-facing
-- upsert_barcode_product_candidate can only ever write 'candidate').
--
-- Atomic: a single plpgsql function body is one transaction, so the usda_foods
-- row (secondary cache) and the authoritative barcode_product_nutrition
-- verified row land together or not at all. Any raise rolls both back and the
-- Edge Function sees an error.
create function public.upsert_verified_barcode_product(
  p_barcode text,
  p_fdc_id bigint,
  p_nutrition_per_100g jsonb,
  p_description text default null,
  p_brand_owner text default null,
  p_usda_description text default null,
  p_usda_data_type text default null,
  p_usda_serving_size numeric default null,
  p_usda_serving_size_unit text default null,
  p_created_by uuid default null
)
returns public.barcode_product_nutrition
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.barcode_product_nutrition;
begin
  if p_barcode is null or p_barcode !~ '^[0-9]{8,14}$' then
    raise exception 'invalid barcode';
  end if;
  if p_fdc_id is null or p_fdc_id <= 0 then
    raise exception 'a positive fdc_id is required for a verified product';
  end if;
  if not public.is_nonempty_nutrient_basis(p_nutrition_per_100g) then
    raise exception 'verified nutrition must have at least one known nutrient';
  end if;

  -- Secondary cache (same transaction as the authoritative write below).
  insert into public.usda_foods (
    fdc_id, description, data_type, brand_owner, serving_size, serving_size_unit,
    nutrition_per_100g, fetched_at, fetched_by
  ) values (
    p_fdc_id, coalesce(p_usda_description, p_description, ''), p_usda_data_type, p_brand_owner,
    p_usda_serving_size, p_usda_serving_size_unit, p_nutrition_per_100g, now(), p_created_by
  )
  on conflict (fdc_id) do update set
    description = excluded.description,
    data_type = excluded.data_type,
    brand_owner = excluded.brand_owner,
    serving_size = excluded.serving_size,
    serving_size_unit = excluded.serving_size_unit,
    nutrition_per_100g = excluded.nutrition_per_100g,
    fetched_at = now(),
    fetched_by = coalesce(p_created_by, public.usda_foods.fetched_by);

  -- Authoritative: the barcode's verified nutrition row. Overwrites an existing
  -- candidate; a re-verify just refreshes it.
  insert into public.barcode_product_nutrition (
    barcode, provider, source_product_id, nutrition_per_100g, status, fdc_id,
    description, brand_owner, source_fetched_at, created_by
  ) values (
    p_barcode, 'usda', p_fdc_id::text, p_nutrition_per_100g, 'verified', p_fdc_id,
    p_description, p_brand_owner, now(), p_created_by
  )
  on conflict (barcode) do update set
    provider = 'usda',
    source_product_id = excluded.source_product_id,
    nutrition_per_100g = excluded.nutrition_per_100g,
    status = 'verified',
    fdc_id = excluded.fdc_id,
    description = excluded.description,
    brand_owner = excluded.brand_owner,
    source_fetched_at = now()
  returning * into result;

  return result;
end;
$$;

comment on function public.upsert_verified_barcode_product is
  'SERVICE ROLE ONLY (not granted to authenticated). Called by the usda-lookup Edge Function after a server-side exact GTIN match. Atomically writes usda_foods (secondary cache) + the authoritative barcode_product_nutrition verified row. If it raises, the Edge Function does NOT return verified_match.';

revoke execute on function public.upsert_verified_barcode_product(
  text, bigint, jsonb, text, text, text, text, numeric, text, uuid
) from public;

grant execute on function public.upsert_verified_barcode_product(
  text, bigint, jsonb, text, text, text, text, numeric, text, uuid
) to service_role;
