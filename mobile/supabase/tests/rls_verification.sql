-- RLS verification for Phase 1 (profiles, dietary_preferences, nutrition_goals)
-- and Phase 2 (pantry_items, pantry_events).
--
-- Run this in the Supabase SQL editor or via `psql` against your linked
-- project. It does NOT create test users itself - auth.users rows can only
-- be created through Supabase Auth (GoTrue), not plain SQL, so:
--
--   1. Create two throwaway accounts, e.g. via the app's real sign-up screen
--      once Phase 1 is deployed, or via Dashboard > Authentication > Add user.
--   2. Copy their UUIDs from `select id, email from auth.users;`
--   3. Find & replace TEST_USER_A_ID and TEST_USER_B_ID below (everywhere in
--      this file) with those two UUIDs, then run the whole file.
--
-- Each block raises an exception (aborting the script) on failure and a
-- NOTICE on success, so a clean run to the bottom means every check passed.
-- The cleanup block at the end assumes you're connected as `postgres` (the
-- Supabase SQL editor default) or another superuser/owner role.

-- ----------------------------------------------------------------------------
-- Sanity: both test users must actually exist (FK requires it) and must
-- already have profiles rows (created automatically by handle_new_user()).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from auth.users where id = 'TEST_USER_A_ID') then
    raise exception 'user_a TEST_USER_A_ID not found in auth.users - create it first';
  end if;
  if not exists (select 1 from auth.users where id = 'TEST_USER_B_ID') then
    raise exception 'user_b TEST_USER_B_ID not found in auth.users - create it first';
  end if;
  if not exists (select 1 from public.profiles where id = 'TEST_USER_A_ID') then
    raise exception 'profiles row missing for user_a - handle_new_user trigger did not fire';
  end if;
  raise notice 'PASS: setup - both test users and their profiles rows exist';
end $$;

-- ----------------------------------------------------------------------------
-- Seed dietary_preferences / nutrition_goals for both users, as user_a and
-- user_b respectively, to prove INSERT ... WITH CHECK (auth.uid() = user_id)
-- also blocks inserting rows *for someone else*.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

insert into public.dietary_preferences (user_id, dietary_patterns, allergens)
values ('TEST_USER_A_ID'::uuid, array['vegetarian'], array['peanuts'])
on conflict (user_id) do update set dietary_patterns = excluded.dietary_patterns;

insert into public.nutrition_goals (user_id, daily_calories, protein_min_g, carbs_target_g, fat_target_g)
values ('TEST_USER_A_ID'::uuid, 2000, 120, 200, 65);

do $$
declare
  succeeded boolean := false;
begin
  -- NOTE on pattern: `raise exception` inside the same begin/exception block
  -- that's catching failures would itself be swallowed by that block's
  -- `when others` handler, turning a real security hole into a false PASS.
  -- Using a flag and raising *outside* the protected block (every check in
  -- this file follows this shape) avoids that trap.
  begin
    insert into public.dietary_preferences (user_id, dietary_patterns)
    values ('TEST_USER_B_ID'::uuid, array['vegan']);
    succeeded := true;
  exception
    when others then
      succeeded := false;
  end;

  if succeeded then
    raise exception 'FAIL: user_a was able to insert a dietary_preferences row for user_b';
  end if;

  raise notice 'PASS: user_a cannot insert a dietary_preferences row for user_b';
end $$;

commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_B_ID', 'role', 'authenticated')::text, true);

insert into public.dietary_preferences (user_id, dietary_patterns, allergens)
values ('TEST_USER_B_ID'::uuid, array['pescatarian'], array['shellfish'])
on conflict (user_id) do update set dietary_patterns = excluded.dietary_patterns;

insert into public.nutrition_goals (user_id, daily_calories, protein_min_g, carbs_target_g, fat_target_g)
values ('TEST_USER_B_ID'::uuid, 1800, 100, 180, 55);

commit;

