-- Phase 4 (grocery): real grocery-list persistence.
--
-- Replaces the in-memory mock grocery store (services/mockDb.ts `.groceryList`,
-- seeded from data/mockGroceryList.ts) with two RLS-protected tables.
--
-- Model
--   grocery_lists       One "active" list per user (partial unique index),
--                       plus completed/archived history. `source` +
--                       `source_metadata` record how a list came to exist so a
--                       later "generate from meal plan / recipe / pantry
--                       shortage" flow can group its output. The current UI
--                       only ever shows the single active list; the extra
--                       states/metadata are storage the backend keeps, not UI.
--   grocery_list_items  The line items. Plain owner-scoped CRUD - no compound
--                       cross-table invariant needs a security-definer RPC
--                       here (unlike pantry quantity/status in 0002 or the
--                       cooking lifecycle in 0003). The only helpers are two
--                       security-INVOKER conveniences that still run entirely
--                       under RLS: get_or_create_active_grocery_list() and
--                       toggle_grocery_item().
--
-- Quantity semantics are explicit and units are never silently converted or
-- merged. `quantity_basis` says what a quantity means:
--   as_entered           - a human typed it (manual add / edit)
--   recipe_requirement   - the full amount a recipe calls for, with no pantry
--                          subtraction applied
--   uncovered_shortfall  - recipe requirement minus confirmed pantry coverage
--                          (reserved: needs unit conversion, Phase 5+, before
--                          anything can populate it reliably)
-- Adding the same ingredient from a second recipe merges into an existing
-- line ONLY when the unit matches exactly (enforced in groceryService, not
-- here); a unit mismatch lands as its own separate line.
--
-- Pantry boundary: checking a grocery item means "acquired", NOT "added to
-- pantry". Nothing in this migration reads or writes pantry_items /
-- pantry_events. An explicit "add purchased items to pantry" flow is
-- deliberately out of scope.

-- ============================================================================
-- grocery_lists
-- ============================================================================

create table public.grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Grocery List',
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  source text not null default 'manual'
    check (source in ('manual', 'meal_plan', 'recipe', 'pantry_shortage')),
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets grocery_list_items carry a composite FK to (id, user_id), making
  -- "an item's user_id always equals its list's owner" a schema guarantee,
  -- not just an RLS policy.
  constraint grocery_lists_id_user_key unique (id, user_id)
);

comment on table public.grocery_lists is
  'One active list per user (grocery_lists_one_active_per_user); completed/archived rows are history. Rows are created only via get_or_create_active_grocery_list() today.';

-- At most one active list per user - what makes "get the user''s grocery list"
-- unambiguous for the single-list UI.
create unique index grocery_lists_one_active_per_user
  on public.grocery_lists (user_id)
  where status = 'active';

create index grocery_lists_user_status_idx on public.grocery_lists (user_id, status);

alter table public.grocery_lists enable row level security;

grant select, insert, update, delete on public.grocery_lists to authenticated;

create policy "grocery_lists_select_own" on public.grocery_lists
  for select using (auth.uid() = user_id);

create policy "grocery_lists_insert_own" on public.grocery_lists
  for insert with check (auth.uid() = user_id);

create policy "grocery_lists_update_own" on public.grocery_lists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "grocery_lists_delete_own" on public.grocery_lists
  for delete using (auth.uid() = user_id);

create trigger grocery_lists_set_updated_at
  before update on public.grocery_lists
  for each row execute function public.set_updated_at();

-- ============================================================================
-- grocery_list_items
-- ============================================================================

create table public.grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  grocery_list_id uuid not null,
  -- Denormalized owner (matches cooking_event_ingredients in 0003) so RLS is a
  -- single-column check. The composite FK below guarantees it always equals
  -- the parent list's owner.
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Optional link into the ingredient catalog id space (same suggestion-only
  -- role as recipe_ingredients.catalog_ingredient_id). Null for a free-text
  -- manual item with no catalog match.
  catalog_ingredient_id text,
  display_name text not null,
  normalized_name text not null,
  image_uri text not null default '',
  -- Optional: null renders as "Other" in the UI's category grouping.
  category text check (category in ('produce', 'protein', 'dairy', 'pantry', 'frozen', 'other')),

  quantity numeric not null default 1 check (quantity > 0),
  unit text not null check (
    unit in ('item', 'container', 'bag', 'bottle', 'can', 'package', 'serving', 'g', 'kg', 'oz', 'lb', 'ml', 'L')
  ),
  quantity_basis text not null default 'as_entered'
    check (quantity_basis in ('as_entered', 'recipe_requirement', 'uncovered_shortfall')),

  is_checked boolean not null default false,
  checked_at timestamptz,

  -- Provenance for future auto-generated lists.
  source text not null default 'manual'
    check (source in ('manual', 'recipe', 'meal_plan', 'pantry_shortage')),
  source_recipe_version_ids text[] not null default '{}',
  source_metadata jsonb not null default '{}'::jsonb,

  -- Reserved for a later pricing / low-waste pass - nothing populates these
  -- yet; the current UI reads them and degrades gracefully when null.
  estimated_price numeric check (estimated_price >= 0),
  swap_suggestion text,
  waste_note text,

  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint grocery_list_items_list_fk
    foreign key (grocery_list_id, user_id)
    references public.grocery_lists (id, user_id)
    on delete cascade,
  constraint grocery_list_items_checked_at_consistent
    check ((is_checked and checked_at is not null) or (not is_checked and checked_at is null))
);

