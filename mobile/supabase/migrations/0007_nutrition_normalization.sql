-- Phase 4: nutrition normalization foundation.
--
-- Three tables, no RPC. The unit taxonomy and gram-conversion engine live in
-- the client (lib/nutrition/*) because they are pure math over authored
-- metadata; the database only holds the things that must be shared or
-- owner-scoped:
--
--   usda_foods                     A cache of normalized USDA FoodData Central
--                                  food details, keyed by fdc_id. Written ONLY
--                                  by the usda-lookup Edge Function (which uses
--                                  the service role and so bypasses RLS).
--                                  Reference data - every authenticated user
--                                  reads the same rows; no client writes.
--
--   canonical_ingredient_nutrition The per-100g nutrition reference for a
--                                  catalog ingredient, with an explicit
--                                  verification status. Global reference data:
--                                  authenticated users read it, NOBODY mutates
--                                  it through the client (seeded here; a future
--                                  admin/confirm flow would manage changes).
--
--   user_ingredient_overrides      Per-user tweaks to an ingredient's nutrition
--                                  basis and/or conversion metadata. Fully
--                                  owner-scoped CRUD.
--
-- Verification model (no AI, no fuzzy matching in this phase):
--   estimated  - an authored approximation (the seed rows below, or a user
--                override with no USDA backing)
--   candidate  - a USDA fdc_id is linked but the match has not been confirmed
--                by a defensible rule or a human
--   verified   - reserved for an exact/canonical USDA match or an explicit
--                confirmation; nothing in this migration sets it
--
-- nutrition_per_100g jsonb shape (all keys optional; unknown = absent, never 0):
--   { "calories": n, "proteinG": n, "carbsG": n, "fatG": n,
--     "fiberG": n, "sugarG": n, "sodiumMg": n }

-- ============================================================================
-- usda_foods - normalized USDA FDC cache
-- ============================================================================

create table public.usda_foods (
  fdc_id bigint primary key,
  description text not null,
  data_type text,
  brand_owner text,
  serving_size numeric,
  serving_size_unit text,
  nutrition_per_100g jsonb not null,
  fetched_at timestamptz not null default now(),
  -- Informational: which user's lookup populated this row. Never used for access control.
  fetched_by uuid references auth.users (id) on delete set null
);

comment on table public.usda_foods is
  'Normalized cache of USDA FoodData Central food details. Written only by the usda-lookup Edge Function (service role). Reference data - readable by any authenticated user, never mutated from the client.';

alter table public.usda_foods enable row level security;

grant select on public.usda_foods to authenticated;

-- Read-only for authenticated users; the Edge Function writes with the service
-- role, which is exempt from RLS.
create policy "usda_foods_read_authenticated" on public.usda_foods
  for select
  to authenticated
  using (true);

-- ============================================================================
-- canonical_ingredient_nutrition - global per-100g reference
-- ============================================================================

create table public.canonical_ingredient_nutrition (
  canonical_ingredient_id text primary key,
  fdc_id bigint references public.usda_foods (fdc_id) on delete set null,
  nutrition_per_100g jsonb not null,
  status text not null default 'estimated'
    check (status in ('estimated', 'candidate', 'verified')),
  match_rule text,
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canonical_ingredient_nutrition_verified_consistent check (
    (status = 'verified' and verified_at is not null)
    or (status <> 'verified')
  )
);

comment on table public.canonical_ingredient_nutrition is
  'Global per-100g nutrition reference for a catalog ingredient id. Readable by any authenticated user; no client insert/update/delete grant - changes are made by migration or a future admin/confirm flow only.';

alter table public.canonical_ingredient_nutrition enable row level security;

grant select on public.canonical_ingredient_nutrition to authenticated;

create policy "canonical_ingredient_nutrition_read_authenticated" on public.canonical_ingredient_nutrition
  for select
  to authenticated
  using (true);

-- Seed a small, stable, hand-authored set (status 'estimated', no fdc link).
-- These values are approximations from public USDA reference data and do not
-- drift, so seeding them here is safe. The client catalog carries its own
-- per-100g fallbacks for everything else.
insert into public.canonical_ingredient_nutrition (canonical_ingredient_id, nutrition_per_100g, status, match_rule) values
  ('ing-chicken-breast', '{"calories":165,"proteinG":31,"carbsG":0,"fatG":3.6,"fiberG":0,"sugarG":0,"sodiumMg":74}'::jsonb, 'estimated', 'authored_estimate'),
  ('ing-eggs',           '{"calories":143,"proteinG":12.6,"carbsG":0.7,"fatG":9.5,"fiberG":0,"sugarG":0.4,"sodiumMg":142}'::jsonb, 'estimated', 'authored_estimate'),
  ('ing-milk',           '{"calories":61,"proteinG":3.2,"carbsG":4.8,"fatG":3.3,"fiberG":0,"sugarG":5.1,"sodiumMg":43}'::jsonb, 'estimated', 'authored_estimate'),
  ('ing-olive-oil',      '{"calories":884,"proteinG":0,"carbsG":0,"fatG":100,"fiberG":0,"sugarG":0,"sodiumMg":2}'::jsonb, 'estimated', 'authored_estimate'),
  ('ing-rice',           '{"calories":365,"proteinG":7.1,"carbsG":80,"fatG":0.7,"fiberG":1.3,"sugarG":0.1,"sodiumMg":5}'::jsonb, 'estimated', 'authored_estimate'),
  ('ing-pasta',          '{"calories":371,"proteinG":13,"carbsG":74.7,"fatG":1.5,"fiberG":3.2,"sugarG":2.7,"sodiumMg":6}'::jsonb, 'estimated', 'authored_estimate'),
  ('ing-butter',         '{"calories":717,"proteinG":0.85,"carbsG":0.06,"fatG":81,"fiberG":0,"sugarG":0.06,"sodiumMg":11}'::jsonb, 'estimated', 'authored_estimate'),
  ('ing-ground-beef',    '{"calories":254,"proteinG":17.2,"carbsG":0,"fatG":20,"fiberG":0,"sugarG":0,"sodiumMg":66}'::jsonb, 'estimated', 'authored_estimate');

create trigger canonical_ingredient_nutrition_set_updated_at
  before update on public.canonical_ingredient_nutrition
  for each row execute function public.set_updated_at();

-- ============================================================================
-- user_ingredient_overrides - per-user nutrition / conversion tweaks
-- ============================================================================

create table public.user_ingredient_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  canonical_ingredient_id text not null,
  -- At least one of these should be meaningful; the app decides what to send.
  nutrition_per_100g jsonb,
  grams_per_unit jsonb,
  density_g_per_ml numeric check (density_g_per_ml is null or density_g_per_ml > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_ingredient_id)
);

comment on table public.user_ingredient_overrides is
  'Per-user overrides for an ingredient nutrition basis and/or conversion metadata. Fully owner-scoped.';

create index user_ingredient_overrides_user_idx on public.user_ingredient_overrides (user_id);

alter table public.user_ingredient_overrides enable row level security;

grant select, insert, update, delete on public.user_ingredient_overrides to authenticated;

create policy "user_ingredient_overrides_select_own" on public.user_ingredient_overrides
  for select using (auth.uid() = user_id);

create policy "user_ingredient_overrides_insert_own" on public.user_ingredient_overrides
  for insert with check (auth.uid() = user_id);

create policy "user_ingredient_overrides_update_own" on public.user_ingredient_overrides
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_ingredient_overrides_delete_own" on public.user_ingredient_overrides
  for delete using (auth.uid() = user_id);

create trigger user_ingredient_overrides_set_updated_at
  before update on public.user_ingredient_overrides
  for each row execute function public.set_updated_at();