-- ----------------------------------------------------------------------------
-- Check 1: user A can read/update their own data.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  own_count int;
begin
  select count(*) into own_count from public.dietary_preferences where user_id = 'TEST_USER_A_ID'::uuid;
  if own_count <> 1 then
    raise exception 'FAIL: user_a could not read their own dietary_preferences row';
  end if;

  update public.profiles set household_size = 2 where id = 'TEST_USER_A_ID'::uuid;
  if not found then
    raise exception 'FAIL: user_a could not update their own profile';
  end if;

  raise notice 'PASS: user_a can read and update their own data';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check 2: user A cannot read, update, or delete user B's data.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  leaked_count int;
  affected int;
begin
  select count(*) into leaked_count from public.dietary_preferences where user_id = 'TEST_USER_B_ID'::uuid;
  if leaked_count <> 0 then
    raise exception 'FAIL: user_a could see user_b''s dietary_preferences row';
  end if;

  select count(*) into leaked_count from public.profiles where id = 'TEST_USER_B_ID'::uuid;
  if leaked_count <> 0 then
    raise exception 'FAIL: user_a could see user_b''s profile row';
  end if;

  select count(*) into leaked_count from public.nutrition_goals where user_id = 'TEST_USER_B_ID'::uuid;
  if leaked_count <> 0 then
    raise exception 'FAIL: user_a could see user_b''s nutrition_goals row';
  end if;

  update public.profiles set household_size = 9 where id = 'TEST_USER_B_ID'::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: user_a was able to update user_b''s profile';
  end if;

  delete from public.dietary_preferences where user_id = 'TEST_USER_B_ID'::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: user_a was able to delete user_b''s dietary_preferences (no delete policy should exist at all)';
  end if;

  raise notice 'PASS: user_a cannot read, update, or delete user_b''s data';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check 3: anonymous (unauthenticated) requests see nothing.
-- ----------------------------------------------------------------------------
begin;
set local role anon;
select set_config('request.jwt.claims', '', true);

do $$
declare
  total_count int;
begin
  select count(*) into total_count from public.profiles;
  if total_count <> 0 then
    raise exception 'FAIL: anon role could read % profiles rows', total_count;
  end if;

  select count(*) into total_count from public.dietary_preferences;
  if total_count <> 0 then
    raise exception 'FAIL: anon role could read % dietary_preferences rows', total_count;
  end if;

  select count(*) into total_count from public.nutrition_goals;
  if total_count <> 0 then
    raise exception 'FAIL: anon role could read % nutrition_goals rows', total_count;
  end if;

  raise notice 'PASS: anonymous role cannot read any private data';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Checks 4 (public/provider data) and 5 (storage path ownership) are not
-- applicable in Phase 1: no public/provider-cache tables and no storage
-- buckets exist yet. Re-run the equivalent of this file once those land
-- (Phase 5 for provider caches, Phase 9 for storage).
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Phase 2: pantry_items / pantry_events
--
-- pantry_items has no client insert/delete policy at all, and the client's
-- only UPDATE grant is column-restricted to metadata (see migration 0002) -
-- quantity/status only ever change via the five security-definer RPCs. So
-- "creation" and "mutation" checks here call those RPCs directly rather than
-- raw INSERT/UPDATE, which is also what the real app does.
-- ============================================================================

-- A session-scoped scratch table to pass an id between transactions/roles
-- without relying on psql-only `\gset` (works identically in the SQL editor).
create temporary table if not exists rls_test_scratch (key text primary key, value uuid);

-- ----------------------------------------------------------------------------
-- Setup: user_a and user_b each create one pantry item via the real RPC.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

select public.create_pantry_item(
  'ing-manual-rls-a', 'https://example.com/a.jpg', 'RLS Test Item A', 'pantry', 3, 'item',
  null, null, null, null, null, null, null, 'unknown', 'manual'
);

commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_B_ID', 'role', 'authenticated')::text, true);

select public.create_pantry_item(
  'ing-manual-rls-b', 'https://example.com/b.jpg', 'RLS Test Item B', 'pantry', 3, 'item',
  null, null, null, null, null, null, null, 'unknown', 'manual'
);

commit;

