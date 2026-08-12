-- Phase 1: identity and preferences foundation.
--
-- Creates the three "Identity and preferences" tables from the product spec that
-- Phase 1 actually needs: profiles, dietary_preferences, nutrition_goals.
-- user_taste_preferences is intentionally deferred to the taste-learning phase
-- (Phase 6) - no point carrying an unused table this early.
--
-- Column choices beyond the literal spec (profiles.cooking_confidence,
-- dietary_preferences.priorities/weekly_grocery_budget, nutrition_goals weight-goal
-- columns) exist so the already-built onboarding/profile UI can persist for real
-- instead of only a subset of it.
--
-- This app has no medical claims anywhere: nutrition_goals is personal tracking only.

-- ============================================================================
-- profiles
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  auth_provider text not null default 'email' check (auth_provider in ('email', 'apple', 'google')),
  timezone text not null default 'UTC',
  household_size smallint not null default 1 check (household_size between 1 and 20),
  cooking_confidence smallint not null default 3 check (cooking_confidence between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth.users row, created automatically by handle_new_user().';

alter table public.profiles enable row level security;

grant select, update on public.profiles to authenticated;

create policy "profiles_select_own" on public.profiles
  for select
  using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert/delete policy for clients: rows are created only by the
-- handle_new_user trigger below and deleted only via auth.users cascade.

-- ============================================================================
-- dietary_preferences (one row per user)
-- ============================================================================

create table public.dietary_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dietary_patterns text[] not null default '{}',
  allergens text[] not null default '{}',
  excluded_ingredients text[] not null default '{}',
  preferred_cuisines text[] not null default '{}',
  equipment text[] not null default '{}',
  max_cook_time text not null default 'no_preference'
    check (max_cook_time in ('under_15', '15_30', '30_60', 'no_preference')),
  novelty_preference text,
  priorities jsonb not null default '{}'::jsonb,
  weekly_grocery_budget numeric(8, 2) check (weekly_grocery_budget >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.dietary_preferences is
  'equipment and novelty_preference are spec-mandated columns not yet surfaced in the UI (reserved for later phases).';

alter table public.dietary_preferences enable row level security;

grant select, insert, update on public.dietary_preferences to authenticated;

create policy "dietary_preferences_select_own" on public.dietary_preferences
  for select
  using (auth.uid() = user_id);

create policy "dietary_preferences_insert_own" on public.dietary_preferences
  for insert
  with check (auth.uid() = user_id);

create policy "dietary_preferences_update_own" on public.dietary_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- nutrition_goals (effective-dated history: only one row per user has
-- effective_end null - that is the "current" goal)
-- ============================================================================

create table public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  effective_start timestamptz not null default now(),
  effective_end timestamptz,
  daily_calories integer not null check (daily_calories > 0),
  protein_min_g numeric not null check (protein_min_g >= 0),
  carbs_target_g numeric not null check (carbs_target_g >= 0),
  fat_target_g numeric not null check (fat_target_g >= 0),
  fiber_target_g numeric check (fiber_target_g >= 0),
  macro_preference text not null default 'balanced'
    check (macro_preference in ('balanced', 'low_carb', 'high_protein')),
  goal_type text not null default 'personal_tracking',
  weight_goal_direction text check (weight_goal_direction in ('lose', 'maintain', 'gain')),
  weight_goal_target_lbs numeric check (weight_goal_target_lbs >= 0),
  weight_goal_target_date date,
  units text not null default 'imperial' check (units in ('imperial', 'metric')),
  created_at timestamptz not null default now(),
  constraint nutrition_goals_effective_range_valid
    check (effective_end is null or effective_end > effective_start)
);

comment on table public.nutrition_goals is
  'Immutable history. Updating goals inserts a new row and closes the previous one by setting effective_end - never edit content columns of an existing row.';

-- Exactly one "current" (open-ended) goal row per user.
create unique index nutrition_goals_one_current_per_user
  on public.nutrition_goals (user_id)
  where effective_end is null;

create index nutrition_goals_user_id_idx on public.nutrition_goals (user_id);

alter table public.nutrition_goals enable row level security;

grant select, insert, update on public.nutrition_goals to authenticated;

create policy "nutrition_goals_select_own" on public.nutrition_goals
  for select
  using (auth.uid() = user_id);

create policy "nutrition_goals_insert_own" on public.nutrition_goals
  for insert
  with check (auth.uid() = user_id);

-- update is only ever used to close out effective_end (see the immutability
-- trigger below) - a fresh row is inserted for the new goal values.
create policy "nutrition_goals_update_own" on public.nutrition_goals
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- updated_at maintenance
-- ============================================================================

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger dietary_preferences_set_updated_at
  before update on public.dietary_preferences
  for each row execute function public.set_updated_at();

-- ============================================================================
-- nutrition_goals immutability: clients may only ever change effective_end
-- (to close a row out). Every other column is fixed at insert time so that
-- historical nutrition snapshots never silently change underneath a past log.
-- security invoker (not definer) - it only needs the calling user's own
-- already-granted UPDATE privilege, nothing elevated.
-- ============================================================================

create function public.protect_nutrition_goal_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id
    or new.effective_start <> old.effective_start
    or new.daily_calories <> old.daily_calories
    or new.protein_min_g <> old.protein_min_g
    or new.carbs_target_g <> old.carbs_target_g
    or new.fat_target_g <> old.fat_target_g
    or coalesce(new.fiber_target_g, -1) <> coalesce(old.fiber_target_g, -1)
    or new.macro_preference <> old.macro_preference
    or new.goal_type <> old.goal_type
    or coalesce(new.weight_goal_direction, '') <> coalesce(old.weight_goal_direction, '')
    or coalesce(new.weight_goal_target_lbs, -1) <> coalesce(old.weight_goal_target_lbs, -1)
    or coalesce(new.weight_goal_target_date, date '0001-01-01') <> coalesce(old.weight_goal_target_date, date '0001-01-01')
    or new.units <> old.units
  then
    raise exception 'nutrition_goals rows are immutable except for closing effective_end';
  end if;
  return new;
end;
$$;

create trigger nutrition_goals_protect_immutability
  before update on public.nutrition_goals
  for each row execute function public.protect_nutrition_goal_immutability();

-- ============================================================================
-- Auto-provision a profile row when a new auth user is created.
--
-- security definer: this trigger fires as part of the auth.users insert made
-- by Supabase Auth (which has no INSERT grant on public.profiles under RLS),
-- so the function must run with the privileges of its owner to succeed.
-- search_path is locked to '' and every reference is schema-qualified so a
-- same-named object earlier on some other search_path can never be
-- substituted in (search-path hijacking).
-- ============================================================================

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Atomically close the current nutrition_goals row and insert its
-- replacement. Two separate client-side statements (UPDATE then INSERT)
-- would leave a window with zero "current" rows if the app were killed
-- in between; wrapping both in one function makes them a single transaction.
--
-- security invoker: it must run as the calling user so both statements
-- remain subject to the normal RLS policies above (auth.uid() still resolves
-- from the caller's own JWT claims) - there is no need for elevated rights,
-- since a user is only ever touching their own row.
-- ============================================================================

create function public.replace_nutrition_goals(
  p_daily_calories integer,
  p_protein_min_g numeric,
  p_carbs_target_g numeric,
  p_fat_target_g numeric,
  p_fiber_target_g numeric,
  p_macro_preference text,
  p_weight_goal_direction text,
  p_weight_goal_target_lbs numeric,
  p_weight_goal_target_date date
)
returns public.nutrition_goals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.nutrition_goals;
begin
  update public.nutrition_goals
  set effective_end = now()
  where user_id = auth.uid() and effective_end is null;

  insert into public.nutrition_goals (
    user_id, daily_calories, protein_min_g, carbs_target_g, fat_target_g,
    fiber_target_g, macro_preference, weight_goal_direction,
    weight_goal_target_lbs, weight_goal_target_date
  ) values (
    auth.uid(), p_daily_calories, p_protein_min_g, p_carbs_target_g, p_fat_target_g,
    p_fiber_target_g, p_macro_preference, p_weight_goal_direction,
    p_weight_goal_target_lbs, p_weight_goal_target_date
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.replace_nutrition_goals to authenticated;
