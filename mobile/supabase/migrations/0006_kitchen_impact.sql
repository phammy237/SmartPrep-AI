-- Phase 4 (kitchen impact): derived metrics from the real pantry event ledger.
--
-- No new table. `pantry_events` (0002) is the source of truth for everything
-- about food moving in and out of the pantry; `cooking_events` (0003) is read
-- only for the completed-session count. There is deliberately NO second
-- mutable impact ledger - every number here is an aggregate query, computed
-- on demand.
--
-- ============================================================================
-- Event taxonomy (MUST stay in sync with utils/impactTaxonomy.ts - Postgres
-- has no import, so the event_type lists below are duplicated there by hand)
-- ============================================================================
--   added               inventory added        -> itemsAddedCount only; NOT used, NOT discarded
--   consumed            direct pantry use       -> counts toward "used" (count + qty-by-unit)
--   deducted_by_cooking pantry left for a cook  -> counts toward "used" (count + qty-by-unit)
--   depleted            "mark as fully used"    -> counts toward "used" (the pantry UI's
--                                                  Finished action literally asks
--                                                  "Mark ... as fully used?")
--   discarded           thrown away             -> counts toward "discarded" (count + qty-by-unit)
--   adjusted            inventory recount       -> EXCLUDED (direction is not a real
--                                                  consumption/waste signal)
--   corrected           data correction         -> EXCLUDED (written by deplete_pantry_item
--                                                  'corrected' AND by confirm_pantry_item's
--                                                  delta-0 "still have this"; the food did
--                                                  not necessarily move)
--   restored            item reactivated        -> EXCLUDED (status change, no food movement)
--   donated / traded    reserved, never written -> EXCLUDED (would be "given away" - neither
--                                                  used by me nor wasted)
--
-- Duplicate-counting prevention: `meal_logs` and `prepared_meals` write NO
-- `pantry_events` rows (the pantry is deducted once, at cook time, via
-- `deducted_by_cooking`). So counting outflow strictly from `pantry_events`
-- counts each real consumption exactly once - cooking a batch, then eating the
-- leftovers over three days, is one set of `deducted_by_cooking` events and
-- nothing more. `cookingSessionsCount` comes from `cooking_events` and is a
-- count of *sessions*, not food, so it cannot double-count either. A
-- cancelled or failed `complete_cooking_event` writes nothing (atomic
-- rollback) and `cancel_cooking_event` writes nothing, so cancelled/failed
-- cooking has no ledger footprint to exclude.
--
-- Metrics intentionally NOT produced (the ledger cannot support them
-- honestly, so they are absent rather than faked):
--   * any cost / money-saved figure  - no pricing data anywhere
--   * any weight (lbs/kg) of food     - no per-item mass data
--   * any CO2 / emissions figure      - no emissions model
--   * "waste avoided"                 - nothing records whether an item was
--                                       still within its freshness window when
--                                       it was used; "used" != "waste avoided"
--   * ingredients-used-before-freshness-window - same reason
--   * a cross-unit total              - no unit-conversion table exists;
--                                       quantities are grouped BY unit, never summed across
--
-- ============================================================================
-- get_kitchen_impact_summary
--
-- SECURITY INVOKER: every table it reads (`pantry_events`, `cooking_events`)
-- already has an owner-scoped SELECT policy, and the function needs no
-- privilege the caller lacks. The explicit `user_id = auth.uid()` predicate
-- is belt-and-braces on top of RLS. There is no reason to use SECURITY
-- DEFINER here (no cross-row invariant, no write, nothing elevated).
--
-- Time range: `p_start_date` / `p_end_date` are LOCAL CALENDAR DATES
-- (inclusive) in `p_timezone`; the function converts them to instants with
-- Postgres `AT TIME ZONE` (DST-correct). Either bound null = unbounded on
-- that side ("all time" passes both null). An unrecognized `p_timezone`
-- falls back to 'UTC' - the same documented fallback expiration urgency and
-- nutrition day-boundaries use elsewhere in this app.
-- ============================================================================

