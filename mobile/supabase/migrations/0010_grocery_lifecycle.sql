-- Phase 8: grocery shopping-trip lifecycle + immutable history.
--
-- Until now a user had one perpetual active grocery list. This turns Grocery
-- into explicit shopping trips:
--
--   active list  -> user shops / checks items / (optionally) transfers to pantry
--                -> "Complete Shopping Trip"
--                -> that list becomes a frozen COMPLETED trip (history)
--                -> a fresh empty ACTIVE list is created for future generation
--
-- The completed grocery_list + its grocery_list_items ARE the history - no
-- separate history table, no item data duplicated.
--
-- ============================================================================
-- What is added
-- ============================================================================
--   grocery_lists.completed_at        set when a trip is completed; null while
--                                     active. Consistency checks enforce it.
--
--   complete_grocery_list(p_list_id)  ONE atomic security-definer operation:
--                                     freeze the active list -> completed, then
--                                     create the replacement active list, and
--                                     return both. Idempotent: calling it again
--                                     for an already-completed list returns that
--                                     list + the current active one, and never
--                                     touches completed_at or creates a 2nd list.
--
--   Server-enforced immutability      a completed / archived list and its items
--                                     are read-only for normal clients - not by
--                                     hiding buttons, but by a BEFORE trigger on
--                                     grocery_list_items and a freeze trigger +
--                                     tightened column grant on grocery_lists.
--                                     Grocery -> Pantry transfer from a
--                                     completed trip is therefore also blocked.
--
-- The partial unique index grocery_lists_one_active_per_user (0005) remains the
-- single source of truth for "one active list per user" - completion frees the
-- slot in the same transaction that fills it again.
--
-- `archived` stays schema-only: no path produces it and there is no UI for it.
-- History = completed trips.

-- ============================================================================
-- grocery_lists.completed_at + consistency
-- ============================================================================

alter table public.grocery_lists
  add column completed_at timestamptz;

-- active lists never carry a completion timestamp; completed lists always do.
-- (archived is left unconstrained - nothing produces it.)
alter table public.grocery_lists
  add constraint grocery_lists_active_no_completed_at
    check (status <> 'active' or completed_at is null),
  add constraint grocery_lists_completed_has_at
    check (status <> 'completed' or completed_at is not null);

-- History lookup: a user's completed trips, newest first.
create index grocery_lists_user_history_idx
  on public.grocery_lists (user_id, completed_at desc)
  where status = 'completed';

comment on column public.grocery_lists.completed_at is
  'When this shopping trip was completed (status = completed). Null while active. Set only by complete_grocery_list and never changed afterwards.';

-- ============================================================================
-- Tighten grants so lifecycle fields are RPC-only.
--
-- Before: authenticated had blanket UPDATE on grocery_lists, so a client could
-- flip status / completed_at itself and strand the user without an active list,
-- or edit a frozen trip. After: a client may only rename its own ACTIVE list;
-- status / completed_at / source move exclusively through complete_grocery_list
-- (security definer, runs as owner - column grants and RLS do not restrict it).
-- Triggers set updated_at etc. as the table owner, so they are unaffected.
-- ============================================================================

revoke update on public.grocery_lists from authenticated;
grant update (title) on public.grocery_lists to authenticated;

-- ============================================================================
-- Freeze historical grocery_lists rows.
--
-- The only legitimate mutation of a grocery_lists row is the active -> completed
-- transition done by complete_grocery_list (old.status = 'active'). Any UPDATE
-- of a row that is already completed / archived is rejected. auth.uid() null
-- (postgres maintenance / migrations) bypasses, so test cleanup still works;
-- anon has no grant to reach this table anyway.
-- ============================================================================

create function public.freeze_completed_grocery_list()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if old.status is distinct from 'active' then
    raise exception 'completed shopping trips are read-only';
  end if;
  return new;
end;
$$;

create trigger grocery_lists_freeze_completed
  before update on public.grocery_lists
  for each row execute function public.freeze_completed_grocery_list();

-- ============================================================================
-- A grocery_list_items row may only be inserted / updated / deleted while its
-- parent list is ACTIVE. This is what actually makes completed trips immutable:
-- it blocks adding items, editing name/quantity/unit, toggle_grocery_item,
-- Clear Checked, AND transfer_grocery_item_to_pantry's write-back - all of them
-- go through this table. auth.uid() null bypasses for maintenance.
-- ============================================================================

create function public.enforce_active_grocery_list_for_items()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  select status into v_status
  from public.grocery_lists
  where id = coalesce(new.grocery_list_id, old.grocery_list_id);
  if v_status is distinct from 'active' then
    raise exception 'this shopping trip is complete - its items are read-only';
  end if;
  return coalesce(new, old);
end;
$$;

-- Name sorts before the 0005 set_* triggers so it rejects first; a raise in any
-- BEFORE trigger aborts the statement regardless of order.
create trigger grocery_list_items_require_active_parent
  before insert or update or delete on public.grocery_list_items
  for each row execute function public.enforce_active_grocery_list_for_items();

-- ============================================================================
-- complete_grocery_list - the atomic "finish this shopping trip" operation.
--
-- security definer: it must guarantee the completed + replacement-active
-- transition happens together, and it writes status / completed_at which the
-- client is no longer granted. Derives identity from auth.uid(), rejects a null
-- auth.uid(), re-checks ownership explicitly (RLS does not apply inside),
-- locks search_path to ''.
-- ============================================================================

create function public.complete_grocery_list(p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.grocery_lists;
  v_completed public.grocery_lists;
  v_active public.grocery_lists;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_list
  from public.grocery_lists
  where id = p_list_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'grocery list not found';
  end if;

  if v_list.status = 'archived' then
    raise exception 'cannot complete an archived grocery list';
  end if;

  if v_list.status = 'completed' then
    -- Idempotent: a retry / duplicate tap / lost-response replay. Return this
    -- already-completed trip and whatever active list the user has now. Do NOT
    -- change completed_at, do NOT create another list.
    v_completed := v_list;
  else
    update public.grocery_lists
    set status = 'completed', completed_at = now()
    where id = p_list_id and user_id = auth.uid()
    returning * into v_completed;
  end if;

  -- Ensure the user has an active list (the completion above freed the partial
  -- unique slot; the on-conflict guards a concurrent client that already made
  -- one). Never creates a second active list.
  select * into v_active
  from public.grocery_lists
  where user_id = auth.uid() and status = 'active'
  order by created_at asc
  limit 1;

  if not found then
    insert into public.grocery_lists (user_id)
    values (auth.uid())
    on conflict (user_id) where (status = 'active') do nothing
    returning * into v_active;

    if not found then
      select * into v_active
      from public.grocery_lists
      where user_id = auth.uid() and status = 'active'
      order by created_at asc
      limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'completedList', to_jsonb(v_completed),
    'activeList', to_jsonb(v_active)
  );
end;
$$;

comment on function public.complete_grocery_list is
  'security definer: see the section header. Atomic - freezes the trip and creates the replacement active list together. Idempotent on an already-completed list.';

grant execute on function public.complete_grocery_list(uuid) to authenticated;
