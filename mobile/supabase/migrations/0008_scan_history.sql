-- Phase 6: durable Scan History + retry-safe (idempotent) scan confirmation.
--
-- Until now a "confirmed scan" existed only in an in-memory mock. This adds
-- the minimum normalized schema to make it a real, per-user record, and makes
-- confirming a scan safe to retry after a partial failure or a lost network
-- response.
--
-- ============================================================================
-- Lifecycle
-- ============================================================================
--   capture / vision inference  -> in-memory Review session (unchanged)
--
--   first Confirm  -> begin_scan_confirmation(): one durable `scans` row in
--                     status 'confirming', keyed by (user_id, client_scan_id)
--                     so a retry RESUMES it instead of creating a second scan;
--                     plus one `scan_detections` intent row per non-removed
--                     detection (keyed by the stable Review-session ids).
--
--   per detection  -> create_pantry_item(..., p_source_scan_detection_id):
--                     creates the pantry item exactly ONCE for that detection
--                     (unique index enforces it), then link_scan_detection()
--                     records scan_detections.pantry_item_id.
--
--   all linked     -> finalize_scan_confirmation(): flips `scans` to
--                     'confirmed'. A no-op while any detection is still
--                     pending; keeps the first confirmed_at on repeat calls.
--
-- Idempotency is enforced by the DATABASE, not by client/React state:
--   * scans            : unique (user_id, client_scan_id)
--   * scan_detections  : unique (scan_id, detection_id)
--   * pantry_items     : unique (source_scan_detection_id) where not null
-- A lost response after a successful insert is recovered on the next attempt
-- by re-querying the source key (create_pantry_item returns the existing row).
--
-- The pantry stays the single source of truth for inventory. These tables
-- store the user-CONFIRMED representation for History and for confirmation
-- recovery only - never a second mutable pantry ledger. No scan photos, no
-- base64, no data URLs are stored here or anywhere.

-- ============================================================================
-- pantry_items: idempotency source key for scan-created items
-- ============================================================================

alter table public.pantry_items
  add column source_scan_detection_id text;

comment on column public.pantry_items.source_scan_detection_id is
  'Scan-confirmed items only: the stable ScanDetection id (= scan_detections.detection_id) this item was created from. UNIQUE per user - at most one pantry item may originate from a given confirmed scan detection, which is what makes scan confirmation retry-safe and recoverable after a lost response. Null for manual / grocery items.';

create unique index pantry_items_source_scan_detection_uq
  on public.pantry_items (user_id, source_scan_detection_id)
  where source_scan_detection_id is not null;

-- Rebuild create_pantry_item with a 16th optional argument. CREATE OR REPLACE
-- cannot add a parameter, so the 0002 definition is dropped and recreated.
-- The body is the 0002 body plus (1) an early idempotent return when a row
-- already exists for p_source_scan_detection_id and (2) the new column on
-- insert. Manual / grocery callers pass null and get identical behaviour.
drop function if exists public.create_pantry_item(text, text, text, text, numeric, text, text, text, date, date, text, text, date, text, text);

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
  p_source_scan_detection_id text default null
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

  -- Idempotent for scan confirmation: a scan-confirmed detection produces
  -- exactly one pantry item. If the write already happened (and the client
  -- lost the response), return the existing row - no second item, no second
  -- 'added' ledger event.
  if p_source_scan_detection_id is not null then
    select * into result
    from public.pantry_items
    where source_scan_detection_id = p_source_scan_detection_id and user_id = auth.uid();
    if found then
      return result;
    end if;
  end if;

  insert into public.pantry_items (
    user_id, ingredient_id, normalized_name, display_name, image_uri, category,
    quantity, unit, storage_location, notes, purchase_date, opened_date,
    user_provided_date, user_provided_date_type, estimated_expiration_date,
    expiration_confidence, scan_source, source_scan_detection_id
  ) values (
    auth.uid(), p_ingredient_id, lower(regexp_replace(trim(p_display_name), '\s+', ' ', 'g')), p_display_name,
    p_image_uri, p_category, p_quantity, p_unit, p_storage_location, p_notes, p_purchase_date, p_opened_date,
    p_user_provided_date, p_user_provided_date_type, p_estimated_expiration_date,
    coalesce(p_expiration_confidence, 'unknown'), p_source, p_source_scan_detection_id
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
  'security definer: see justification comment in migration 0002. Idempotent when p_source_scan_detection_id is given (scan confirmation only): a repeat call returns the existing row instead of inserting a duplicate item / event.';

grant execute on function public.create_pantry_item(
  text, text, text, text, numeric, text, text, text, date, date, text, text, date, text, text, text
) to authenticated;

-- ============================================================================
-- scans - one row per scan session that reached Confirm
-- ============================================================================

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The stable id from the in-memory Review session (scanSessionStore). Reused
  -- verbatim across every Confirm retry, so a retry resumes THIS scan.
  client_scan_id text not null,
  mode text not null check (mode in ('quick', 'guided')),
  status text not null default 'confirming' check (status in ('confirming', 'confirmed')),
  started_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_scan_id),
  constraint scans_confirmed_consistent check (
    (status = 'confirmed' and confirmed_at is not null) or status = 'confirming'
  ),
  constraint scans_timestamps_ordered check (confirmed_at is null or confirmed_at >= started_at)
);

