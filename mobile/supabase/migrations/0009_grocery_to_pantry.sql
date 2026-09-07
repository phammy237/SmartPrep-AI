-- Phase 7: explicit "purchased grocery items -> pantry" transfer.
--
-- Checking a grocery item still means ACQUIRED, never "in the pantry". This
-- migration adds a separate, explicit transfer step so an acquired line can be
-- turned into real pantry inventory - reviewed and confirmed by the user, one
-- pantry lot per grocery line, and safe to retry.
--
-- ============================================================================
-- What is added
-- ============================================================================
--   pantry_items.source_grocery_item_id   the grocery line this lot came from.
--                                         UNIQUE per user -> one grocery
--                                         transfer produces exactly one pantry
--                                         item. Separate from
--                                         source_scan_detection_id: a scan
--                                         detection and a grocery line are
--                                         different provenance and never share
--                                         an idempotency key.
--
--   grocery_list_items.pantry_transfer_status / pantry_transferred_at /
--   pantry_item_id   the acquired line's transfer state. is_checked is left
--                    alone - "acquired" and "transferred to pantry" are
--                    independent facts.
--
--   create_pantry_item(..., p_source_grocery_item_id uuid)   a 17th optional
--                    arg mirroring the scan idempotency arg: when set, a repeat
--                    call returns the existing row instead of inserting a
--                    duplicate item / 'added' event.
--
--   transfer_grocery_item_to_pantry(...)   the atomic, security-definer entry
--                    point: verify ownership + acquisition, create/reuse the
--                    pantry lot through the existing invariant, link it back,
--                    mark the line transferred - all in one transaction.
--
-- Idempotency is DB-enforced:
--   pantry_items : unique (user_id, source_grocery_item_id) where not null
-- A lost response after a successful insert is recovered on the next attempt
-- by re-querying that source key.
--
-- Identity comes from auth.uid(); a client-supplied user id is never trusted.
-- The pantry stays the single source of truth for inventory - this creates
-- pantry rows through create_pantry_item, never a second insertion path.

-- ============================================================================
-- pantry_items: grocery-transfer provenance + idempotency key
-- ============================================================================

alter table public.pantry_items
  add column source_grocery_item_id uuid references public.grocery_list_items (id) on delete set null;

comment on column public.pantry_items.source_grocery_item_id is
  'Grocery-transferred items only: the grocery_list_items row this lot was created from. UNIQUE per user - at most one pantry item per grocery line, which is what makes the transfer retry-safe and recoverable after a lost response. Distinct from source_scan_detection_id. Null for manual / scan items.';

create unique index pantry_items_source_grocery_item_uq
  on public.pantry_items (user_id, source_grocery_item_id)
  where source_grocery_item_id is not null;

