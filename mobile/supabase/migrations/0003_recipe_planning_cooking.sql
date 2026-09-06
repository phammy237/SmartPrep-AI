-- Phase 3: meal planning, saved recipes, cooking events, pantry deductions,
-- prepared servings, and consumed nutrition logging.
--
-- Central invariant this migration exists to enforce: saving a recipe,
-- planning a meal, starting/completing cooking, preparing servings,
-- consuming food, and logging nutrition are six DIFFERENT events. A planned
-- meal never counts toward consumed calories/macros; completing a cooking
-- event never implies every prepared serving was eaten; pantry deductions
-- reflect the whole cooked batch, not just what was eaten; meal_logs are
-- immutable historical snapshots that never move when a recipe changes later.
--
-- Recipe identity vs. immutable versions: `recipes` is stable identity +
-- provenance, `recipe_versions` is the immutable content (title, servings,
-- instructions, nutrition snapshot) that planning/cooking/logging always
-- reference by exact version id, never by the mutable "current" recipe.
-- Phase 4 (USDA) and Phase 5 (external recipes / AI adaptation) are NOT
-- implemented here - nutrition_status is 'estimated' or 'incomplete' for
-- every recipe seeded in this phase, never 'verified'.

-- ============================================================================
-- Shared nutrition snapshot contract
--
-- One jsonb shape, reused by recipe_versions.nutrition_snapshot,
-- prepared_meals.{nutrition_snapshot,nutrition_per_serving,nutrition_per_gram}
-- and meal_logs.nutrition_snapshot. Mirrors lib/validation/nutritionSchemas.ts
-- on the client - keep both in sync by hand (Postgres has no import).
--
-- Every nutrient (calories/proteinG/carbsG/fatG/fiberG/sugarG/sodiumMg) is
-- OPTIONAL - absent or JSON null means genuinely unknown, never coerced to
-- zero. Only `status` is required. At least one nutrient must be known (an
-- all-unknown snapshot is meaningless). This is deliberately looser than
-- "calories/protein/carbs/fat always required" so that incomplete recipe
-- nutrition and a calories-only quick-add both remain valid, honest records
-- instead of being forced to fabricate the missing fields as 0.
-- ============================================================================

create function public.is_valid_nutrition_snapshot(snapshot jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
immutable
as $$
declare
  k text;
  has_known boolean := false;
begin
  if snapshot is null or jsonb_typeof(snapshot) <> 'object' then
    return false;
  end if;

  if not (snapshot ? 'status') or (snapshot ->> 'status') not in ('verified', 'estimated', 'incomplete') then
    return false;
  end if;

  foreach k in array array['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg']
  loop
    if snapshot ? k and jsonb_typeof(snapshot -> k) is distinct from 'null' then
      if jsonb_typeof(snapshot -> k) <> 'number' then
        return false;
      end if;
      if (snapshot ->> k)::numeric < 0 then
        return false;
      end if;
      has_known := true;
    end if;
  end loop;

  return has_known;
end;
$$;

comment on function public.is_valid_nutrition_snapshot is
  'Backs a check constraint on every nutrition-snapshot jsonb column. Requires status + at least one known, non-negative, finite nutrient; every nutrient is otherwise nullable/absent (unknown, never fabricated as zero).';

-- Deterministically scales every known nutrient by `factor`, leaving unknown
-- (absent/null) nutrients untouched - used by complete_cooking_event and
-- log_prepared_meal_consumption so a serving's nutrition is always derived
-- from the recipe's per-serving snapshot, never re-estimated ad hoc.
create function public.scale_nutrition_snapshot(snapshot jsonb, factor numeric)
returns jsonb
language plpgsql
security invoker
set search_path = ''
immutable
as $$
declare
  k text;
  result jsonb := snapshot;
begin
  foreach k in array array['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg']
  loop
    if snapshot ? k and jsonb_typeof(snapshot -> k) = 'number' then
      result := jsonb_set(result, array[k], to_jsonb((snapshot ->> k)::numeric * factor));
    end if;
  end loop;
  return result;
end;
$$;

comment on function public.scale_nutrition_snapshot is
  'Scales only the known numeric fields of a nutrition snapshot by factor; absent/null fields stay absent/null. Pure and deterministic.';

-- ============================================================================
-- recipes - stable identity + provenance. Immutable content lives in
-- recipe_versions below.
-- ============================================================================

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('demo', 'user_created', 'external', 'ai_generated')),
  source_provider text,
  external_source_id text,
  source_url text,
  attribution text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  trust_label text not null check (
    trust_label in ('source_tested', 'community_tested', 'ai_experimental', 'user_created', 'demo')
  ),
  -- Idempotency key for the 0004 seed migration only - lets it be re-run
  -- safely. Not part of the app's public API.
  legacy_mock_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.recipes is
  'Stable recipe identity and provenance. owner_id is null for system/catalog recipes (demo seed) - never implies a real user identity is exposed. No client insert/update/delete grant in Phase 3: no recipe-authoring UI exists yet, all rows come from the 0004 seed migration.';

create index recipes_owner_id_idx on public.recipes (owner_id);

alter table public.recipes enable row level security;

create policy "recipes_select_visible" on public.recipes
  for select
  using (visibility = 'public' or owner_id = auth.uid());

grant select on public.recipes to authenticated;