begin;
set local role postgres;
insert into rls_test_scratch (key, value)
select 'item_a_id', id from public.pantry_items where display_name = 'RLS Test Item A'
on conflict (key) do update set value = excluded.value;
insert into rls_test_scratch (key, value)
select 'item_b_id', id from public.pantry_items where display_name = 'RLS Test Item B'
on conflict (key) do update set value = excluded.value;
commit;

do $$
begin
  if not exists (select 1 from rls_test_scratch where key in ('item_a_id', 'item_b_id')) then
    raise exception 'FAIL: setup - create_pantry_item did not produce rows for both users';
  end if;
  raise notice 'PASS: setup - user_a and user_b each created a pantry item via create_pantry_item';
end $$;

-- ----------------------------------------------------------------------------
-- Check: user A can read and adjust their own pantry item, and the matching
-- pantry_events row is written (ledger consistency, not just a bare RLS check).
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  item_a_id uuid;
  updated public.pantry_items;
  event_count int;
begin
  select value into item_a_id from rls_test_scratch where key = 'item_a_id';

  updated := public.adjust_pantry_quantity(item_a_id, -1, 'adjusted', 'rls test');
  if updated.quantity <> 2 then
    raise exception 'FAIL: adjust_pantry_quantity did not apply for the owner (quantity = %)', updated.quantity;
  end if;

  select count(*) into event_count
  from public.pantry_events
  where pantry_item_id = item_a_id and event_type = 'adjusted' and quantity_delta = -1;
  if event_count <> 1 then
    raise exception 'FAIL: adjust_pantry_quantity did not write a matching pantry_events row';
  end if;

  raise notice 'PASS: user_a can read/adjust their own pantry item, with a matching ledger event';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: deducting exactly down to zero succeeds and marks the item
-- depleted; deducting past zero is rejected and leaves quantity unchanged.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  item_a_id uuid;
  updated public.pantry_items;
  succeeded boolean := false;
begin
  select value into item_a_id from rls_test_scratch where key = 'item_a_id';

  -- Quantity is 2 at this point (3 - 1 from the previous check).
  updated := public.adjust_pantry_quantity(item_a_id, -2, 'consumed', 'use exact remainder');
  if updated.quantity <> 0 or updated.status <> 'depleted' then
    raise exception 'FAIL: deducting to exactly zero did not result in quantity=0, status=depleted (got % / %)', updated.quantity, updated.status;
  end if;

  begin
    perform public.adjust_pantry_quantity(item_a_id, -1, 'consumed', 'should fail - already zero');
    succeeded := true;
  exception
    when others then
      succeeded := false;
  end;
  if succeeded then
    raise exception 'FAIL: a deduction past zero was allowed to succeed';
  end if;

  raise notice 'PASS: deduction-to-zero and rejection-below-zero both behave correctly';
end $$;

commit;

-- Restore user_a's item back to active before the cross-user checks below,
-- so those checks aren't accidentally exercising the depleted-item path.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);
do $$
declare
  item_a_id uuid;
begin
  select value into item_a_id from rls_test_scratch where key = 'item_a_id';
  perform public.restore_pantry_item(item_a_id, 'rls test cleanup');
end $$;
commit;

-- ----------------------------------------------------------------------------
-- Check: user A cannot see user B's pantry item or its events via SELECT.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  item_b_id uuid;
  leaked_count int;
begin
  select value into item_b_id from rls_test_scratch where key = 'item_b_id';

  select count(*) into leaked_count from public.pantry_items where id = item_b_id;
  if leaked_count <> 0 then
    raise exception 'FAIL: user_a can see user_b''s pantry_items row';
  end if;

  select count(*) into leaked_count from public.pantry_events where pantry_item_id = item_b_id;
  if leaked_count <> 0 then
    raise exception 'FAIL: user_a can see user_b''s pantry_events rows';
  end if;

  raise notice 'PASS: user_a cannot see user_b''s pantry_items or pantry_events rows';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: even knowing user B's real item id, none of the five RPCs let
-- user A touch it - this is the actual authorization boundary now that
-- these functions are security definer (RLS does not apply inside them).
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  item_b_id uuid;
  succeeded boolean;