comment on table public.scans is
  'Durable scan sessions. Written only by the security-definer RPCs below (no client insert/update/delete grant), same pattern as cooking_events.';

create index scans_user_status_idx on public.scans (user_id, status, confirmed_at desc);

alter table public.scans enable row level security;

grant select on public.scans to authenticated;

create policy "scans_select_own" on public.scans
  for select using (auth.uid() = user_id);

create trigger scans_set_updated_at
  before update on public.scans
  for each row execute function public.set_updated_at();

-- ============================================================================
-- scan_sections - which areas a GUIDED scan engaged with (incl. skipped).
-- Quick scans store nothing here (their detections carry section = null).
-- Summary counts are deliberately NOT stored - they are derivable from
-- scan_detections and would be duplicate mutable truth.
-- ============================================================================

create table public.scan_sections (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  section text not null check (section in ('fridge', 'freezer', 'pantry')),
  skipped boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (scan_id, section)
);

create index scan_sections_scan_idx on public.scan_sections (scan_id);

alter table public.scan_sections enable row level security;

grant select on public.scan_sections to authenticated;

-- No user_id column: ownership is enforced through the parent scan.
create policy "scan_sections_select_own" on public.scan_sections
  for select using (
    exists (select 1 from public.scans s where s.id = scan_id and s.user_id = auth.uid())
  );

-- ============================================================================
-- scan_detections - the user-CONFIRMED representation of each detection, and
-- its 1:1 link to the pantry item it produced. pantry_item_id null = still
-- pending; a Confirm retry targets exactly those rows.
-- ============================================================================

create table public.scan_detections (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  -- Stable per-detection id from the Review session (ScanDetection.id).
  detection_id text not null,
  section text check (section in ('fridge', 'freezer', 'pantry')),
  display_name text not null,
  -- Canonical catalog id when the name resolved exactly, else null.
  canonical_ingredient_id text,
  quantity numeric not null check (quantity > 0),
  unit text not null check (
    unit in ('item', 'container', 'bag', 'bottle', 'can', 'package', 'serving', 'g', 'kg', 'oz', 'lb', 'ml', 'L')
  ),
  category text check (category in ('produce', 'protein', 'dairy', 'pantry', 'frozen', 'other')),
  identity_edited boolean not null default false,
  quantity_edited boolean not null default false,
  -- The pantry item this confirmed detection created. Null until it succeeds.
  pantry_item_id uuid references public.pantry_items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_id, detection_id)
);

create index scan_detections_scan_idx on public.scan_detections (scan_id);
create index scan_detections_pantry_item_idx on public.scan_detections (pantry_item_id);

alter table public.scan_detections enable row level security;

grant select on public.scan_detections to authenticated;

create policy "scan_detections_select_own" on public.scan_detections
  for select using (
    exists (select 1 from public.scans s where s.id = scan_id and s.user_id = auth.uid())
  );

create trigger scan_detections_set_updated_at
  before update on public.scan_detections
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Confirmation RPCs. All are security definer - the ONLY write path for the
-- three tables above. Each derives identity from auth.uid(), rejects a null
-- auth.uid(), re-checks ownership explicitly (RLS does not apply inside a
-- security-definer function), and locks search_path to ''. Every one is
-- idempotent so the whole confirmation flow is safe to retry.
--
-- The intent payloads (p_sections / p_detections) use snake_case keys so
-- jsonb_to_recordset maps them directly; scanHistoryRepository builds them.
-- ============================================================================