-- ============================================================================
-- recipe_versions - immutable content. Planning/cooking/logging always
-- reference an exact version id, never "the recipe" generically.
-- ============================================================================

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  parent_version_id uuid references public.recipe_versions (id),
  version_number integer not null check (version_number > 0),
  title text not null,
  description text,
  servings numeric not null check (servings > 0),
  prep_time_minutes integer check (prep_time_minutes >= 0),
  cook_time_minutes integer check (cook_time_minutes >= 0),
  instructions text[] not null default '{}',
  image_uri text,
  nutrition_status text not null check (nutrition_status in ('verified', 'estimated', 'incomplete')),
  nutrition_snapshot jsonb not null check (public.is_valid_nutrition_snapshot(nutrition_snapshot)),
  source_metadata jsonb not null default '{}'::jsonb,
  version_reason text not null default 'initial',

  -- Static, authored-at-seed-time display/curation copy - NOT a
  -- recommendation or ranking system (none exists in Phase 3 or before).
  -- Kept here only so RecipeCard/RecipeDetailScreen/RecipeDiscoveryScreen
  -- don't need a redesign; smartMatchScore itself is computed at read time
  -- from live pantry overlap and is not stored.
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  additional_cost_estimate numeric check (additional_cost_estimate >= 0),
  tags text[] not null default '{}',
  cuisines text[] not null default '{}',
  collections text[] not null default '{}',
  demo_reasons jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  unique (recipe_id, version_number)
);

comment on table public.recipe_versions is
  'Immutable once created - no client insert/update/delete grant exists (select-only). nutrition_status is estimated/incomplete for every Phase 3 recipe, never verified (no USDA integration yet).';

create index recipe_versions_recipe_id_idx on public.recipe_versions (recipe_id);

alter table public.recipe_versions enable row level security;

create policy "recipe_versions_select_visible" on public.recipe_versions
  for select
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_versions.recipe_id
        and (r.visibility = 'public' or r.owner_id = auth.uid())
    )
  );

grant select on public.recipe_versions to authenticated;

-- ============================================================================
-- recipe_ingredients - structured ingredients for a specific recipe_version.
-- ============================================================================

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null references public.recipe_versions (id) on delete cascade,
  display_name text not null,
  normalized_name text not null,
  quantity numeric check (quantity >= 0),
  unit text check (
    unit in ('item', 'container', 'bag', 'bottle', 'can', 'package', 'serving', 'g', 'kg', 'oz', 'lb', 'ml', 'L')
  ),
  estimated_grams numeric check (estimated_grams >= 0),
  preparation text,
  -- Suggestion-only hint (matches the app's ingredient-catalog id space when
  -- known) for proposing a pantry match in the cooking-flow review UI. Never
  -- used to silently deduct - see cooking_event_ingredients for the actual,
  -- user-confirmed per-cooking-event mapping.
  catalog_ingredient_id text,
  is_optional boolean not null default false,
  -- A pantry staple (salt, oil, etc.) is assumed on-hand and excluded from
  -- "missing ingredient" counts - distinct from is_optional (an ingredient
  -- the recipe itself marks as skippable). Carries over the existing
  -- RecipeIngredient.isPantryStaple behavior from the mock data.
  is_pantry_staple boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.recipe_ingredients is
  'Immutable alongside its recipe_version - select-only for clients. No gram conversions are fabricated: estimated_grams is null unless a defensible value was authored at seed time.';

create index recipe_ingredients_recipe_version_id_idx on public.recipe_ingredients (recipe_version_id);

alter table public.recipe_ingredients enable row level security;

create policy "recipe_ingredients_select_visible" on public.recipe_ingredients
  for select
  using (
    exists (
      select 1
      from public.recipe_versions rv
      join public.recipes r on r.id = rv.recipe_id
      where rv.id = recipe_ingredients.recipe_version_id
        and (r.visibility = 'public' or r.owner_id = auth.uid())
    )
  );

grant select on public.recipe_ingredients to authenticated;

-- ============================================================================
-- saved_recipes - user-to-exact-version bookmark. Single table, no cross-
-- table invariant, so plain RLS-scoped CRUD is enough (no RPC needed).
-- ============================================================================

create table public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_version_id uuid not null references public.recipe_versions (id) on delete cascade,
  saved_at timestamptz not null default now(),
  notes text,
  unique (user_id, recipe_version_id)
);

comment on table public.saved_recipes is
  'Save/unsave is idempotent via the (user_id, recipe_version_id) unique constraint - repeated save requests upsert onto the same row rather than erroring.';

create index saved_recipes_user_id_idx on public.saved_recipes (user_id);

alter table public.saved_recipes enable row level security;

create policy "saved_recipes_select_own" on public.saved_recipes
  for select using (auth.uid() = user_id);

create policy "saved_recipes_insert_own" on public.saved_recipes
  for insert with check (auth.uid() = user_id);

create policy "saved_recipes_update_own" on public.saved_recipes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "saved_recipes_delete_own" on public.saved_recipes
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.saved_recipes to authenticated;

-- ============================================================================
-- meal_plan_items - planning only. Never creates a meal_log by itself, even
-- when marked 'completed' - that is the whole point of keeping planning and
-- consumption as separate tables. Plain RLS-scoped CRUD: no cross-table
-- invariant needs an RPC here.
-- ============================================================================

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scheduled_date date not null,
  scheduled_time time,
  timezone text not null default 'UTC',
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_version_id uuid not null references public.recipe_versions (id),
  planned_servings numeric not null check (planned_servings > 0),
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meal_plan_items_user_date_idx on public.meal_plan_items (user_id, scheduled_date);

alter table public.meal_plan_items enable row level security;

create policy "meal_plan_items_select_own" on public.meal_plan_items
  for select using (auth.uid() = user_id);

create policy "meal_plan_items_insert_own" on public.meal_plan_items
  for insert with check (auth.uid() = user_id);

create policy "meal_plan_items_update_own" on public.meal_plan_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "meal_plan_items_delete_own" on public.meal_plan_items
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.meal_plan_items to authenticated;