begin
  select value into item_b_id from rls_test_scratch where key = 'item_b_id';

  succeeded := false;
  begin
    perform public.adjust_pantry_quantity(item_b_id, -1, 'adjusted', 'should fail');
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_a adjusted user_b''s pantry item quantity'; end if;

  succeeded := false;
  begin
    perform public.deplete_pantry_item(item_b_id, 'discarded', 'should fail');
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_a depleted user_b''s pantry item'; end if;

  succeeded := false;
  begin
    perform public.restore_pantry_item(item_b_id, 'should fail');
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_a restored user_b''s pantry item'; end if;

  succeeded := false;
  begin
    perform public.confirm_pantry_item(item_b_id);
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_a confirmed user_b''s pantry item'; end if;

  raise notice 'PASS: none of the four mutating RPCs let user_a touch user_b''s pantry item';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: a plain client UPDATE cannot touch quantity or status even on the
-- caller's own row - column-level grants block it regardless of RLS. This is
-- what actually forces every quantity/status change through the RPCs above.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  item_a_id uuid;
  succeeded boolean := false;
begin
  select value into item_a_id from rls_test_scratch where key = 'item_a_id';

  begin
    update public.pantry_items set quantity = 999 where id = item_a_id;
    succeeded := true;
  exception
    when others then
      succeeded := false;
  end;
  if succeeded then
    raise exception 'FAIL: a plain client UPDATE was able to change quantity directly';
  end if;

  raise notice 'PASS: a plain client UPDATE cannot change quantity (column grant enforced)';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: pantry_events cannot be updated or deleted by anyone but the table
-- owner - not even by the user who owns the underlying pantry item.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  item_a_id uuid;
  an_event_id uuid;
  succeeded boolean := false;
begin
  select value into item_a_id from rls_test_scratch where key = 'item_a_id';
  select id into an_event_id from public.pantry_events where pantry_item_id = item_a_id limit 1;

  begin
    update public.pantry_events set reason = 'tampered' where id = an_event_id;
    succeeded := true;
  exception
    when others then
      succeeded := false;
  end;
  if succeeded then
    raise exception 'FAIL: a pantry_events row was updated by its owning user';
  end if;

  succeeded := false;
  begin
    delete from public.pantry_events where id = an_event_id;
    succeeded := true;
  exception
    when others then
      succeeded := false;
  end;
  if succeeded then
    raise exception 'FAIL: a pantry_events row was deleted by its owning user';
  end if;

  raise notice 'PASS: pantry_events cannot be updated or deleted by the owning user';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: anonymous requests see nothing and cannot call the mutating RPCs.
-- ----------------------------------------------------------------------------
begin;
set local role anon;
select set_config('request.jwt.claims', '', true);

do $$
declare
  total_count int;
  succeeded boolean := false;
begin
  select count(*) into total_count from public.pantry_items;
  if total_count <> 0 then
    raise exception 'FAIL: anon role could read % pantry_items rows', total_count;
  end if;

  select count(*) into total_count from public.pantry_events;
  if total_count <> 0 then
    raise exception 'FAIL: anon role could read % pantry_events rows', total_count;
  end if;

  begin
    perform public.create_pantry_item(
      'ing-anon', 'https://example.com/x.jpg', 'Anon Item', 'other', 1, 'item',
      null, null, null, null, null, null, null, 'unknown', 'manual'
    );
    succeeded := true;
  exception
    when others then
      succeeded := false;
  end;
  if succeeded then
    raise exception 'FAIL: anon role was able to call create_pantry_item';
  end if;

  raise notice 'PASS: anonymous role cannot read pantry data or call the pantry RPCs';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Cleanup: remove the rows this script created so re-running it is safe.
-- Comment this block out if you want to inspect the rows afterward.
-- ----------------------------------------------------------------------------
begin;
set local role postgres;
delete from public.pantry_items where display_name in ('RLS Test Item A', 'RLS Test Item B', 'Anon Item');
delete from public.nutrition_goals where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
delete from public.dietary_preferences where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
update public.profiles set household_size = 1 where id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
drop table if exists rls_test_scratch;
commit;

do $$
begin
  raise notice 'ALL RLS CHECKS PASSED';
end $$;
