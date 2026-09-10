-- Phase: Receipt OCR as a batch Pantry intake workflow.
--
-- User photographs a grocery receipt -> receipt-ocr Edge Function extracts
-- structured line items -> SmartPrep filters noise and normalizes -> user
-- reviews and selects -> confirmed items enter the Pantry through the SHARED
-- create_pantry_item invariant, one idempotent creation per receipt candidate.
--
-- Nothing enters the Pantry directly from OCR. The receipt image is never
-- stored (processed + discarded in the Edge Function). No pricing / spending
-- schema.
--
-- ============================================================================
-- What this migration adds
-- ============================================================================
--   receipt_scans          one durable row per receipt intake SESSION, keyed by
--                          (user_id, client_receipt_id). Explicit lifecycle
--                          status. Merchant + purchase date for review only.
--
--   receipt_scan_items     one row per reviewable candidate line. raw_text (the
--                          OCR evidence) is kept separate from display_name
--                          (SmartPrep's interpreted, user-editable name).
--                          candidate_id is stable per session -> the pantry
--                          creation idempotency key. Links back to its
--                          pantry_item_id once created.
--
--   pantry_items.source_receipt_candidate_id (text, UNIQUE per user)
--   pantry_items.source_receipt_id           (uuid)
--                          Receipt provenance + idempotency, mirroring
--                          source_scan_detection_id / source_grocery_item_id.
--
--   scan_source gains 'receipt'.
--
--   create_pantry_item(..., p_source_receipt_candidate_id, p_source_receipt_id)
--                          two trailing optional args + an idempotent early
--                          return, exactly like the scan / grocery keys.
--
--   begin_receipt_review / link_receipt_scan_item / finalize_receipt_review
--                          security-definer RPCs - the ONLY write path for the
--                          two tables. Every one idempotent + retry-safe.
--
-- Idempotency is DB-enforced:
--   receipt_scans      : unique (user_id, client_receipt_id)
--   receipt_scan_items : unique (receipt_scan_id, candidate_id)
--   pantry_items       : unique (user_id, source_receipt_candidate_id) where not null
-- Retrying failed candidate #5 never recreates #1-4.

-- ============================================================================
-- 1. scan_source: add 'receipt'
-- ============================================================================
alter table public.pantry_items
  drop constraint if exists pantry_items_scan_source_check;
alter table public.pantry_items
  add constraint pantry_items_scan_source_check
  check (scan_source in ('manual', 'scan', 'grocery', 'barcode', 'receipt'));

-- ============================================================================
-- 2. pantry_items: receipt provenance + idempotency
-- ============================================================================
alter table public.pantry_items
  add column source_receipt_candidate_id text,
  add column source_receipt_id uuid;

comment on column public.pantry_items.source_receipt_candidate_id is
  'Receipt-intake items only: the stable per-session candidate id this lot was created from. UNIQUE per user - at most one pantry item per receipt candidate, which makes batch receipt confirmation retry-safe. Null for every other source.';

create unique index pantry_items_source_receipt_candidate_uq
  on public.pantry_items (user_id, source_receipt_candidate_id)
  where source_receipt_candidate_id is not null;

create index pantry_items_source_receipt_idx
  on public.pantry_items (source_receipt_id)
  where source_receipt_id is not null;

-- ============================================================================
-- 3. receipt_scans
-- ============================================================================
create table public.receipt_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_receipt_id text not null,
  status text not null default 'processing'
    check (status in ('processing', 'reviewing', 'confirmed', 'partial', 'failed')),
  merchant_name text,
  purchased_at date,
  ocr_source text check (ocr_source is null or ocr_source in ('aws_textract')),
  -- raw OCR lines returned vs. lines classified as candidate grocery items.
  line_count integer not null default 0 check (line_count >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_receipt_id)
);

comment on table public.receipt_scans is
  'One durable row per receipt intake session. Written only by the security-definer receipt RPCs. No receipt image and no provider JSON is stored - only the merchant/date and counts SmartPrep needs to render + retry the review.';

create index receipt_scans_user_idx on public.receipt_scans (user_id, created_at desc);