create function public.get_kitchen_impact_summary(
  p_start_date date default null,
  p_end_date date default null,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text := 'UTC';
  v_lower timestamptz;
  v_upper timestamptz;
  v_added int;
  v_used int;
  v_discarded int;
  v_cooking int;
  v_used_by_unit jsonb;
  v_discarded_by_unit jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_timezone is not null
     and length(trim(p_timezone)) > 0
     and exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    v_tz := p_timezone;
  end if;

  v_lower := case when p_start_date is null then null
                  else (p_start_date::timestamp at time zone v_tz) end;
  v_upper := case when p_end_date is null then null
                  else ((p_end_date + 1)::timestamp at time zone v_tz) end;

  select
    count(*) filter (where pe.event_type = 'added'),
    count(*) filter (where pe.event_type in ('consumed', 'deducted_by_cooking', 'depleted')),
    count(*) filter (where pe.event_type = 'discarded')
  into v_added, v_used, v_discarded
  from public.pantry_events pe
  where pe.user_id = v_uid
    and (v_lower is null or pe.occurred_at >= v_lower)
    and (v_upper is null or pe.occurred_at < v_upper);

  select count(*)
  into v_cooking
  from public.cooking_events ce
  where ce.user_id = v_uid
    and ce.status = 'completed'
    and (v_lower is null or ce.completed_at >= v_lower)
    and (v_upper is null or ce.completed_at < v_upper);

  -- Quantities grouped BY unit - never summed across units (no conversion table).
  select coalesce(
    jsonb_agg(
      jsonb_build_object('unit', g.unit, 'totalQuantity', g.total_qty, 'eventCount', g.evt_count)
      order by g.unit
    ),
    '[]'::jsonb
  )
  into v_used_by_unit
  from (
    select coalesce(pe.unit, 'unknown') as unit,
           sum(abs(pe.quantity_delta)) as total_qty,
           count(*) as evt_count
    from public.pantry_events pe
    where pe.user_id = v_uid
      and pe.event_type in ('consumed', 'deducted_by_cooking', 'depleted')
      and (v_lower is null or pe.occurred_at >= v_lower)
      and (v_upper is null or pe.occurred_at < v_upper)
    group by coalesce(pe.unit, 'unknown')
  ) g;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('unit', g.unit, 'totalQuantity', g.total_qty, 'eventCount', g.evt_count)
      order by g.unit
    ),
    '[]'::jsonb
  )
  into v_discarded_by_unit
  from (
    select coalesce(pe.unit, 'unknown') as unit,
           sum(abs(pe.quantity_delta)) as total_qty,
           count(*) as evt_count
    from public.pantry_events pe
    where pe.user_id = v_uid
      and pe.event_type = 'discarded'
      and (v_lower is null or pe.occurred_at >= v_lower)
      and (v_upper is null or pe.occurred_at < v_upper)
    group by coalesce(pe.unit, 'unknown')
  ) g;

  return jsonb_build_object(
    'itemsAddedCount', coalesce(v_added, 0),
    'itemsUsedCount', coalesce(v_used, 0),
    'itemsDiscardedCount', coalesce(v_discarded, 0),
    'cookingSessionsCount', coalesce(v_cooking, 0),
    'utilizationRate',
      case when coalesce(v_used, 0) + coalesce(v_discarded, 0) > 0
           then round(v_used::numeric / (v_used + v_discarded), 4)
           else null end,
    'usedQuantitiesByUnit', v_used_by_unit,
    'discardedQuantitiesByUnit', v_discarded_by_unit,
    'hasActivity',
      (coalesce(v_added, 0) + coalesce(v_used, 0) + coalesce(v_discarded, 0) + coalesce(v_cooking, 0)) > 0
  );
end;
$$;

comment on function public.get_kitchen_impact_summary is
  'security invoker: reads pantry_events (+ cooking_events for the session count) under the caller''s RLS. Aggregate-only, no second ledger. See the header comment in 0006_kitchen_impact.sql for the event taxonomy and the metrics deliberately not produced.';

grant execute on function public.get_kitchen_impact_summary(date, date, text) to authenticated;
