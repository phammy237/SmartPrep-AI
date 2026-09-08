-- Phase: barcode scanning as a pantry intake method.
--
-- A user scans a UPC/EAN barcode, SmartPrep resolves the packaged product
-- (Open Food Facts), the user reviews and edits it, and the item enters the
-- pantry through the EXISTING create_pantry_item invariant - never a second
-- insertion path, never a silent insert from the scanner.
--
-- ============================================================================
-- What this migration changes
-- ============================================================================
--   pantry_items.scan_source          gains 'barcode' as a distinct provenance
--                                     value, so downstream analytics can tell
--                                     barcode intake apart from vision scan.
--
--   pantry_items.barcode / brand / fdc_id   these columns already exist
--                                     (reserved since migration 0002); they are
--                                     now actually populated, by three new
--                                     optional args on create_pantry_item.
--
--   create_pantry_item(..., p_barcode text, p_brand text, p_fdc_id text)
--                                     three trailing optional args. Manual /
--                                     scan / grocery callers pass null and get
--                                     identical behaviour. CREATE OR REPLACE
--                                     cannot add a parameter, so the 0009
--                                     definition is dropped and recreated - body
--                                     unchanged apart from the three new columns
--                                     on insert.
--
-- Not added: no provider cache table (barcode lookup volume is one-at-a-time
-- per user; OFF results are not persisted server-side), no (user_id, barcode)
-- uniqueness (a user may legitimately buy the same product repeatedly - barcode
-- is provenance, not an idempotency key).
--
-- Security: create_pantry_item stays security definer, derives identity from
-- auth.uid(), and inserts with user_id = auth.uid(). The new columns are plain
-- attributes on an already-owner-scoped row - they add no new access path and
-- no new RLS surface. RLS on pantry_items (owner-only select/update) already
-- covers them.

-- ============================================================================
-- 1. scan_source: add 'barcode'
-- ============================================================================

alter table public.pantry_items
  drop constraint if exists pantry_items_scan_source_check;

alter table public.pantry_items
  add constraint pantry_items_scan_source_check
  check (scan_source in ('manual', 'scan', 'grocery', 'barcode'));

comment on column public.pantry_items.scan_source is
  'Provenance of this lot: manual entry, vision scan, grocery transfer, or barcode scan. Barcode intake is distinct from vision ''scan'' on purpose.';

comment on column public.pantry_items.barcode is
  'The UPC/EAN scanned or typed when this lot was added via barcode intake, normalized (digits only, UPC-E expanded to UPC-A). Provenance only - NOT unique, a user may buy the same product many times.';

comment on column public.pantry_items.brand is
  'Brand string from the barcode product lookup, when available. Display/provenance only.';

-- ============================================================================
-- 2. create_pantry_item: 3 trailing optional args for barcode provenance
-- ============================================================================

drop function if exists public.create_pantry_item(
  text, text, text, text, numeric, text, text, text, date, date, text, text, date, text, text, text, uuid
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
  p_fdc_id text default null
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

  -- Idempotent for grocery transfer: one grocery line -> one pantry item.
  if p_source_grocery_item_id is not null then
    select * into result
    from public.pantry_items
    where source_grocery_item_id = p_source_grocery_item_id and user_id = auth.uid();
    if found then
      return result;
    end if;
  end if;

  -- Barcode intake has NO server-side idempotency key: the same barcode may be
  -- added many times on purpose. Camera double-fire is suppressed client-side
  -- in the scan session, not here.

  insert into public.pantry_items (
    user_id, ingredient_id, normalized_name, display_name, image_uri, category,
    quantity, unit, storage_location, notes, purchase_date, opened_date,
    user_provided_date, user_provided_date_type, estimated_expiration_date,
    expiration_confidence, scan_source, source_scan_detection_id, source_grocery_item_id,
    barcode, brand, fdc_id
  ) values (
    auth.uid(), p_ingredient_id, lower(regexp_replace(trim(p_display_name), '\s+', ' ', 'g')), p_display_name,
    p_image_uri, p_category, p_quantity, p_unit, p_storage_location, p_notes, p_purchase_date, p_opened_date,
    p_user_provided_date, p_user_provided_date_type, p_estimated_expiration_date,
    coalesce(p_expiration_confidence, 'unknown'), p_source, p_source_scan_detection_id, p_source_grocery_item_id,
    p_barcode, p_brand, p_fdc_id
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
  'security definer: see justification comment in migration 0002. Idempotent when p_source_scan_detection_id (scan) OR p_source_grocery_item_id (grocery transfer) is given. Barcode intake passes p_source = ''barcode'' + p_barcode/p_brand/p_fdc_id and is intentionally NOT idempotency-keyed.';

grant execute on function public.create_pantry_item(
  text, text, text, text, numeric, text, text, text, date, date, text, text, date, text, text, text, uuid, text, text, text
) to authenticated;

revoke execute on function public.create_pantry_item(
  text, text, text, text, numeric, text, text, text, date, date, text, text, date, text, text, text, uuid, text, text, text
) from public;