-- begin_scan_confirmation: create/refresh the durable scan + its detection
-- intent. Never creates a second scan for the same client_scan_id, never
-- re-inserts a detection, never disturbs a detection that already has a
-- pantry_item_id. Prunes only still-pending intent rows the user has since
-- removed in Review.
create function public.begin_scan_confirmation(
  p_client_scan_id text,
  p_mode text,
  p_started_at timestamptz default null,
  p_sections jsonb default '[]'::jsonb,
  p_detections jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan public.scans;
  v_ids text[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_mode not in ('quick', 'guided') then
    raise exception 'invalid scan mode: %', p_mode;
  end if;
  if p_client_scan_id is null or length(trim(p_client_scan_id)) = 0 then
    raise exception 'client_scan_id is required';
  end if;

  insert into public.scans (user_id, client_scan_id, mode, started_at)
  values (auth.uid(), p_client_scan_id, p_mode, coalesce(p_started_at, now()))
  on conflict (user_id, client_scan_id) do nothing;

  select * into v_scan
  from public.scans
  where user_id = auth.uid() and client_scan_id = p_client_scan_id;

  -- Guided sections (presence + skipped state). Ignored for quick mode.
  if p_mode = 'guided' then
    insert into public.scan_sections (scan_id, section, skipped, sort_order)
    select v_scan.id, e.section, coalesce(e.skipped, false), coalesce(e.sort_order, 0)
    from jsonb_to_recordset(coalesce(p_sections, '[]'::jsonb))
      as e(section text, skipped boolean, sort_order integer)
    where e.section in ('fridge', 'freezer', 'pantry')
    on conflict (scan_id, section) do update
      set skipped = excluded.skipped, sort_order = excluded.sort_order;
  end if;

  -- Prune pending intent rows for detections the user removed between retries
  -- (a linked detection is never touched).
  select coalesce(array_agg(e.detection_id), '{}')
  into v_ids
  from jsonb_to_recordset(coalesce(p_detections, '[]'::jsonb)) as e(detection_id text);

  delete from public.scan_detections
  where scan_id = v_scan.id
    and pantry_item_id is null
    and not (detection_id = any (v_ids));

  insert into public.scan_detections (
    scan_id, detection_id, section, display_name, canonical_ingredient_id,
    quantity, unit, category, identity_edited, quantity_edited
  )
  select
    v_scan.id, e.detection_id, nullif(e.section, ''), e.display_name,
    nullif(e.canonical_ingredient_id, ''), e.quantity, e.unit, nullif(e.category, ''),
    coalesce(e.identity_edited, false), coalesce(e.quantity_edited, false)
  from jsonb_to_recordset(coalesce(p_detections, '[]'::jsonb)) as e(
    detection_id text, section text, display_name text, canonical_ingredient_id text,
    quantity numeric, unit text, category text, identity_edited boolean, quantity_edited boolean
  )
  on conflict (scan_id, detection_id) do update set
    section = excluded.section,
    display_name = excluded.display_name,
    canonical_ingredient_id = excluded.canonical_ingredient_id,
    quantity = excluded.quantity,
    unit = excluded.unit,
    category = excluded.category,
    identity_edited = excluded.identity_edited,
    quantity_edited = excluded.quantity_edited,
    updated_at = now()
  -- Freeze a detection whose pantry item already exists.
  where public.scan_detections.pantry_item_id is null;

  return jsonb_build_object(
    'scanId', v_scan.id,
    'status', v_scan.status,
    'detections', (
      select coalesce(
        jsonb_agg(jsonb_build_object('detectionId', sd.detection_id, 'pantryItemId', sd.pantry_item_id)),
        '[]'::jsonb
      )
      from public.scan_detections sd
      where sd.scan_id = v_scan.id
    )
  );
end;
$$;

comment on function public.begin_scan_confirmation is
  'security definer: see the RPC section header. Idempotent - safe to call on every Confirm retry.';

grant execute on function public.begin_scan_confirmation(text, text, timestamptz, jsonb, jsonb) to authenticated;

-- link_scan_detection: record the pantry item created for a confirmed
-- detection. Idempotent for the same (detection, item); rejects pointing a
-- detection at a different item.
create function public.link_scan_detection(
  p_scan_id uuid,
  p_detection_id text,
  p_pantry_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.scans where id = p_scan_id and user_id = auth.uid()) then
    raise exception 'scan not found';
  end if;
  if not exists (select 1 from public.pantry_items where id = p_pantry_item_id and user_id = auth.uid()) then
    raise exception 'pantry item not found';
  end if;

  update public.scan_detections
  set pantry_item_id = p_pantry_item_id, updated_at = now()
  where scan_id = p_scan_id
    and detection_id = p_detection_id
    and (pantry_item_id is null or pantry_item_id = p_pantry_item_id);
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'scan detection % not found, or already linked to a different pantry item', p_detection_id;
  end if;
end;
$$;

comment on function public.link_scan_detection is
  'security definer: see the RPC section header. Idempotent for the same detection/item pair.';

grant execute on function public.link_scan_detection(uuid, text, uuid) to authenticated;

-- finalize_scan_confirmation: flip the scan to 'confirmed' once every
-- confirmed detection has a pantry item. A no-op (returns the current row)
-- while any detection is still pending, and keeps the original confirmed_at
-- on repeat calls - always safe to retry.
create function public.finalize_scan_confirmation(p_scan_id uuid)
returns public.scans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan public.scans;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_scan from public.scans where id = p_scan_id and user_id = auth.uid();
  if not found then
    raise exception 'scan not found';
  end if;

  if not exists (
    select 1 from public.scan_detections where scan_id = p_scan_id and pantry_item_id is null
  ) then
    update public.scans
    set status = 'confirmed',
        confirmed_at = coalesce(confirmed_at, now()),
        updated_at = now()
    where id = p_scan_id and user_id = auth.uid()
    returning * into v_scan;
  end if;

  return v_scan;
end;
$$;

comment on function public.finalize_scan_confirmation is
  'security definer: see the RPC section header. Idempotent - reconciles the scan to confirmed without duplicating anything.';

grant execute on function public.finalize_scan_confirmation(uuid) to authenticated;