comment on table public.grocery_list_items is
  'Plain owner-scoped CRUD. is_checked = "acquired", never "added to pantry". quantity_basis makes quantity meaning explicit; same-ingredient merges happen in groceryService only when the unit matches exactly.';

create index grocery_list_items_list_idx on public.grocery_list_items (grocery_list_id, sort_order);
create index grocery_list_items_user_idx on public.grocery_list_items (user_id);

alter table public.grocery_list_items enable row level security;

grant select, insert, update, delete on public.grocery_list_items to authenticated;

create policy "grocery_list_items_select_own" on public.grocery_list_items
  for select using (auth.uid() = user_id);

-- Insert must be your own row AND into a list you own - the second half is
-- what actually blocks "insert an item into someone else's list".
create policy "grocery_list_items_insert_own" on public.grocery_list_items
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.grocery_lists gl
      where gl.id = grocery_list_items.grocery_list_id and gl.user_id = auth.uid()
    )
  );

create policy "grocery_list_items_update_own" on public.grocery_list_items
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.grocery_lists gl
      where gl.id = grocery_list_items.grocery_list_id and gl.user_id = auth.uid()
    )
  );

create policy "grocery_list_items_delete_own" on public.grocery_list_items
  for delete using (auth.uid() = user_id);

create trigger grocery_list_items_set_updated_at
  before update on public.grocery_list_items
  for each row execute function public.set_updated_at();

-- normalized_name is always derived from display_name - clients never send it.
create function public.sync_grocery_list_item_normalized_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then
    new.normalized_name = lower(regexp_replace(trim(new.display_name), '\s+', ' ', 'g'));
  end if;
  return new;
end;
$$;

create trigger grocery_list_items_sync_normalized_name
  before insert or update on public.grocery_list_items
  for each row execute function public.sync_grocery_list_item_normalized_name();

-- checked_at tracks the moment an item was acquired; cleared if unchecked
-- again. Keeps grocery_list_items_checked_at_consistent satisfied without the
-- client having to manage the timestamp.
create function public.set_grocery_list_item_checked_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_checked and (tg_op = 'INSERT' or not old.is_checked) then
    new.checked_at = now();
  elsif not new.is_checked then
    new.checked_at = null;
  end if;
  return new;
end;
$$;

create trigger grocery_list_items_set_checked_at
  before insert or update on public.grocery_list_items
  for each row execute function public.set_grocery_list_item_checked_at();

-- Append new items to the end of their list. Client may pass an explicit
-- sort_order (> 0) to control batch ordering; 0/absent means "append".
create function public.set_grocery_list_item_sort_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.sort_order is null or new.sort_order = 0 then
    select coalesce(max(sort_order), 0) + 1 into new.sort_order
    from public.grocery_list_items
    where grocery_list_id = new.grocery_list_id;
  end if;
  return new;
end;
$$;

create trigger grocery_list_items_set_sort_order
  before insert on public.grocery_list_items
  for each row execute function public.set_grocery_list_item_sort_order();

-- ============================================================================
-- Convenience functions (security INVOKER - RLS still fully applies inside,
-- same pattern as replace_nutrition_goals in 0001; these are not the
-- security-definer kind used for pantry/cooking invariants).
-- ============================================================================

-- Returns the caller's active grocery list, creating it on first use. The
-- on-conflict handles the race where two clients call this at once - only one
-- insert wins, both get the same row back.
create function public.get_or_create_active_grocery_list()
returns public.grocery_lists
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.grocery_lists;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into result
  from public.grocery_lists
  where user_id = auth.uid() and status = 'active'
  order by created_at asc
  limit 1;

  if found then
    return result;
  end if;

  insert into public.grocery_lists (user_id)
  values (auth.uid())
  on conflict (user_id) where (status = 'active') do nothing
  returning * into result;

  if not found then
    select * into result
    from public.grocery_lists
    where user_id = auth.uid() and status = 'active'
    order by created_at asc
    limit 1;
  end if;

  return result;
end;
$$;

comment on function public.get_or_create_active_grocery_list is
  'security invoker: runs under the caller''s RLS. Idempotent - one active list per user.';

grant execute on function public.get_or_create_active_grocery_list() to authenticated;

-- Flip an item''s acquired state in one round trip (no client-side
-- read-modify-write). The `user_id = auth.uid()` filter is belt-and-braces on
-- top of RLS.
create function public.toggle_grocery_item(p_item_id uuid)
returns public.grocery_list_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.grocery_list_items;
begin
  update public.grocery_list_items
  set is_checked = not is_checked
  where id = p_item_id and user_id = auth.uid()
  returning * into result;

  if not found then
    raise exception 'grocery item not found';
  end if;

  return result;
end;
$$;

comment on function public.toggle_grocery_item is
  'security invoker: runs under the caller''s RLS. Toggles is_checked; the checked_at trigger keeps the timestamp in sync.';

grant execute on function public.toggle_grocery_item(uuid) to authenticated;