create trigger meal_plan_items_set_updated_at
  before update on public.meal_plan_items
  for each row execute function public.set_updated_at();

-- ============================================================================
-- cooking_events - the cooking lifecycle. Zero plain client insert/update
-- grant: 'started' -> 'completed' is a security-relevant state transition
-- (it gates pantry deduction + prepared-meal creation) that column grants
-- alone can't safely express, so - mirroring the pantry_items quantity/
-- status precedent from Phase 2 - every mutation goes through one of the
-- three security-definer RPCs below.
-- ============================================================================

create table public.cooking_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_version_id uuid not null references public.recipe_versions (id),
  meal_plan_item_id uuid references public.meal_plan_items (id) on delete set null,
  status text not null default 'started' check (status in ('started', 'completed', 'cancelled')),
  planned_servings numeric not null check (planned_servings > 0),
  actual_servings_prepared numeric check (actual_servings_prepared > 0),
  final_batch_weight_g numeric check (final_batch_weight_g >= 0),
  pantry_deduction_status text not null default 'pending' check (pantry_deduction_status in ('pending', 'applied', 'skipped')),
  idempotency_key text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

comment on table public.cooking_events is
  'Created only by an explicit "Start Cooking" user action (never by rendering/navigating to a cook screen) via start_cooking_event, which is idempotency-keyed so a retry never creates a duplicate row.';

create index cooking_events_user_id_idx on public.cooking_events (user_id);
create index cooking_events_meal_plan_item_id_idx on public.cooking_events (meal_plan_item_id);

alter table public.cooking_events enable row level security;

create policy "cooking_events_select_own" on public.cooking_events
  for select using (auth.uid() = user_id);

grant select on public.cooking_events to authenticated;

create trigger cooking_events_set_updated_at
  before update on public.cooking_events
  for each row execute function public.set_updated_at();

-- ============================================================================
-- cooking_event_ingredients - durable, user-reviewable pantry-deduction
-- ledger for one cooking event. Written only by complete_cooking_event.
-- ============================================================================

create table public.cooking_event_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cooking_event_id uuid not null references public.cooking_events (id) on delete cascade,
  recipe_ingredient_id uuid not null references public.recipe_ingredients (id),
  pantry_item_id uuid references public.pantry_items (id),
  requested_quantity numeric not null check (requested_quantity >= 0),
  requested_unit text,
  deducted_quantity numeric not null default 0 check (deducted_quantity >= 0),
  deducted_unit text,
  estimated_grams numeric check (estimated_grams >= 0),
  match_confidence text check (match_confidence in ('exact', 'likely', 'uncertain', 'none')),
  user_confirmed boolean not null default false,
  was_skipped boolean not null default false,
  pantry_event_id uuid references public.pantry_events (id),
  created_at timestamptz not null default now()
);

comment on table public.cooking_event_ingredients is
  'No client insert/update/delete grant - written only by complete_cooking_event, so a deduction record can never be forged from the client. was_skipped/pantry_item_id null both mean "no deduction happened for this ingredient".';

create index cooking_event_ingredients_cooking_event_id_idx on public.cooking_event_ingredients (cooking_event_id);
create index cooking_event_ingredients_user_id_idx on public.cooking_event_ingredients (user_id);

alter table public.cooking_event_ingredients enable row level security;

create policy "cooking_event_ingredients_select_own" on public.cooking_event_ingredients
  for select using (auth.uid() = user_id);

grant select on public.cooking_event_ingredients to authenticated;

-- ============================================================================
-- prepared_meals - leftover/prepared-serving balance. Created only by
-- complete_cooking_event; only ever decreases, via log_prepared_meal_consumption.
-- ============================================================================