alter table public.receipt_scans enable row level security;
grant select on public.receipt_scans to authenticated;
-- No client insert/update/delete grant.

create policy "receipt_scans_select_own" on public.receipt_scans
  for select using (auth.uid() = user_id);

create trigger receipt_scans_set_updated_at
  before update on public.receipt_scans
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4. receipt_scan_items
-- ============================================================================
create table public.receipt_scan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  receipt_scan_id uuid not null references public.receipt_scans (id) on delete cascade,
  candidate_id text not null,
  -- The untouched OCR line. Evidence - never overwritten by SmartPrep's guess.
  raw_text text not null,
  -- SmartPrep's interpreted, user-editable values.
  display_name text not null,
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  category text,
  ocr_confidence numeric check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 100)),
  candidate_status text not null default 'pending'
    check (candidate_status in ('pending', 'added', 'skipped', 'failed')),
  pantry_item_id uuid references public.pantry_items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_scan_id, candidate_id)
);

comment on table public.receipt_scan_items is
  'One reviewable candidate line per receipt session. No price is stored (Receipt OCR is an intake assistant, not expense tracking). pantry_item_id is set once the line is confirmed into the Pantry; a linked row is frozen against further OCR-side edits.';

create index receipt_scan_items_scan_idx on public.receipt_scan_items (receipt_scan_id);
create index receipt_scan_items_pantry_item_idx on public.receipt_scan_items (pantry_item_id);

alter table public.receipt_scan_items enable row level security;
grant select on public.receipt_scan_items to authenticated;

create policy "receipt_scan_items_select_own" on public.receipt_scan_items
  for select using (auth.uid() = user_id);