-- Rebuild create_pantry_item with a 17th optional argument. CREATE OR REPLACE
-- cannot add a parameter, so the 0008 definition is dropped and recreated -
-- body unchanged apart from the new idempotent early-return branch and the new
-- column on insert. Manual / scan callers pass null and get identical behaviour.
drop function if exists public.create_pantry_item(
  text, text, text, text, numeric, text, text, text, date, date, text, text, date, text, text, text
);

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
  p_source text default 'manual',
  p_source_scan_detection_id text default null,
  p_source_grocery_item_id uuid default null
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

  -- Idempotent for scan confirmation: one scan detection -> one pantry item.
  if p_source_scan_detection_id is not null then
    select * into result
    from public.pantry_items
    where source_scan_detection_id = p_source_scan_detection_id and user_id = auth.uid();
    if found then
      return result;
    end if;
  end if;

  -- Idempotent for grocery transfer: one grocery line -> one pantry item. A
  -- repeat call (retry, lost response) returns the existing row - no second
  -- item, no second 'added' ledger event.
  if p_source_grocery_item_id is not null then
    select * into result
    from public.pantry_items
    where source_grocery_item_id = p_source_grocery_item_id and user_id = auth.uid();
    if found then
      return result;
    end if;
  end if;

  insert into public.pantry_items (
    user_id, ingredient_id, normalized_name, display_name, image_uri, category,
    quantity, unit, storage_location, notes, purchase_date, opened_date,
    user_provided_date, user_provided_date_type, estimated_expiration_date,
    expiration_confidence, scan_source, source_scan_detection_id, source_grocery_item_id
  ) values (
    auth.uid(), p_ingredient_id, lower(regexp_replace(trim(p_display_name), '\s+', ' ', 'g')), p_display_name,
    p_image_uri, p_category, p_quantity, p_unit, p_storage_location, p_notes, p_purchase_date, p_opened_date,
    p_user_provided_date, p_user_provided_date_type, p_estimated_expiration_date,
    coalesce(p_expiration_confidence, 'unknown'), p_source, p_source_scan_detection_id, p_source_grocery_item_id
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

comment on function public.create_pantry_item is
  'security definer: see justification comment in migration 0002. Idempotent when p_source_scan_detection_id (scan) OR p_source_grocery_item_id (grocery transfer) is given: a repeat call returns the existing row instead of inserting a duplicate item / event.';

grant execute on function public.create_pantry_item(
  text, text, text, text, numeric, text, text, text, date, date, text, text, date, text, text, text, uuid
) to authenticated;

-- ============================================================================
-- grocery_list_items: transfer state (independent of is_checked)
-- ============================================================================

alter table public.grocery_list_items
  add column pantry_transfer_status text not null default 'not_transferred'
    check (pantry_transfer_status in ('not_transferred', 'transferred')),
  add column pantry_transferred_at timestamptz,
  add column pantry_item_id uuid references public.pantry_items (id) on delete set null;

comment on column public.grocery_list_items.pantry_transfer_status is
  'Whether this acquired line has been turned into pantry inventory. Set only by transfer_grocery_item_to_pantry (not client-writable in practice - kept out of the generated Update type). Independent of is_checked: "acquired" and "in pantry" are separate facts.';

-- `pantry_item_id` may be nulled by the FK if the pantry lot is later deleted;
-- the status + timestamp still record that a transfer happened.
alter table public.grocery_list_items
  add constraint grocery_list_items_transfer_consistent check (
    (pantry_transfer_status = 'transferred' and pantry_transferred_at is not null)
    or pantry_transfer_status = 'not_transferred'
  );

-- ============================================================================
-- transfer_grocery_item_to_pantry - atomic per grocery line.
--
-- security definer (RLS does not apply inside): rejects a null auth.uid(),
-- re-checks ownership of the grocery line explicitly, locks search_path to ''.
-- Idempotent - safe to call again after a partial failure or a lost response.
-- ============================================================================

create function public.transfer_grocery_item_to_pantry(
  p_grocery_item_id uuid,
  p_ingredient_id text,
  p_display_name text,
  p_image_uri text,
  p_category text,
  p_quantity numeric,
  p_unit text,
  p_storage_location text default null,
  p_notes text default null,
  p_purchase_date date default null,
  p_user_provided_date date default null,
  p_user_provided_date_type text default null,
  p_estimated_expiration_date date default null,
  p_expiration_confidence text default 'unknown'
)
returns public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grocery public.grocery_list_items;
  v_item public.pantry_items;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_grocery
  from public.grocery_list_items
  where id = p_grocery_item_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'grocery item not found';
  end if;

  -- Acquisition is required: a line only enters the pantry after it is checked.
  if not v_grocery.is_checked then
    raise exception 'grocery item is not marked as acquired';
  end if;

  -- Reuse an already-created lot for this line (retry / lost response / the
  -- state update below failing on a prior attempt).
  select * into v_item
  from public.pantry_items
  where source_grocery_item_id = p_grocery_item_id and user_id = auth.uid();

  if not found then
    -- Create through the existing invariant (item + 'added' ledger event). The
    -- source key makes create_pantry_item itself idempotent for this line.
    v_item := public.create_pantry_item(
      p_ingredient_id := p_ingredient_id,
      p_display_name := p_display_name,
      p_image_uri := p_image_uri,
      p_category := p_category,
      p_quantity := p_quantity,
      p_unit := p_unit,
      p_storage_location := p_storage_location,
      p_notes := p_notes,
      p_purchase_date := p_purchase_date,
      p_opened_date := null,
      p_user_provided_date := p_user_provided_date,
      p_user_provided_date_type := p_user_provided_date_type,
      p_estimated_expiration_date := p_estimated_expiration_date,
      p_expiration_confidence := coalesce(p_expiration_confidence, 'unknown'),
      p_source := 'grocery',
      p_source_scan_detection_id := null,
      p_source_grocery_item_id := p_grocery_item_id
    );
  end if;

  update public.grocery_list_items
  set pantry_transfer_status = 'transferred',
      pantry_item_id = v_item.id,
      pantry_transferred_at = coalesce(pantry_transferred_at, now())
  where id = p_grocery_item_id and user_id = auth.uid();

  return v_item;
end;
$$;

comment on function public.transfer_grocery_item_to_pantry is
  'security definer: see the section header. Atomic per grocery line, idempotent - one acquired grocery line becomes exactly one pantry lot, retry-safe.';

grant execute on function public.transfer_grocery_item_to_pantry(
  uuid, text, text, text, text, numeric, text, text, text, date, date, text, date, text
) to authenticated;