create table public.prepared_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cooking_event_id uuid not null references public.cooking_events (id) on delete cascade,
  recipe_version_id uuid not null references public.recipe_versions (id),
  total_servings_prepared numeric not null check (total_servings_prepared > 0),
  servings_remaining numeric not null check (servings_remaining >= 0),
  total_batch_weight_g numeric check (total_batch_weight_g >= 0),
  remaining_batch_weight_g numeric check (remaining_batch_weight_g >= 0),
  nutrition_snapshot jsonb not null check (public.is_valid_nutrition_snapshot(nutrition_snapshot)),
  nutrition_per_serving jsonb not null check (public.is_valid_nutrition_snapshot(nutrition_per_serving)),
  nutrition_per_gram jsonb check (nutrition_per_gram is null or public.is_valid_nutrition_snapshot(nutrition_per_gram)),
  prepared_at timestamptz not null default now(),
  storage_location text check (storage_location in ('fridge', 'freezer', 'pantry', 'counter', 'other')),
  use_by_date date,
  status text not null default 'available' check (status in ('available', 'consumed', 'discarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prepared_meals_remaining_le_total check (servings_remaining <= total_servings_prepared),
  constraint prepared_meals_weight_remaining_le_total check (
    remaining_batch_weight_g is null or total_batch_weight_g is null or remaining_batch_weight_g <= total_batch_weight_g
  )
);

comment on table public.prepared_meals is
  'No client insert/update/delete grant. nutrition_per_gram is null unless a batch weight was provided at completion time - never a fabricated conversion. status=discarded is schema-supported but has no Phase 3 UI path (reserved, like pantry_events donated/traded in Phase 2).';

create index prepared_meals_user_id_idx on public.prepared_meals (user_id, status);
create index prepared_meals_cooking_event_id_idx on public.prepared_meals (cooking_event_id);

alter table public.prepared_meals enable row level security;

create policy "prepared_meals_select_own" on public.prepared_meals
  for select using (auth.uid() = user_id);

grant select on public.prepared_meals to authenticated;

create trigger prepared_meals_set_updated_at
  before update on public.prepared_meals
  for each row execute function public.set_updated_at();

-- ============================================================================
-- meal_logs - immutable consumed-nutrition history. No client insert/delete
-- grant at all (RPC-only insert). Clients may only ever set voided_at +
-- void_reason, once, via the restricted column grant + trigger below -
-- "deletion" in the UI is really a soft void, never a hard delete.
-- Replacement logs (corrections) are only ever created by correct_meal_log,
-- never by a client-supplied replaced_by_log_id.
-- ============================================================================

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consumed_at timestamptz not null default now(),
  local_date date not null,
  timezone text not null default 'UTC',
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_version_id uuid references public.recipe_versions (id),
  cooking_event_id uuid references public.cooking_events (id),
  prepared_meal_id uuid references public.prepared_meals (id),
  servings_consumed numeric check (servings_consumed > 0),
  grams_consumed numeric check (grams_consumed > 0),
  nutrition_snapshot jsonb not null check (public.is_valid_nutrition_snapshot(nutrition_snapshot)),
  nutrition_status text not null check (nutrition_status in ('verified', 'estimated', 'incomplete')),
  log_source text not null check (log_source in ('cooking_flow', 'prepared_meal', 'quick_add', 'manual')),
  notes text,
  idempotency_key text,
  voided_at timestamptz,
  void_reason text,
  replaced_by_log_id uuid references public.meal_logs (id),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

comment on table public.meal_logs is
  'Immutable historical nutrition records - totals must always read nutrition_snapshot, never join back to the live recipe. quick_add rows have no recipe/servings; manual rows are currently only produced by correct_meal_log (no standalone manual-entry UI in Phase 3).';

create index meal_logs_user_local_date_idx on public.meal_logs (user_id, local_date);
create index meal_logs_user_id_idx on public.meal_logs (user_id);

alter table public.meal_logs enable row level security;

create policy "meal_logs_select_own" on public.meal_logs
  for select using (auth.uid() = user_id);

create policy "meal_logs_void_own" on public.meal_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Column-level grant: the ONLY columns a plain client update may ever touch.
-- Ownership, timestamps, source references, quantities, the nutrition
-- snapshot, idempotency key, and replaced_by_log_id are excluded entirely,
-- so a direct client .update() can never alter them regardless of RLS - see
-- protect_meal_log_immutability below for the second layer (also blocks
-- re-voiding/un-voiding, and is what actually lets the security-definer
-- correct_meal_log RPC set replaced_by_log_id despite clients not having
-- a column grant for it - definer functions run with the owner's privileges).
grant select on public.meal_logs to authenticated;
grant update (voided_at, void_reason) on public.meal_logs to authenticated;
-- No insert/delete grant for clients - see the RPCs below.

create function public.protect_meal_log_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id
    or new.consumed_at <> old.consumed_at
    or new.local_date <> old.local_date
    or new.timezone <> old.timezone
    or new.meal_type <> old.meal_type
    or coalesce(new.recipe_version_id::text, '') <> coalesce(old.recipe_version_id::text, '')
    or coalesce(new.cooking_event_id::text, '') <> coalesce(old.cooking_event_id::text, '')
    or coalesce(new.prepared_meal_id::text, '') <> coalesce(old.prepared_meal_id::text, '')
    or coalesce(new.servings_consumed, -1) <> coalesce(old.servings_consumed, -1)
    or coalesce(new.grams_consumed, -1) <> coalesce(old.grams_consumed, -1)
    or new.nutrition_snapshot <> old.nutrition_snapshot
    or new.nutrition_status <> old.nutrition_status
    or new.log_source <> old.log_source
    or coalesce(new.notes, '') <> coalesce(old.notes, '')
    or coalesce(new.idempotency_key, '') <> coalesce(old.idempotency_key, '')
    or new.created_at <> old.created_at
  then
    raise exception 'meal_logs rows are immutable except for voiding (voided_at/void_reason) and one-time correction linkage (replaced_by_log_id)';
  end if;

  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'a voided meal_logs row cannot be re-voided or un-voided';
  end if;

  if old.void_reason is not null and new.void_reason is distinct from old.void_reason then
    raise exception 'void_reason cannot be changed once set';
  end if;

  if old.replaced_by_log_id is not null and new.replaced_by_log_id is distinct from old.replaced_by_log_id then
    raise exception 'replaced_by_log_id cannot be changed once set';
  end if;

  if new.voided_at is not null and new.void_reason is null then
    raise exception 'void_reason is required when voiding a meal log';
  end if;

  return new;
end;
$$;

comment on function public.protect_meal_log_immutability is
  'security invoker: only needs the calling context''s own already-granted UPDATE privilege. Allows voided_at/void_reason to be set once (plain clients, via the column grant above) and replaced_by_log_id to be set once (correct_meal_log RPC only, since plain clients have no column grant for it) - every other column, and every one of those three once set, is frozen.';

create trigger meal_logs_protect_immutability
  before update on public.meal_logs
  for each row execute function public.protect_meal_log_immutability();

-- ============================================================================
-- Compound-mutation RPCs.
--
-- All six are security definer, for the same reason Phase 2's five pantry
-- RPCs are: RLS/column-grants can express per-row ownership, but not
-- "this state transition is only valid together with these other inserts"
-- (cooking_events status, pantry deduction + ledger + prepared_meals
-- creation, prepared_meals balance + meal_logs insert, meal_logs
-- correction linkage). Every function below derives identity from
-- auth.uid(), rejects a null auth.uid() (anonymous), re-checks row
-- ownership with an explicit `where user_id = auth.uid()` (RLS does not
-- apply inside a security-definer function - this is the entire
-- authorization boundary), and locks search_path to '' with every
-- reference schema-qualified so no same-named object on another
-- search_path can be substituted in. Execute is granted to `authenticated`
-- only and explicitly revoked from `public` (Postgres grants EXECUTE on new
-- functions to PUBLIC by default - anon never receives an explicit grant,
-- so the revoke below is what actually keeps it out).
-- ============================================================================

-- start_cooking_event: the ONLY way a cooking_events row is created - never
-- as a side effect of navigating to or rendering a cook screen, only from an
-- explicit "Start Cooking" press. Idempotency-keyed (the client generates
-- and reuses one stable key for the lifetime of that press) so a retry after
-- a dropped response returns the same row instead of creating a duplicate.
create function public.start_cooking_event(
  p_recipe_version_id uuid,
  p_meal_plan_item_id uuid default null,
  p_planned_servings numeric default null,
  p_idempotency_key text default null
)
returns public.cooking_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.cooking_events;
  key text;
  recipe_visibility text;
  recipe_owner uuid;
  recipe_servings numeric;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  key := coalesce(p_idempotency_key, gen_random_uuid()::text);

  select * into result from public.cooking_events
  where user_id = auth.uid() and idempotency_key = key;
  if found then
    return result;
  end if;

  select r.visibility, r.owner_id, rv.servings
  into recipe_visibility, recipe_owner, recipe_servings
  from public.recipe_versions rv
  join public.recipes r on r.id = rv.recipe_id
  where rv.id = p_recipe_version_id;

  if not found or (recipe_visibility <> 'public' and recipe_owner is distinct from auth.uid()) then
    raise exception 'recipe version not found or not visible';
  end if;

  if p_planned_servings is not null and p_planned_servings <= 0 then
    raise exception 'planned servings must be greater than zero';
  end if;

  if p_meal_plan_item_id is not null and not exists (
    select 1 from public.meal_plan_items where id = p_meal_plan_item_id and user_id = auth.uid()
  ) then
    raise exception 'meal plan item not found';
  end if;

  insert into public.cooking_events (
    user_id, recipe_version_id, meal_plan_item_id, planned_servings, idempotency_key
  ) values (
    auth.uid(), p_recipe_version_id, p_meal_plan_item_id, coalesce(p_planned_servings, recipe_servings), key
  )
  returning * into result;

  return result;
end;
$$;

comment on function public.start_cooking_event is 'security definer: see justification comment above this RPC section.';

-- cancel_cooking_event: only from 'started'. No pantry/meal_log side effects
-- are possible at that point (they only ever happen inside
-- complete_cooking_event), so cancelling is a pure status transition.
create function public.cancel_cooking_event(
  p_cooking_event_id uuid,
  p_reason text default null
)
returns public.cooking_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.cooking_events;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into result from public.cooking_events
  where id = p_cooking_event_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'cooking event not found';
  end if;

  if result.status <> 'started' then
    raise exception 'only a started cooking event can be cancelled (current status: %)', result.status;
  end if;

  update public.cooking_events
  set status = 'cancelled'
  where id = p_cooking_event_id and user_id = auth.uid()
  returning * into result;

  return result;
end;
$$;

comment on function public.cancel_cooking_event is 'security definer: see justification comment above this RPC section.';

-- complete_cooking_event: the big atomic operation. p_deductions is a jsonb
-- array of client-proposed, user-reviewed deductions, each shaped
-- {recipeIngredientId, pantryItemId, requestedQuantity, requestedUnit,
--  deductedQuantity, deductedUnit, estimatedGrams, matchConfidence,
--  userConfirmed, wasSkipped}. Any single invalid/insufficient/unconfirmed
-- deduction raises, aborting the entire function (and therefore every
-- change it made) as one transaction - there is no partial-completion state.
create function public.complete_cooking_event(
  p_cooking_event_id uuid,
  p_actual_servings_prepared numeric,
  p_deductions jsonb default '[]'::jsonb,
  p_final_batch_weight_g numeric default null,
  p_servings_consumed_now numeric default 0,
  p_meal_type text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.cooking_events;
  recipe_row public.recipe_versions;
  user_timezone text;
  deduction jsonb;
  v_recipe_ingredient_id uuid;
  v_pantry_item_id uuid;
  v_deducted_qty numeric;
  v_deducted_unit text;
  v_requested_qty numeric;
  v_requested_unit text;
  v_estimated_g numeric;
  v_match_conf text;
  v_user_confirmed boolean;
  v_was_skipped boolean;
  pantry_row public.pantry_items;
  new_pantry_qty numeric;
  new_pantry_status text;
  new_pantry_event_id uuid;
  any_deduction_applied boolean := false;
  per_serving_nutrition jsonb;
  batch_nutrition jsonb;
  per_gram_nutrition jsonb;
  prepared_meal_row public.prepared_meals;
  servings_remaining numeric;
  remaining_weight numeric;
  log_row public.meal_logs;
  local_day date;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_actual_servings_prepared is null or p_actual_servings_prepared <= 0 then
    raise exception 'actual servings prepared must be greater than zero';
  end if;

  if p_servings_consumed_now is null or p_servings_consumed_now < 0 then
    raise exception 'servings consumed now cannot be negative';
  end if;

  if p_servings_consumed_now > p_actual_servings_prepared then
    raise exception 'cannot consume more servings than were prepared';
  end if;

  if p_servings_consumed_now > 0 and p_meal_type is null then
    raise exception 'meal_type is required when logging servings consumed now';
  end if;

  select * into event_row
  from public.cooking_events
  where id = p_cooking_event_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'cooking event not found';
  end if;

  if event_row.status <> 'started' then
    raise exception 'cooking event already completed or cancelled (status: %)', event_row.status;
  end if;

  select * into recipe_row from public.recipe_versions where id = event_row.recipe_version_id;
  if not found then
    raise exception 'recipe version not found';
  end if;

  select coalesce(timezone, 'UTC') into user_timezone from public.profiles where id = auth.uid();
  user_timezone := coalesce(user_timezone, 'UTC');

  for deduction in select * from jsonb_array_elements(coalesce(p_deductions, '[]'::jsonb))
  loop
    v_recipe_ingredient_id := (deduction ->> 'recipeIngredientId')::uuid;
    v_pantry_item_id := nullif(deduction ->> 'pantryItemId', '')::uuid;
    v_requested_qty := nullif(deduction ->> 'requestedQuantity', '')::numeric;
    v_requested_unit := deduction ->> 'requestedUnit';
    v_deducted_qty := coalesce(nullif(deduction ->> 'deductedQuantity', '')::numeric, 0);
    v_deducted_unit := deduction ->> 'deductedUnit';
    v_estimated_g := nullif(deduction ->> 'estimatedGrams', '')::numeric;
    v_match_conf := deduction ->> 'matchConfidence';
    v_user_confirmed := coalesce((deduction ->> 'userConfirmed')::boolean, false);
    v_was_skipped := coalesce((deduction ->> 'wasSkipped')::boolean, false);

    if v_recipe_ingredient_id is null then
      raise exception 'each deduction requires a recipeIngredientId';
    end if;

    if not exists (
      select 1 from public.recipe_ingredients
      where id = v_recipe_ingredient_id and recipe_version_id = event_row.recipe_version_id
    ) then
      raise exception 'recipe ingredient % does not belong to this recipe version', v_recipe_ingredient_id;
    end if;

    new_pantry_event_id := null;

    if v_was_skipped or v_pantry_item_id is null then
      -- Explicitly skipped, or not sourced from the pantry: record the
      -- review decision but deduct nothing.
      v_deducted_qty := 0;
    else
      if not v_user_confirmed then
        raise exception 'deduction for recipe ingredient % was not confirmed by the user', v_recipe_ingredient_id;
      end if;

      select * into pantry_row
      from public.pantry_items
      where id = v_pantry_item_id and user_id = auth.uid()
      for update;

      if not found then
        raise exception 'pantry item % not found', v_pantry_item_id;
      end if;

      if v_deducted_unit is null or v_deducted_unit <> pantry_row.unit then
        raise exception 'unit mismatch for % (pantry unit %, requested %) - incompatible units are never silently converted', pantry_row.display_name, pantry_row.unit, v_deducted_unit;
      end if;

      if v_deducted_qty is null or v_deducted_qty <= 0 then
        raise exception 'deducted quantity must be greater than zero for %', pantry_row.display_name;
      end if;

      if v_deducted_qty > pantry_row.quantity then
        raise exception 'insufficient pantry stock for % (have %, need %)', pantry_row.display_name, pantry_row.quantity, v_deducted_qty;
      end if;

      new_pantry_qty := pantry_row.quantity - v_deducted_qty;
      new_pantry_status := case when new_pantry_qty = 0 then 'depleted' else 'active' end;

      update public.pantry_items
      set quantity = new_pantry_qty, status = new_pantry_status
      where id = v_pantry_item_id and user_id = auth.uid();

      insert into public.pantry_events (
        user_id, pantry_item_id, event_type, quantity_delta, unit,
        quantity_before, quantity_after, source_entity_type, source_entity_id, reason
      ) values (
        auth.uid(), v_pantry_item_id, 'deducted_by_cooking', -v_deducted_qty, v_deducted_unit,
        pantry_row.quantity, new_pantry_qty, 'cooking_event', p_cooking_event_id, 'cooking completion'
      )
      returning id into new_pantry_event_id;

      any_deduction_applied := true;
    end if;

    insert into public.cooking_event_ingredients (
      user_id, cooking_event_id, recipe_ingredient_id, pantry_item_id,
      requested_quantity, requested_unit, deducted_quantity, deducted_unit,
      estimated_grams, match_confidence, user_confirmed, was_skipped, pantry_event_id
    ) values (
      auth.uid(), p_cooking_event_id, v_recipe_ingredient_id, v_pantry_item_id,
      coalesce(v_requested_qty, 0), v_requested_unit, v_deducted_qty, v_deducted_unit,
      v_estimated_g, v_match_conf, v_user_confirmed, v_was_skipped, new_pantry_event_id
    );
  end loop;

  -- Per-serving nutrition never changes with batch size - only the totals
  -- derived from it do. Scale deterministically; never re-estimate.
  per_serving_nutrition := recipe_row.nutrition_snapshot;
  batch_nutrition := public.scale_nutrition_snapshot(per_serving_nutrition, p_actual_servings_prepared);
  if p_final_batch_weight_g is not null and p_final_batch_weight_g > 0 then
    per_gram_nutrition := public.scale_nutrition_snapshot(batch_nutrition, 1.0 / p_final_batch_weight_g);
  else
    per_gram_nutrition := null;
  end if;

  servings_remaining := p_actual_servings_prepared - p_servings_consumed_now;
  if p_final_batch_weight_g is not null then
    remaining_weight := p_final_batch_weight_g * (servings_remaining / p_actual_servings_prepared);
  else
    remaining_weight := null;
  end if;

  insert into public.prepared_meals (
    user_id, cooking_event_id, recipe_version_id, total_servings_prepared, servings_remaining,
    total_batch_weight_g, remaining_batch_weight_g, nutrition_snapshot, nutrition_per_serving,
    nutrition_per_gram, status
  ) values (
    auth.uid(), p_cooking_event_id, event_row.recipe_version_id, p_actual_servings_prepared, servings_remaining,
    p_final_batch_weight_g, remaining_weight, batch_nutrition, per_serving_nutrition,
    per_gram_nutrition, case when servings_remaining = 0 then 'consumed' else 'available' end
  )
  returning * into prepared_meal_row;

  update public.cooking_events
  set status = 'completed',
      actual_servings_prepared = p_actual_servings_prepared,
      final_batch_weight_g = p_final_batch_weight_g,
      pantry_deduction_status = case when any_deduction_applied then 'applied' else 'skipped' end,
      completed_at = now()
  where id = p_cooking_event_id and user_id = auth.uid()
  returning * into event_row;

  if event_row.meal_plan_item_id is not null then
    update public.meal_plan_items
    set status = 'completed'
    where id = event_row.meal_plan_item_id and user_id = auth.uid() and status = 'planned';
  end if;

  if p_servings_consumed_now > 0 then
    local_day := (now() at time zone user_timezone)::date;

    insert into public.meal_logs (
      user_id, local_date, timezone, meal_type, recipe_version_id, cooking_event_id, prepared_meal_id,
      servings_consumed, nutrition_snapshot, nutrition_status, log_source, notes
    ) values (
      auth.uid(), local_day, user_timezone, p_meal_type, event_row.recipe_version_id, p_cooking_event_id, prepared_meal_row.id,
      p_servings_consumed_now, public.scale_nutrition_snapshot(per_serving_nutrition, p_servings_consumed_now),
      recipe_row.nutrition_status, 'cooking_flow', p_notes
    )
    returning * into log_row;
  end if;

  select jsonb_build_object(
    'cookingEvent', to_jsonb(event_row),
    'preparedMeal', to_jsonb(prepared_meal_row),
    'mealLog', case when log_row.id is not null then to_jsonb(log_row) else null end,
    'deductions', (
      select coalesce(jsonb_agg(to_jsonb(cei)), '[]'::jsonb)
      from public.cooking_event_ingredients cei
      where cei.cooking_event_id = p_cooking_event_id
    )
  ) into result;

  return result;
end;
$$;

comment on function public.complete_cooking_event is 'security definer: see justification comment above this RPC section. Rejects (does not silently no-op) a second completion attempt on an already-completed/cancelled event - the status check above raises before any further writes.';

-- log_prepared_meal_consumption: locks the prepared_meals balance, rejects
-- over-consumption, inserts the log, decrements remaining, marks 'consumed'
-- at exactly zero. Idempotency-key aware for safe retry after a dropped response.
create function public.log_prepared_meal_consumption(
  p_prepared_meal_id uuid,
  p_servings_consumed numeric,
  p_meal_type text,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  meal_row public.prepared_meals;
  log_row public.meal_logs;
  user_timezone text;
  local_day date;
  new_remaining numeric;
  new_remaining_weight numeric;
  weight_per_serving numeric;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_servings_consumed is null or p_servings_consumed <= 0 then
    raise exception 'servings consumed must be greater than zero';
  end if;

  if p_meal_type is null then
    raise exception 'meal_type is required';
  end if;

  if p_idempotency_key is not null then
    select * into log_row from public.meal_logs where user_id = auth.uid() and idempotency_key = p_idempotency_key;
    if found then
      select * into meal_row from public.prepared_meals where id = p_prepared_meal_id and user_id = auth.uid();
      return jsonb_build_object('preparedMeal', to_jsonb(meal_row), 'mealLog', to_jsonb(log_row));
    end if;
  end if;

  select * into meal_row
  from public.prepared_meals
  where id = p_prepared_meal_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'prepared meal not found';
  end if;

  if meal_row.status = 'discarded' then
    raise exception 'cannot log consumption from a discarded prepared meal';
  end if;

  if p_servings_consumed > meal_row.servings_remaining then
    raise exception 'cannot consume more than the % servings remaining', meal_row.servings_remaining;
  end if;

  select coalesce(timezone, 'UTC') into user_timezone from public.profiles where id = auth.uid();
  user_timezone := coalesce(user_timezone, 'UTC');
  local_day := (now() at time zone user_timezone)::date;

  new_remaining := meal_row.servings_remaining - p_servings_consumed;

  if meal_row.total_batch_weight_g is not null then
    weight_per_serving := meal_row.total_batch_weight_g / meal_row.total_servings_prepared;
    new_remaining_weight := greatest(0, coalesce(meal_row.remaining_batch_weight_g, 0) - weight_per_serving * p_servings_consumed);
  else
    new_remaining_weight := null;
  end if;

  update public.prepared_meals
  set servings_remaining = new_remaining,
      remaining_batch_weight_g = new_remaining_weight,
      status = case when new_remaining = 0 then 'consumed' else 'available' end
  where id = p_prepared_meal_id and user_id = auth.uid()
  returning * into meal_row;

  insert into public.meal_logs (
    user_id, local_date, timezone, meal_type, recipe_version_id, cooking_event_id, prepared_meal_id,
    servings_consumed, nutrition_snapshot, nutrition_status, log_source, notes, idempotency_key
  ) values (
    auth.uid(), local_day, user_timezone, p_meal_type, meal_row.recipe_version_id, meal_row.cooking_event_id, meal_row.id,
    p_servings_consumed, public.scale_nutrition_snapshot(meal_row.nutrition_per_serving, p_servings_consumed),
    meal_row.nutrition_per_serving ->> 'status', 'prepared_meal', p_notes, p_idempotency_key
  )
  returning * into log_row;

  return jsonb_build_object('preparedMeal', to_jsonb(meal_row), 'mealLog', to_jsonb(log_row));
end;
$$;

comment on function public.log_prepared_meal_consumption is 'security definer: see justification comment above this RPC section.';

-- quick_add_meal_log: no recipe needed. p_nutrition may be calories-only -
-- is_valid_nutrition_snapshot only requires status + at least one known
-- nutrient, so unset macros stay null, never fabricated as zero.
create function public.quick_add_meal_log(
  p_meal_type text,
  p_nutrition jsonb,
  p_idempotency_key text,
  p_notes text default null,
  p_consumed_at timestamptz default now()
)
returns public.meal_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  log_row public.meal_logs;
  user_timezone text;
  local_day date;
  consumed_at_value timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key is required for quick add';
  end if;

  select * into log_row from public.meal_logs where user_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then
    return log_row;
  end if;

  if not public.is_valid_nutrition_snapshot(p_nutrition) then
    raise exception 'invalid nutrition snapshot';
  end if;

  select coalesce(timezone, 'UTC') into user_timezone from public.profiles where id = auth.uid();
  user_timezone := coalesce(user_timezone, 'UTC');
  consumed_at_value := coalesce(p_consumed_at, now());
  local_day := (consumed_at_value at time zone user_timezone)::date;

  insert into public.meal_logs (
    user_id, consumed_at, local_date, timezone, meal_type, nutrition_snapshot, nutrition_status,
    log_source, notes, idempotency_key
  ) values (
    auth.uid(), consumed_at_value, local_day, user_timezone, p_meal_type, p_nutrition, p_nutrition ->> 'status',
    'quick_add', p_notes, p_idempotency_key
  )
  returning * into log_row;

  return log_row;
end;
$$;

comment on function public.quick_add_meal_log is 'security definer: see justification comment above this RPC section.';

-- correct_meal_log: the only path that may ever populate replaced_by_log_id.
-- Voids the old row and inserts a typed replacement atomically, so a client
-- can never forge a replacement link without also voiding what it replaces.
create function public.correct_meal_log(
  p_meal_log_id uuid,
  p_reason text,
  p_new_meal_type text,
  p_new_nutrition jsonb,
  p_new_servings_consumed numeric default null,
  p_new_grams_consumed numeric default null,
  p_new_notes text default null,
  p_new_idempotency_key text default null,
  p_new_consumed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row public.meal_logs;
  new_row public.meal_logs;
  user_timezone text;
  new_consumed_at timestamptz;
  new_local_date date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to correct a meal log';
  end if;

  select * into old_row
  from public.meal_logs
  where id = p_meal_log_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'meal log not found';
  end if;

  if old_row.voided_at is not null then
    raise exception 'this meal log has already been voided or corrected';
  end if;

  if not public.is_valid_nutrition_snapshot(p_new_nutrition) then
    raise exception 'invalid nutrition snapshot';
  end if;

  -- consumed time is correctable (defaults to the original if omitted);
  -- local_date/timezone are always re-derived from it, never copied stale.
  new_consumed_at := coalesce(p_new_consumed_at, old_row.consumed_at);
  select coalesce(timezone, old_row.timezone) into user_timezone from public.profiles where id = auth.uid();
  user_timezone := coalesce(user_timezone, old_row.timezone, 'UTC');
  new_local_date := (new_consumed_at at time zone user_timezone)::date;

  insert into public.meal_logs (
    user_id, consumed_at, local_date, timezone, meal_type, recipe_version_id, cooking_event_id, prepared_meal_id,
    servings_consumed, grams_consumed, nutrition_snapshot, nutrition_status, log_source, notes, idempotency_key
  ) values (
    auth.uid(), new_consumed_at, new_local_date, user_timezone, p_new_meal_type,
    old_row.recipe_version_id, old_row.cooking_event_id, old_row.prepared_meal_id,
    p_new_servings_consumed, p_new_grams_consumed, p_new_nutrition, p_new_nutrition ->> 'status',
    'manual', p_new_notes, p_new_idempotency_key
  )
  returning * into new_row;

  -- The original row is untouched except for these three columns - its
  -- nutrition_snapshot, quantities, and every other field remain exactly as
  -- first recorded (protect_meal_log_immutability enforces this even here,
  -- inside a security-definer function - this update simply never touches them).
  update public.meal_logs
  set voided_at = now(), void_reason = p_reason, replaced_by_log_id = new_row.id
  where id = p_meal_log_id and user_id = auth.uid()
  returning * into old_row;

  return jsonb_build_object('voided', to_jsonb(old_row), 'replacement', to_jsonb(new_row));
end;
$$;

comment on function public.correct_meal_log is 'security definer: see justification comment above this RPC section. Phase 3 UI only wires the plain void (no-replacement "Remove") path; this RPC exists so a future edit-and-replace UI has a safe, typed, atomic operation to call rather than trusting a client-written replaced_by_log_id.';

grant execute on function public.start_cooking_event to authenticated;
grant execute on function public.cancel_cooking_event to authenticated;
grant execute on function public.complete_cooking_event to authenticated;
grant execute on function public.log_prepared_meal_consumption to authenticated;
grant execute on function public.quick_add_meal_log to authenticated;
grant execute on function public.correct_meal_log to authenticated;

revoke execute on function public.start_cooking_event from public;
revoke execute on function public.cancel_cooking_event from public;
revoke execute on function public.complete_cooking_event from public;
revoke execute on function public.log_prepared_meal_consumption from public;
revoke execute on function public.quick_add_meal_log from public;
revoke execute on function public.correct_meal_log from public;
