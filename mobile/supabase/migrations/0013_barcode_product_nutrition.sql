-- Phase: persist product-specific nutrition for barcode-added pantry items.
--
-- After a barcode scan, SmartPrep should retain the best defensible nutrition
-- for that *specific product* so Pantry Detail keeps showing macros after the
-- review screen closes. Precedence, highest first:
--   1. exact USDA branded-food GTIN/UPC match  -> verified
--   2. Open Food Facts normalized per-100g     -> candidate
--   3. existing canonical-ingredient nutrition  -> its own status (fallback)
--   4. otherwise                                -> unresolved
--
-- ============================================================================
-- barcode_product_nutrition  - one GLOBAL row per normalized barcode
-- ============================================================================
-- A barcode identifies a product worldwide, so this cache is global reference
-- data (like usda_foods): every authenticated user reads it, nobody writes it
-- directly. It is NOT canonical_ingredient_nutrition - a branded product's
-- label ("Oikos Triple Zero Vanilla") must never contaminate the generic
-- ingredient ("Greek yogurt").
--
-- Writes go through exactly two authorized paths:
--   * upsert_barcode_product_candidate()  (security definer) - can only ever
--     write status='candidate' / provider='open_food_facts' / fdc_id=null.
--   * the usda-lookup Edge Function (service role) - the ONLY thing that can
--     set status='verified' + a real fdc_id, and only after a server-side
--     exact GTIN match.
-- A raw client has no insert/update/delete grant, so it cannot fake a verified
-- row or inject an fdc_id.

create table public.barcode_product_nutrition (
  id uuid primary key default gen_random_uuid(),
  -- Cache key: the normalized barcode SmartPrep scanned (digits only, UPC-E
  -- already expanded to UPC-A). UNIQUE so an OFF candidate row is later
  -- upgraded in place by an exact USDA match - never duplicated.
  barcode text not null unique check (barcode ~ '^[0-9]{8,14}$'),
  -- Which source the CURRENT values came from, and that source's own product id
  -- (OFF: the barcode; USDA: the fdc_id as text). Descriptive, not the key.
  provider text not null check (provider in ('open_food_facts', 'usda')),
  source_product_id text not null,
  nutrition_per_100g jsonb not null check (public.is_nonempty_nutrient_basis(nutrition_per_100g)),
  status text not null default 'candidate' check (status in ('candidate', 'verified')),
  -- The matched USDA FoodData Central id (provenance). NOT a FK - usda_foods is
  -- a separate best-effort cache and this row must not depend on that write
  -- landing first.
  fdc_id bigint,
  description text,
  brand_owner text,
  source_fetched_at timestamptz not null default now(),
  -- Informational only, never used for access control (mirrors usda_foods.fetched_by).
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 'verified' is reserved for a server-side exact USDA GTIN match with a real
  -- fdc_id. Anything the client-facing RPC writes is 'candidate'.
  constraint barcode_product_nutrition_verified_consistent check (
    (status = 'verified' and provider = 'usda' and fdc_id is not null)
    or status = 'candidate'
  )
);

comment on table public.barcode_product_nutrition is
  'Global per-barcode product nutrition cache. Reference data: readable by any authenticated user, never mutated directly from the client. status=verified only ever set by the usda-lookup Edge Function after an exact GTIN match. Distinct from canonical_ingredient_nutrition - product data never touches generic ingredient data.';

create index barcode_product_nutrition_fdc_idx on public.barcode_product_nutrition (fdc_id);

alter table public.barcode_product_nutrition enable row level security;

grant select on public.barcode_product_nutrition to authenticated;
-- No insert / update / delete grant for clients.

create policy "barcode_product_nutrition_read_authenticated" on public.barcode_product_nutrition
  for select
  to authenticated
  using (true);

create trigger barcode_product_nutrition_set_updated_at
  before update on public.barcode_product_nutrition
  for each row execute function public.set_updated_at();

-- ============================================================================
-- is_nonempty_nutrient_basis - a per-100g jsonb has >= 1 known nutrient
-- ============================================================================
-- Mirrors lib/nutrition/nutritionReference.ts#basisHasAnyNutrient + the numeric
-- guard in toNutrientBasis. Keep both in sync by hand (no cross-language import).
create function public.is_nonempty_nutrient_basis(basis jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  k text;
begin
  if basis is null or jsonb_typeof(basis) <> 'object' then
    return false;
  end if;
  foreach k in array array['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg']
  loop
    if basis ? k
      and jsonb_typeof(basis -> k) = 'number'
      and (basis ->> k)::numeric >= 0
    then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

comment on function public.is_nonempty_nutrient_basis is
  'True when a per-100g nutrition jsonb has at least one known, non-negative numeric nutrient. Backs the check on barcode_product_nutrition and gates upsert_barcode_product_candidate.';

-- ============================================================================
-- upsert_barcode_product_candidate - the ONLY client-facing write path
-- ============================================================================
-- security definer (RLS/grants cannot express "this write may only set
-- status='candidate'"): derives identity from auth.uid(), rejects anon, locks
-- search_path. Never overwrites an existing verified row. Can NEVER set
-- status='verified' or a non-null fdc_id.
create function public.upsert_barcode_product_candidate(
  p_barcode text,
  p_source_product_id text,
  p_nutrition_per_100g jsonb,
  p_description text default null,
  p_brand_owner text default null
)
returns public.barcode_product_nutrition
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.barcode_product_nutrition;
  result public.barcode_product_nutrition;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_barcode is null or p_barcode !~ '^[0-9]{8,14}$' then
    raise exception 'invalid barcode';
  end if;

  if not public.is_nonempty_nutrient_basis(p_nutrition_per_100g) then
    raise exception 'nutrition must have at least one known nutrient';
  end if;

  select * into existing from public.barcode_product_nutrition where barcode = p_barcode;
  if found and existing.status = 'verified' then
    -- A defensible USDA match already won - a client candidate never downgrades it.
    return existing;
  end if;

  insert into public.barcode_product_nutrition (
    barcode, provider, source_product_id, nutrition_per_100g, status, fdc_id, description, brand_owner,
    source_fetched_at, created_by
  ) values (
    p_barcode, 'open_food_facts', coalesce(p_source_product_id, p_barcode), p_nutrition_per_100g, 'candidate', null,
    p_description, p_brand_owner, now(), auth.uid()
  )
  on conflict (barcode) do update set
    provider = 'open_food_facts',
    source_product_id = excluded.source_product_id,
    nutrition_per_100g = excluded.nutrition_per_100g,
    description = excluded.description,
    brand_owner = excluded.brand_owner,
    source_fetched_at = now()
  where public.barcode_product_nutrition.status <> 'verified'
  returning * into result;

  if result.id is null then
    -- The row turned verified between the select and the upsert; return it as-is.
    select * into result from public.barcode_product_nutrition where barcode = p_barcode;
  end if;

  return result;
end;
$$;

comment on function public.upsert_barcode_product_candidate is
  'security definer: the only client-callable write to barcode_product_nutrition. Writes status=candidate / provider=open_food_facts / fdc_id=null only, and never overwrites a verified row. Cannot be used to spoof a USDA-verified product.';

grant execute on function public.upsert_barcode_product_candidate(text, text, jsonb, text, text) to authenticated;
revoke execute on function public.upsert_barcode_product_candidate(text, text, jsonb, text, text) from public;