create trigger receipt_scan_items_set_updated_at
  before update on public.receipt_scan_items
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 5. create_pantry_item: 2 trailing optional args for receipt provenance
-- ============================================================================
-- Full 20-argument type signature of the 0012 function (arg 11
-- p_user_provided_date is `date`). A wrong list here makes the drop a silent
-- no-op and leaves the 0012 overload behind.
drop function if exists public.create_pantry_item(
  text, text, text, text, numeric, text, text, text, date, date, date, text, date, text, text, text, uuid, text, text, text
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
  p_source_grocery_item_id uuid default null,
  p_barcode text default null,
  p_brand text default null,
  p_fdc_id text default null,
  p_source_receipt_candidate_id text default null,
  p_source_receipt_id uuid default null
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

  if p_source_scan_detection_id is not null then
    select * into result from public.pantry_items
    where source_scan_detection_id = p_source_scan_detection_id and user_id = auth.uid();
    if found then return result; end if;
  end if;

  if p_source_grocery_item_id is not null then
    select * into result from public.pantry_items
    where source_grocery_item_id = p_source_grocery_item_id and user_id = auth.uid();
    if found then return result; end if;
  end if;

  -- Idempotent for receipt intake: one receipt candidate -> one pantry item.
  -- Retrying a failed candidate in a batch never recreates the ones that
  -- already succeeded.
  if p_source_receipt_candidate_id is not null then
    select * into result from public.pantry_items
    where source_receipt_candidate_id = p_source_receipt_candidate_id and user_id = auth.uid();
    if found then return result; end if;
  end if;

  insert into public.pantry_items (
    user_id, ingredient_id, normalized_name, display_name, image_uri, category,
    quantity, unit, storage_location, notes, purchase_date, opened_date,
    user_provided_date, user_provided_date_type, estimated_expiration_date,
    expiration_confidence, scan_source, source_scan_detection_id, source_grocery_item_id,
    barcode, brand, fdc_id, source_receipt_candidate_id, source_receipt_id
  ) values (
    auth.uid(), p_ingredient_id, lower(regexp_replace(trim(p_display_name), '\s+', ' ', 'g')), p_display_name,
    p_image_uri, p_category, p_quantity, p_unit, p_storage_location, p_notes, p_purchase_date, p_opened_date,
    p_user_provided_date, p_user_provided_date_type, p_estimated_expiration_date,
    coalesce(p_expiration_confidence, 'unknown'), p_source, p_source_scan_detection_id, p_source_grocery_item_id,
    p_barcode, p_brand, p_fdc_id, p_source_receipt_candidate_id, p_source_receipt_id
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

comment on function public.create_pantry_item(
  text, text, text, text, numeric, text, text, text, date, date, date, text, date, text, text, text, uuid, text, text, text, text, uuid
) is
  'security definer: see migration 0002. Idempotent when p_source_scan_detection_id (scan) OR p_source_grocery_item_id (grocery transfer) OR p_source_receipt_candidate_id (receipt intake) is given: a repeat call returns the existing row instead of inserting a duplicate item / event.';

grant execute on function public.create_pantry_item(
  text, text, text, text, numeric, text, text, text, date, date, date, text, date, text, text, text, uuid, text, text, text, text, uuid
) to authenticated;
revoke execute on function public.create_pantry_item(
  text, text, text, text, numeric, text, text, text, date, date, date, text, date, text, text, text, uuid, text, text, text, text, uuid
) from public;

-- ============================================================================
-- 6. begin_receipt_review - create/refresh the durable session + candidate intent
-- ============================================================================
-- Idempotent. Never creates a second session for the same client_receipt_id,
-- never disturbs a candidate that already has a pantry_item_id, and prunes only
-- still-pending candidate rows the user has since removed in Review. Mirrors
-- begin_scan_confirmation.
create function public.begin_receipt_review(
  p_client_receipt_id text,
  p_ocr_source text default 'aws_textract',
  p_merchant_name text default null,
  p_purchased_at date default null,
  p_line_count integer default 0,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan public.receipt_scans;
  v_ids text[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_client_receipt_id is null or length(trim(p_client_receipt_id)) = 0 then
    raise exception 'client_receipt_id is required';
  end if;

  insert into public.receipt_scans (user_id, client_receipt_id, status, ocr_source, merchant_name, purchased_at, line_count)
  values (auth.uid(), p_client_receipt_id, 'reviewing', p_ocr_source, p_merchant_name, p_purchased_at, greatest(coalesce(p_line_count, 0), 0))
  on conflict (user_id, client_receipt_id) do update set
    status = case when public.receipt_scans.status in ('confirmed') then public.receipt_scans.status else 'reviewing' end,
    merchant_name = coalesce(excluded.merchant_name, public.receipt_scans.merchant_name),
    purchased_at = coalesce(excluded.purchased_at, public.receipt_scans.purchased_at),
    line_count = greatest(excluded.line_count, public.receipt_scans.line_count),
    updated_at = now();

  select * into v_scan from public.receipt_scans
  where user_id = auth.uid() and client_receipt_id = p_client_receipt_id;

  select coalesce(array_agg(e.candidate_id), '{}')
  into v_ids
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as e(candidate_id text);

  -- Drop pending candidate rows for lines removed between retries; a linked one is never touched.
  delete from public.receipt_scan_items
  where receipt_scan_id = v_scan.id
    and pantry_item_id is null
    and not (candidate_id = any (v_ids));

  insert into public.receipt_scan_items (
    user_id, receipt_scan_id, candidate_id, raw_text, display_name, quantity, unit, category, ocr_confidence
  )
  select
    auth.uid(), v_scan.id, e.candidate_id, e.raw_text, e.display_name, e.quantity, nullif(e.unit, ''),
    nullif(e.category, ''), e.ocr_confidence
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as e(
    candidate_id text, raw_text text, display_name text, quantity numeric, unit text, category text, ocr_confidence numeric
  )
  on conflict (receipt_scan_id, candidate_id) do update set
    display_name = excluded.display_name,
    quantity = excluded.quantity,
    unit = excluded.unit,
    category = excluded.category,
    ocr_confidence = excluded.ocr_confidence,
    updated_at = now()
  where public.receipt_scan_items.pantry_item_id is null;

  update public.receipt_scans
  set item_count = (select count(*) from public.receipt_scan_items where receipt_scan_id = v_scan.id)
  where id = v_scan.id;

  return jsonb_build_object(
    'receiptScanId', v_scan.id,
    'status', (select status from public.receipt_scans where id = v_scan.id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'candidateId', rsi.candidate_id,
        'pantryItemId', rsi.pantry_item_id,
        'candidateStatus', rsi.candidate_status
      )), '[]'::jsonb)
      from public.receipt_scan_items rsi where rsi.receipt_scan_id = v_scan.id
    )
  );
end;
$$;

comment on function public.begin_receipt_review is
  'security definer. Idempotent - safe to call on every review-screen mount / retry. Persists only names/quantities/units/confidence, never a price or the receipt image.';

grant execute on function public.begin_receipt_review(text, text, text, date, integer, jsonb) to authenticated;
revoke execute on function public.begin_receipt_review(text, text, text, date, integer, jsonb) from public;

-- ============================================================================
-- 7. link_receipt_scan_item - record the pantry item created for a candidate
-- ============================================================================
-- Idempotent for the same (candidate, item); rejects pointing a candidate at a
-- different item. Verifies both rows belong to the caller.
create function public.link_receipt_scan_item(
  p_receipt_scan_id uuid,
  p_candidate_id text,
  p_pantry_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from public.receipt_scans where id = p_receipt_scan_id and user_id = auth.uid()) then
    raise exception 'receipt scan not found';
  end if;
  if not exists (select 1 from public.pantry_items where id = p_pantry_item_id and user_id = auth.uid()) then
    raise exception 'pantry item not found';
  end if;

  select pantry_item_id into v_existing
  from public.receipt_scan_items
  where receipt_scan_id = p_receipt_scan_id and candidate_id = p_candidate_id and user_id = auth.uid();

  if v_existing is not null and v_existing <> p_pantry_item_id then
    raise exception 'receipt candidate is already linked to a different pantry item';
  end if;

  update public.receipt_scan_items
  set pantry_item_id = p_pantry_item_id, candidate_status = 'added', updated_at = now()
  where receipt_scan_id = p_receipt_scan_id and candidate_id = p_candidate_id and user_id = auth.uid();
end;
$$;

comment on function public.link_receipt_scan_item is 'security definer. Idempotent per (candidate, item).';

grant execute on function public.link_receipt_scan_item(uuid, text, uuid) to authenticated;
revoke execute on function public.link_receipt_scan_item(uuid, text, uuid) from public;

-- ============================================================================
-- 8. finalize_receipt_review - recompute the session status from its candidates
-- ============================================================================
create function public.finalize_receipt_review(
  p_receipt_scan_id uuid,
  p_skipped_candidate_ids text[] default '{}'
)
returns public.receipt_scans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan public.receipt_scans;
  v_added int;
  v_outstanding int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_scan from public.receipt_scans where id = p_receipt_scan_id and user_id = auth.uid();
  if not found then
    raise exception 'receipt scan not found';
  end if;

  -- Candidates the user chose NOT to add (never had a pantry item) -> skipped.
  if p_skipped_candidate_ids is not null and array_length(p_skipped_candidate_ids, 1) is not null then
    update public.receipt_scan_items
    set candidate_status = 'skipped', updated_at = now()
    where receipt_scan_id = p_receipt_scan_id
      and user_id = auth.uid()
      and pantry_item_id is null
      and candidate_id = any (p_skipped_candidate_ids);
  end if;

  select
    count(*) filter (where candidate_status = 'added'),
    count(*) filter (where candidate_status in ('pending', 'failed'))
  into v_added, v_outstanding
  from public.receipt_scan_items where receipt_scan_id = p_receipt_scan_id;

  update public.receipt_scans
  set status = case
    when v_added > 0 and v_outstanding = 0 then 'confirmed'
    when v_added > 0 then 'partial'
    else 'reviewing'
  end
  where id = p_receipt_scan_id
  returning * into v_scan;

  return v_scan;
end;
$$;

comment on function public.finalize_receipt_review is 'security definer. Explicit lifecycle - status is set from candidate outcomes, never inferred from timestamps. Marks user-excluded candidates skipped.';

grant execute on function public.finalize_receipt_review(uuid, text[]) to authenticated;
revoke execute on function public.finalize_receipt_review(uuid, text[]) from public;
