-- Phase 2: pantry persistence and inventory accuracy.
--
-- Adds pantry_items (current inventory) and pantry_events (an append-only
-- ledger of everything that has ever happened to an item). Phase 2 actively
-- uses event types added/adjusted/consumed/depleted/discarded/corrected/
-- restored; deducted_by_cooking/donated/traded are reserved for later phases
-- (cooking events, community exchange) and are not written by anything yet.
--
-- Quantity invariant: `pantry_items.quantity` is always the current on-hand
-- amount and can never be negative (`check (quantity >= 0)`). Reaching
-- exactly zero always means status = 'depleted'; moving back above zero
-- always means status = 'active'. The only ways quantity or status can
-- change are the five RPCs below - see the security-definer note further
-- down for why that's enforced at the database level, not just by app
-- convention.
--
-- Date semantics (kept distinct on purpose, per product requirements):
--   purchase_date / opened_date   - user-provided, informational
--   user_provided_date(+type)     - a best_by/use_by/sell_by date exactly as
--                                    printed on the package, as the user
--                                    typed it - never altered by the system
--   estimated_expiration_date     - a system estimate, computed client-side
--                                    (utils/expiration.ts) from either the
--                                    user-provided date or a generic
--                                    category shelf-life heuristic, and
--                                    always paired with expiration_confidence
-- None of these are a food-safety claim or a guaranteed deadline - they are
-- guidance only. See utils/expiration.ts for the exact rules and copy.

-- ============================================================================
-- pantry_items
-- ============================================================================

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Synthetic catalog-miss-safe identity, mirroring the existing mock
  -- pattern for manually-added items (no real ingredient-catalog match).
  -- Both are supplied by the client at creation time (see
  -- utils/id.ts#generateId and utils/ingredientPhoto.ts#ingredientPhotoUri) -
  -- reusing that existing, already-tested logic instead of reimplementing
  -- deterministic-photo hashing in SQL.
  ingredient_id text not null,
  image_uri text not null default '',

  normalized_name text not null,
  display_name text not null,
  category text not null check (category in ('produce', 'protein', 'dairy', 'pantry', 'frozen', 'other')),

  quantity numeric not null default 0 check (quantity >= 0),
  unit text not null check (
    unit in ('item', 'container', 'bag', 'bottle', 'can', 'package', 'serving', 'g', 'kg', 'oz', 'lb', 'ml', 'L')
  ),
  quantity_confidence text not null default 'exact' check (quantity_confidence in ('exact', 'estimated')),

  -- Reserved for later phases (USDA matching / barcode scanning) - schema
  -- only, nothing in Phase 2 populates these beyond null.
  estimated_grams numeric check (estimated_grams >= 0),
  fdc_id text,
  usda_match_confidence text,
  barcode text,
  brand text,

  purchase_date date,
  opened_date date,
  user_provided_date date,
  user_provided_date_type text check (user_provided_date_type in ('best_by', 'use_by', 'sell_by')),
  estimated_expiration_date date,
  expiration_confidence text not null default 'unknown' check (expiration_confidence in ('high', 'medium', 'low', 'unknown')),
  constraint pantry_items_expiration_confidence_consistent check (
    (expiration_confidence = 'unknown' and estimated_expiration_date is null)
    or (expiration_confidence <> 'unknown' and estimated_expiration_date is not null)
  ),

  storage_location text check (storage_location in ('fridge', 'freezer', 'pantry', 'counter', 'other')),
  scan_source text not null default 'manual' check (scan_source in ('manual', 'scan', 'grocery')),
  notes text,

  status text not null default 'active' check (status in ('active', 'depleted')),
  last_confirmed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pantry_items is
  'Current inventory only - full history lives in pantry_events. quantity/status change exclusively via the security-definer RPCs below.';

create index pantry_items_user_status_idx on public.pantry_items (user_id, status);
create index pantry_items_user_category_idx on public.pantry_items (user_id, category);

alter table public.pantry_items enable row level security;

create policy "pantry_items_select_own" on public.pantry_items
  for select
  using (auth.uid() = user_id);

create policy "pantry_items_update_own" on public.pantry_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No insert/delete policy for clients - see the RPC section below.

grant select on public.pantry_items to authenticated;

-- Column-level grant: clients may directly edit metadata, but NOT quantity
-- or status (or user_id/id). This is what actually forces every quantity or
-- status change through a security-definer RPC with a matching ledger
-- event - RLS alone can only say "own row or not," it can't say "this
-- column may only change alongside an events insert," so the column grant
-- is load-bearing here, not decorative.
grant update (
  display_name, category, unit, notes, storage_location, quantity_confidence,
  purchase_date, opened_date, user_provided_date, user_provided_date_type,
  estimated_expiration_date, expiration_confidence
) on public.pantry_items to authenticated;

create trigger pantry_items_set_updated_at
  before update on public.pantry_items
  for each row execute function public.set_updated_at();

-- Keep normalized_name in sync with display_name on direct metadata edits
-- (the create_pantry_item RPC sets it explicitly on insert).
create function public.sync_pantry_item_normalized_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name then
    new.normalized_name = lower(regexp_replace(trim(new.display_name), '\s+', ' ', 'g'));
  end if;
  return new;
end;
$$;

create trigger pantry_items_sync_normalized_name
  before update on public.pantry_items
  for each row execute function public.sync_pantry_item_normalized_name();

-- ============================================================================
-- pantry_events - append-only ledger
-- ============================================================================

create table public.pantry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pantry_item_id uuid not null references public.pantry_items (id) on delete cascade,

  event_type text not null check (
    event_type in (
      'added', 'adjusted', 'consumed', 'deducted_by_cooking', 'depleted',
      'discarded', 'donated', 'traded', 'corrected', 'restored'
    )
  ),

  quantity_delta numeric not null default 0,
  unit text,
  estimated_gram_delta numeric,
  quantity_before numeric,
  quantity_after numeric,

  source_entity_type text,
  source_entity_id uuid,
  confidence text,
  reason text,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.pantry_events is
  'Append-only. No update or delete policy exists for any role but the table owner - not even the owning user can edit history, by design.';

create index pantry_events_user_id_idx on public.pantry_events (user_id);
create index pantry_events_pantry_item_id_idx on public.pantry_events (pantry_item_id);

alter table public.pantry_events enable row level security;

create policy "pantry_events_select_own" on public.pantry_events
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy for clients at all. Every event is written
-- by one of the security-definer RPCs below (running as their owner, not as
-- the client), so the ledger can never be edited or added to except as a
-- side effect of a real, validated pantry mutation.

grant select on public.pantry_events to authenticated;

-- ============================================================================
-- Compound-mutation RPCs.
--
-- All five are security definer, which needs justifying since the default
-- (used everywhere in migration 0001 except handle_new_user) is invoker:
--
-- RLS can express "you may only touch your own rows," but it cannot express
-- "this column may only change together with an events-table insert." A
-- security-invoker RPC calling client still only has the table/column
-- grants above - meaning it could always be bypassed by the client just
-- issuing its own `.update()` on quantity directly (still RLS-legal, since
-- it'd be their own row), silently desyncing the ledger. Making these five
-- functions security definer - and granting the client execute on the
-- functions but NOT insert on pantry_items/pantry_events and NOT column
-- access to quantity/status - closes that gap: those changes are only
-- reachable through here.
--
-- Because RLS no longer applies inside these functions (security definer
-- runs with the function owner's privileges), auth.uid() plus an explicit
-- `where user_id = auth.uid()` on every statement is the *entire*
-- authorization boundary - there is no RLS safety net backing it up. Every
-- statement below is scoped that way. search_path is locked to '' and every
-- reference is schema-qualified, so no same-named object on another
-- search_path can be substituted in.
-- ============================================================================

create function public.create_pantry_item(
  p_ingredient_id text,
  p_display_name text,
  p_image_uri text,
  p_category text,
  p_quantity numeric,
  p_unit text,
  p_storage_location text default null,
  p_notes text default null,
  p_purchase_date date default null,
  p_opened_date date default null,
  p_user_provided_date date default null,
  p_user_provided_date_type text default null,
  p_estimated_expiration_date date default null,
  p_expiration_confidence text default 'unknown',
  p_source text default 'manual'
)
returns public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.pantry_items;
begin
  if p_quantity < 0 then
    raise exception 'quantity cannot be negative';
  end if;

  insert into public.pantry_items (
    user_id, ingredient_id, normalized_name, display_name, image_uri, category,
    quantity, unit, storage_location, notes, purchase_date, opened_date,
    user_provided_date, user_provided_date_type, estimated_expiration_date,
    expiration_confidence, scan_source
  ) values (
    auth.uid(), p_ingredient_id, lower(regexp_replace(trim(p_display_name), '\s+', ' ', 'g')), p_display_name,
    p_image_uri, p_category, p_quantity, p_unit, p_storage_location, p_notes, p_purchase_date, p_opened_date,
    p_user_provided_date, p_user_provided_date_type, p_estimated_expiration_date,
    coalesce(p_expiration_confidence, 'unknown'), p_source
  )
  returning * into result;

  insert into public.pantry_events (
    user_id, pantry_item_id, event_type, quantity_delta, unit, quantity_before, quantity_after, reason
  ) values (
    auth.uid(), result.id, 'added', p_quantity, p_unit, 0, p_quantity, 'item created'
  );

  return result;
end;
$$;

comment on function public.create_pantry_item is 'security definer: see justification comment above this RPC section.';

create function public.adjust_pantry_quantity(
  p_item_id uuid,
  p_delta numeric,
  p_event_type text,
  p_reason text default null
)
returns public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.pantry_items;
  new_quantity numeric;
  new_status text;
  quantity_before numeric;
begin
  if p_event_type not in ('adjusted', 'consumed', 'deducted_by_cooking') then
    raise exception 'invalid event_type for adjust_pantry_quantity: %', p_event_type;
  end if;

  select * into item
  from public.pantry_items
  where id = p_item_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'pantry item not found';
  end if;

  quantity_before := item.quantity;
  new_quantity := item.quantity + p_delta;

  if new_quantity < 0 then
    raise exception 'quantity cannot go below zero (have %, requested change %)', item.quantity, p_delta;
  end if;

  -- Zero quantity always means depleted; moving back above zero reactivates.
  new_status := case when new_quantity = 0 then 'depleted' else 'active' end;

  update public.pantry_items
  set quantity = new_quantity, status = new_status
  where id = p_item_id and user_id = auth.uid()
  returning * into item;

  insert into public.pantry_events (
    user_id, pantry_item_id, event_type, quantity_delta, unit, quantity_before, quantity_after, reason
  ) values (
    auth.uid(), p_item_id, p_event_type, p_delta, item.unit, quantity_before, new_quantity, p_reason
  );

  return item;
end;
$$;

comment on function public.adjust_pantry_quantity is 'security definer: see justification comment above this RPC section.';

create function public.deplete_pantry_item(
  p_item_id uuid,
  p_event_type text,
  p_reason text default null
)
returns public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.pantry_items;
  quantity_before numeric;
begin
  if p_event_type not in ('depleted', 'discarded', 'corrected') then
    raise exception 'invalid event_type for deplete_pantry_item: %', p_event_type;
  end if;

  select * into item
  from public.pantry_items
  where id = p_item_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'pantry item not found';
  end if;

  quantity_before := item.quantity;

  update public.pantry_items
  set quantity = 0, status = 'depleted'
  where id = p_item_id and user_id = auth.uid()
  returning * into item;

  insert into public.pantry_events (
    user_id, pantry_item_id, event_type, quantity_delta, unit, quantity_before, quantity_after, reason
  ) values (
    auth.uid(), p_item_id, p_event_type, -quantity_before, item.unit, quantity_before, 0, p_reason
  );

  return item;
end;
$$;

comment on function public.deplete_pantry_item is 'security definer: see justification comment above this RPC section.';

create function public.restore_pantry_item(
  p_item_id uuid,
  p_reason text default null
)
returns public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.pantry_items;
begin
  select * into item
  from public.pantry_items
  where id = p_item_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'pantry item not found';
  end if;

  if item.status = 'active' then
    raise exception 'item is already active';
  end if;

  update public.pantry_items
  set status = 'active'
  where id = p_item_id and user_id = auth.uid()
  returning * into item;

  insert into public.pantry_events (
    user_id, pantry_item_id, event_type, quantity_delta, unit, quantity_before, quantity_after, reason
  ) values (
    auth.uid(), p_item_id, 'restored', 0, item.unit, item.quantity, item.quantity, p_reason
  );

  return item;
end;
$$;

comment on function public.restore_pantry_item is 'security definer: see justification comment above this RPC section.';

create function public.confirm_pantry_item(p_item_id uuid)
returns public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.pantry_items;
begin
  update public.pantry_items
  set last_confirmed_at = now()
  where id = p_item_id and user_id = auth.uid()
  returning * into item;

  if not found then
    raise exception 'pantry item not found';
  end if;

  insert into public.pantry_events (
    user_id, pantry_item_id, event_type, quantity_delta, unit, quantity_before, quantity_after, reason
  ) values (
    auth.uid(), p_item_id, 'corrected', 0, item.unit, item.quantity, item.quantity, 'still_have_this'
  );

  return item;
end;
$$;

comment on function public.confirm_pantry_item is 'security definer: see justification comment above this RPC section.';

grant execute on function public.create_pantry_item to authenticated;
grant execute on function public.adjust_pantry_quantity to authenticated;
grant execute on function public.deplete_pantry_item to authenticated;
grant execute on function public.restore_pantry_item to authenticated;
grant execute on function public.confirm_pantry_item to authenticated;
