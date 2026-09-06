-- RLS verification for Phase 1 (profiles, dietary_preferences, nutrition_goals),
-- Phase 2 (pantry_items, pantry_events), Phase 3 (recipes, recipe_versions,
-- recipe_ingredients, saved_recipes, meal_plan_items, cooking_events,
-- cooking_event_ingredients, prepared_meals, meal_logs), and Phase 4 grocery
-- (grocery_lists, grocery_list_items). Run migrations 0001-0005 first.
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

-- Named args: the RPC's parameter order is not the app's mental order
-- (p_display_name comes before p_image_uri), so positional calls here are a
-- trap. Naming them keeps this file correct regardless of signature order.
select public.create_pantry_item(
  p_ingredient_id => 'ing-manual-rls-a', p_display_name => 'RLS Test Item A',
  p_image_uri => 'https://example.com/a.jpg', p_category => 'pantry',
  p_quantity => 3, p_unit => 'item', p_expiration_confidence => 'unknown', p_source => 'manual'
);

commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_B_ID', 'role', 'authenticated')::text, true);

select public.create_pantry_item(
  p_ingredient_id => 'ing-manual-rls-b', p_display_name => 'RLS Test Item B',
  p_image_uri => 'https://example.com/b.jpg', p_category => 'pantry',
  p_quantity => 3, p_unit => 'item', p_expiration_confidence => 'unknown', p_source => 'manual'
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
      p_ingredient_id => 'ing-anon', p_display_name => 'Anon Item',
      p_image_uri => 'https://example.com/x.jpg', p_category => 'other',
      p_quantity => 1, p_unit => 'item', p_expiration_confidence => 'unknown', p_source => 'manual'
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
-- Cleanup (Phase 2 rows only - Phase 3 cleanup is its own block below).
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

-- ============================================================================
-- Phase 3: recipes / recipe_versions / recipe_ingredients / saved_recipes /
-- meal_plan_items / cooking_events / cooking_event_ingredients /
-- prepared_meals / meal_logs.
--
-- recipes/recipe_versions/recipe_ingredients are seeded once, globally, by
-- migration 0004 (the demo catalog) - not per-user data, so there is
-- nothing to create for those three; the checks below just read the
-- already-seeded rows. Run 0004 before this file.
--
-- Same pattern as Phase 2 throughout: every "should fail" check uses a
-- `succeeded` flag set inside its own begin/exception block and asserted
-- *outside* that block, so a real failure can never be swallowed by the
-- exception handler that's supposed to be catching it.
-- ============================================================================

create temporary table if not exists rls_test_scratch_p3 (key text primary key, value uuid);

-- ----------------------------------------------------------------------------
-- Setup: locate the seeded "Creamy Spinach Pasta" demo recipe and its Pasta
-- ingredient (200 g), and have user_a create a matching real pantry item.
-- ----------------------------------------------------------------------------
begin;
set local role postgres;
insert into rls_test_scratch_p3 (key, value)
select 'recipe_version_id', rv.id
from public.recipe_versions rv
join public.recipes r on r.id = rv.recipe_id
where r.legacy_mock_id = 'recipe-creamy-spinach-pasta'
on conflict (key) do update set value = excluded.value;

insert into rls_test_scratch_p3 (key, value)
select 'pasta_ingredient_id', ri.id
from public.recipe_ingredients ri
where ri.recipe_version_id = (select value from rls_test_scratch_p3 where key = 'recipe_version_id')
  and ri.catalog_ingredient_id = 'ing-pasta'
on conflict (key) do update set value = excluded.value;

insert into rls_test_scratch_p3 (key, value)
select 'salt_ingredient_id', ri.id
from public.recipe_ingredients ri
where ri.recipe_version_id = (select value from rls_test_scratch_p3 where key = 'recipe_version_id')
  and ri.catalog_ingredient_id = 'ing-salt'
on conflict (key) do update set value = excluded.value;
commit;

do $$
begin
  if not exists (select 1 from rls_test_scratch_p3 where key = 'recipe_version_id')
    or not exists (select 1 from rls_test_scratch_p3 where key = 'pasta_ingredient_id') then
    raise exception 'FAIL: setup - demo recipe "Creamy Spinach Pasta" not found; run migration 0004 first';
  end if;
  raise notice 'PASS: setup - found the seeded demo recipe and its Pasta/Salt ingredients';
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

select public.create_pantry_item(
  p_ingredient_id => 'ing-manual-rls-pasta', p_display_name => 'RLS Test Pasta',
  p_image_uri => 'https://example.com/pasta.jpg', p_category => 'pantry',
  p_quantity => 500, p_unit => 'g', p_expiration_confidence => 'unknown', p_source => 'manual'
);
commit;

begin;
set local role postgres;
insert into rls_test_scratch_p3 (key, value)
select 'pantry_item_id', id from public.pantry_items where display_name = 'RLS Test Pasta'
on conflict (key) do update set value = excluded.value;
commit;

-- ----------------------------------------------------------------------------
-- Check: demo recipes are visible to any authenticated user (public
-- visibility) and expose no private ownership data (owner_id null for demo rows).
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_B_ID', 'role', 'authenticated')::text, true);

do $$
declare
  visible_count int;
  owner uuid;
begin
  select count(*) into visible_count from public.recipe_versions
  where id = (select value from rls_test_scratch_p3 where key = 'recipe_version_id');
  if visible_count <> 1 then
    raise exception 'FAIL: user_b (who created nothing) cannot see the public demo recipe_versions row';
  end if;

  select r.owner_id into owner from public.recipes r
  join public.recipe_versions rv on rv.recipe_id = r.id
  where rv.id = (select value from rls_test_scratch_p3 where key = 'recipe_version_id');
  if owner is not null then
    raise exception 'FAIL: a seeded demo recipe unexpectedly has a non-null owner_id (would leak an identity)';
  end if;

  raise notice 'PASS: demo recipe_versions are visible to any authenticated user and expose no owner identity';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: recipes/recipe_versions are immutable - no client insert/update.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  succeeded boolean := false;
begin
  begin
    update public.recipe_versions set title = 'Tampered'
    where id = (select value from rls_test_scratch_p3 where key = 'recipe_version_id');
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: a client updated an immutable recipe_versions row'; end if;

  succeeded := false;
  begin
    insert into public.recipes (owner_id, source_type, visibility, trust_label)
    values (auth.uid(), 'user_created', 'private', 'user_created');
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: a client inserted a recipes row directly (no insert grant should exist)'; end if;

  raise notice 'PASS: recipe_versions cannot be updated and recipes cannot be inserted directly by a client';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: saved_recipes is owner-only, idempotent, and invisible cross-user.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

insert into public.saved_recipes (user_id, recipe_version_id)
values ('TEST_USER_A_ID'::uuid, (select value from rls_test_scratch_p3 where key = 'recipe_version_id'))
on conflict (user_id, recipe_version_id) do nothing;

-- Idempotent repeat save.
insert into public.saved_recipes (user_id, recipe_version_id)
values ('TEST_USER_A_ID'::uuid, (select value from rls_test_scratch_p3 where key = 'recipe_version_id'))
on conflict (user_id, recipe_version_id) do nothing;

do $$
declare
  own_count int;
begin
  select count(*) into own_count from public.saved_recipes
  where user_id = 'TEST_USER_A_ID'::uuid
    and recipe_version_id = (select value from rls_test_scratch_p3 where key = 'recipe_version_id');
  if own_count <> 1 then
    raise exception 'FAIL: saving the same recipe version twice produced % rows instead of exactly 1', own_count;
  end if;
  raise notice 'PASS: saved_recipes save is idempotent (repeated save = 1 row)';
end $$;

commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_B_ID', 'role', 'authenticated')::text, true);

do $$
declare
  leaked_count int;
  affected int;
begin
  select count(*) into leaked_count from public.saved_recipes where user_id = 'TEST_USER_A_ID'::uuid;
  if leaked_count <> 0 then raise exception 'FAIL: user_b can see user_a''s saved_recipes row'; end if;

  delete from public.saved_recipes where user_id = 'TEST_USER_A_ID'::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: user_b deleted user_a''s saved_recipes row'; end if;

  raise notice 'PASS: user_b cannot see or delete user_a''s saved_recipes row';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: meal_plan_items is owner-only; marking an entry completed never
-- creates a meal_logs row (planning vs. consumption stay separate).
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

with inserted as (
  insert into public.meal_plan_items (user_id, scheduled_date, timezone, meal_slot, recipe_version_id, planned_servings)
  values (
    'TEST_USER_A_ID'::uuid, current_date + 1, 'UTC', 'dinner',
    (select value from rls_test_scratch_p3 where key = 'recipe_version_id'), 2
  )
  returning id
)
insert into rls_test_scratch_p3 (key, value)
select 'plan_item_id', id from inserted
on conflict (key) do update set value = excluded.value;

do $$
declare
  logs_before int;
  logs_after int;
begin
  select count(*) into logs_before from public.meal_logs where user_id = 'TEST_USER_A_ID'::uuid;

  update public.meal_plan_items
  set status = 'completed'
  where id = (select value from rls_test_scratch_p3 where key = 'plan_item_id') and user_id = auth.uid();

  select count(*) into logs_after from public.meal_logs where user_id = 'TEST_USER_A_ID'::uuid;

  if logs_after <> logs_before then
    raise exception 'FAIL: marking a meal_plan_items row completed created a meal_logs row (% -> %)', logs_before, logs_after;
  end if;
  raise notice 'PASS: marking a plan entry completed creates no meal_logs row';
end $$;

commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_B_ID', 'role', 'authenticated')::text, true);

do $$
declare
  leaked_count int;
begin
  select count(*) into leaked_count from public.meal_plan_items where user_id = 'TEST_USER_A_ID'::uuid;
  if leaked_count <> 0 then raise exception 'FAIL: user_b can see user_a''s meal_plan_items row'; end if;
  raise notice 'PASS: user_b cannot see user_a''s meal_plan_items row';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: full cooking lifecycle for user_a - start (idempotent), complete
-- with a real deduction, pantry/prepared-meal/meal-log side effects, and
-- duplicate completion rejected without duplicate side effects.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  event1 public.cooking_events;
  event1_retry public.cooking_events;
  pantry_before numeric;
  pantry_after numeric;
  complete_result jsonb;
  prepared_meal_id uuid;
  meal_log_id uuid;
  event_count int;
  deduction_count int;
  pantry_event_count int;
  succeeded boolean := false;
begin
  event1 := public.start_cooking_event(
    (select value from rls_test_scratch_p3 where key = 'recipe_version_id'),
    null, 2, 'rls-test-cooking-a-1'
  );
  if event1.status <> 'started' then raise exception 'FAIL: start_cooking_event did not return a started event'; end if;

  -- Idempotent retry with the same key must return the SAME row, not a new one.
  event1_retry := public.start_cooking_event(
    (select value from rls_test_scratch_p3 where key = 'recipe_version_id'),
    null, 2, 'rls-test-cooking-a-1'
  );
  if event1_retry.id <> event1.id then
    raise exception 'FAIL: retrying start_cooking_event with the same idempotency key created a second row';
  end if;

  select count(*) into event_count from public.cooking_events
  where user_id = 'TEST_USER_A_ID'::uuid and idempotency_key = 'rls-test-cooking-a-1';
  if event_count <> 1 then raise exception 'FAIL: expected exactly 1 cooking_events row for this idempotency key, found %', event_count; end if;

  select quantity into pantry_before from public.pantry_items
  where id = (select value from rls_test_scratch_p3 where key = 'pantry_item_id');

  complete_result := public.complete_cooking_event(
    event1.id, 2,
    jsonb_build_array(
      jsonb_build_object(
        'recipeIngredientId', (select value from rls_test_scratch_p3 where key = 'pasta_ingredient_id'),
        'pantryItemId', (select value from rls_test_scratch_p3 where key = 'pantry_item_id'),
        'requestedQuantity', 200, 'requestedUnit', 'g',
        'deductedQuantity', 200, 'deductedUnit', 'g',
        'matchConfidence', 'exact', 'userConfirmed', true, 'wasSkipped', false
      ),
      -- The Salt ingredient is a pantry staple with no matching pantry item
      -- in this test - skipped, must deduct nothing.
      jsonb_build_object(
        'recipeIngredientId', (select value from rls_test_scratch_p3 where key = 'salt_ingredient_id'),
        'pantryItemId', null, 'requestedQuantity', 1, 'requestedUnit', 'container',
        'deductedQuantity', 0, 'userConfirmed', false, 'wasSkipped', true
      )
    ),
    null, 1, 'dinner', 'rls test'
  );

  prepared_meal_id := (complete_result -> 'preparedMeal' ->> 'id')::uuid;
  meal_log_id := (complete_result -> 'mealLog' ->> 'id')::uuid;
  if prepared_meal_id is null or meal_log_id is null then
    raise exception 'FAIL: complete_cooking_event did not return both a prepared meal and a meal log';
  end if;

  select quantity into pantry_after from public.pantry_items
  where id = (select value from rls_test_scratch_p3 where key = 'pantry_item_id');
  if pantry_after <> pantry_before - 200 then
    raise exception 'FAIL: pantry quantity after cooking is % (expected %)', pantry_after, pantry_before - 200;
  end if;

  select count(*) into pantry_event_count from public.pantry_events
  where pantry_item_id = (select value from rls_test_scratch_p3 where key = 'pantry_item_id')
    and event_type = 'deducted_by_cooking' and source_entity_id = event1.id;
  if pantry_event_count <> 1 then raise exception 'FAIL: expected exactly 1 deducted_by_cooking pantry_events row, found %', pantry_event_count; end if;

  select count(*) into deduction_count from public.cooking_event_ingredients where cooking_event_id = event1.id;
  if deduction_count <> 2 then raise exception 'FAIL: expected 2 cooking_event_ingredients rows (pasta + skipped salt), found %', deduction_count; end if;

  if (select servings_remaining from public.prepared_meals where id = prepared_meal_id) <> 1 then
    raise exception 'FAIL: prepared_meals.servings_remaining should be 1 (2 prepared - 1 consumed now)';
  end if;

  if (select servings_consumed from public.meal_logs where id = meal_log_id) <> 1 then
    raise exception 'FAIL: the cooking-flow meal_logs row should record exactly 1 serving consumed, not the whole batch';
  end if;

  insert into rls_test_scratch_p3 (key, value) values ('cooking_event_1_id', event1.id) on conflict (key) do update set value = excluded.value;
  insert into rls_test_scratch_p3 (key, value) values ('prepared_meal_1_id', prepared_meal_id) on conflict (key) do update set value = excluded.value;
  insert into rls_test_scratch_p3 (key, value) values ('meal_log_1_id', meal_log_id) on conflict (key) do update set value = excluded.value;

  raise notice 'PASS: complete_cooking_event deducts exactly the confirmed amount, skips the unconfirmed ingredient, and logs only the servings consumed now (not the whole batch)';

  -- Duplicate completion must be rejected, not silently re-applied.
  begin
    perform public.complete_cooking_event(event1.id, 2, '[]'::jsonb, null, 0, null, null);
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: completing an already-completed cooking event succeeded'; end if;

  select quantity into pantry_after from public.pantry_items
  where id = (select value from rls_test_scratch_p3 where key = 'pantry_item_id');
  if pantry_after <> pantry_before - 200 then
    raise exception 'FAIL: a rejected duplicate completion still changed the pantry quantity (double-deduction)';
  end if;

  raise notice 'PASS: duplicate completion is rejected and does not double-deduct';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: insufficient pantry stock rejects the ENTIRE completion (a second,
-- separate cooking event - the whole transaction rolls back, including any
-- earlier valid-looking deductions in the same call).
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  event2 public.cooking_events;
  pantry_before numeric;
  pantry_after numeric;
  succeeded boolean := false;
begin
  event2 := public.start_cooking_event(
    (select value from rls_test_scratch_p3 where key = 'recipe_version_id'),
    null, 2, 'rls-test-cooking-a-2'
  );

  select quantity into pantry_before from public.pantry_items
  where id = (select value from rls_test_scratch_p3 where key = 'pantry_item_id');

  begin
    perform public.complete_cooking_event(
      event2.id, 2,
      jsonb_build_array(
        jsonb_build_object(
          'recipeIngredientId', (select value from rls_test_scratch_p3 where key = 'pasta_ingredient_id'),
          'pantryItemId', (select value from rls_test_scratch_p3 where key = 'pantry_item_id'),
          'requestedQuantity', 100000, 'requestedUnit', 'g',
          'deductedQuantity', 100000, 'deductedUnit', 'g',
          'matchConfidence', 'exact', 'userConfirmed', true, 'wasSkipped', false
        )
      ),
      null, 0, null, null
    );
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: completing with a deduction exceeding pantry stock succeeded'; end if;

  select quantity into pantry_after from public.pantry_items
  where id = (select value from rls_test_scratch_p3 where key = 'pantry_item_id');
  if pantry_after <> pantry_before then
    raise exception 'FAIL: pantry quantity changed despite the completion being rejected';
  end if;

  if exists (select 1 from public.cooking_events where id = event2.id and status = 'completed') then
    raise exception 'FAIL: cooking event was marked completed despite the rejected deduction';
  end if;

  -- Clean up this event via cancellation so it does not interfere with later checks.
  perform public.cancel_cooking_event(event2.id, 'rls test cleanup');

  raise notice 'PASS: a single insufficient-stock deduction rejects the entire completion with no partial effects';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: a user cannot deduct from another user's pantry item by passing its
-- real id directly into complete_cooking_event (the pantry-remapping picker
-- in the UI can never even show a foreign item, since it only lists the
-- caller's own pantry via RLS - this checks the server-side trust boundary
-- an adversarial client could otherwise try to bypass).
--
-- user_b is the attacker; user_a's "RLS Test Pasta" (pantry_item_id) is the
-- victim row. The victim quantity is snapshotted and re-checked as `postgres`,
-- NOT as the attacker: an attacker SELECT on the victim row returns zero rows
-- under RLS, so a before/after comparison done as the attacker is NULL vs NULL
-- and "passes" even if the row actually changed. The privileged read is
-- verification only - the attack itself still runs as plain authenticated
-- user_b with no elevated rights, and no RLS policy or grant is relaxed.
-- ----------------------------------------------------------------------------
create temporary table if not exists rls_test_scratch_p3_num (key text primary key, value numeric);

begin;
set local role postgres;
insert into rls_test_scratch_p3_num (key, value)
select 'victim_qty_before', quantity from public.pantry_items
where id = (select value from rls_test_scratch_p3 where key = 'pantry_item_id')
on conflict (key) do update set value = excluded.value;

do $$
begin
  if not exists (select 1 from rls_test_scratch_p3_num where key = 'victim_qty_before' and value is not null) then
    raise exception 'FAIL: setup - could not read the victim pantry row (pantry_item_id) even as postgres';
  end if;
end $$;
commit;

-- The attack: plain authenticated user_b, no elevated privileges, targets
-- user_a's real pantry_item_id.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_B_ID', 'role', 'authenticated')::text, true);

do $$
declare
  event_foreign public.cooking_events;
  succeeded boolean := false;
begin
  event_foreign := public.start_cooking_event(
    (select value from rls_test_scratch_p3 where key = 'recipe_version_id'),
    null, 2, 'rls-test-cooking-b-foreign'
  );

  begin
    perform public.complete_cooking_event(
      event_foreign.id, 2,
      jsonb_build_array(
        jsonb_build_object(
          'recipeIngredientId', (select value from rls_test_scratch_p3 where key = 'pasta_ingredient_id'),
          'pantryItemId', (select value from rls_test_scratch_p3 where key = 'pantry_item_id'),
          'requestedQuantity', 200, 'requestedUnit', 'g',
          'deductedQuantity', 200, 'deductedUnit', 'g',
          'matchConfidence', 'exact', 'userConfirmed', true, 'wasSkipped', false
        )
      ),
      null, 0, null, null
    );
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_b deducted from user_a''s pantry item by passing its id directly to complete_cooking_event'; end if;

  if exists (select 1 from public.cooking_events where id = event_foreign.id and status = 'completed') then
    raise exception 'FAIL: the cooking event was marked completed despite the cross-user deduction being rejected';
  end if;

  perform public.cancel_cooking_event(event_foreign.id, 'rls test cleanup');
end $$;

commit;

-- Verification (as postgres): the victim row must be unchanged from the
-- privileged "before" snapshot taken above.
begin;
set local role postgres;
do $$
declare
  qty_before numeric;
  qty_after numeric;
begin
  select value into qty_before from rls_test_scratch_p3_num where key = 'victim_qty_before';
  select quantity into qty_after from public.pantry_items
  where id = (select value from rls_test_scratch_p3 where key = 'pantry_item_id');

  if qty_after is null then
    raise exception 'FAIL: the victim pantry row (pantry_item_id) disappeared during the cross-user deduction attempt';
  end if;
  if qty_after is distinct from qty_before then
    raise exception 'FAIL: user_a''s pantry quantity changed from % to % despite the cross-user deduction being rejected', qty_before, qty_after;
  end if;

  raise notice 'PASS: user_b cannot deduct from user_a''s pantry item via complete_cooking_event; victim quantity verified unchanged (%) as postgres', qty_after;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: live stock changing after a deduction was planned. Stock is
-- sufficient when the cooking event is started; it is then reduced by a
-- separate action (simulating something else consuming it, or a stale
-- client-side resolution) before completion is submitted. complete_cooking_event
-- must re-check LIVE stock at commit time and reject the whole transaction -
-- never partially apply, never trust what the client believed was available
-- when it built the deduction payload.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  event4 public.cooking_events;
  pantry_id uuid;
  quantity_before numeric;
  quantity_after numeric;
  succeeded boolean := false;
begin
  pantry_id := (select value from rls_test_scratch_p3 where key = 'pantry_item_id');

  event4 := public.start_cooking_event(
    (select value from rls_test_scratch_p3 where key = 'recipe_version_id'),
    null, 1, 'rls-test-cooking-a-live-stock'
  );

  select quantity into quantity_before from public.pantry_items where id = pantry_id;
  if quantity_before < 200 then
    raise exception 'FAIL: test setup assumption violated - expected at least 200g on hand before this check';
  end if;

  -- Something else reduces live stock to below what the (already-planned)
  -- deduction below needs, between start and completion.
  perform public.adjust_pantry_quantity(pantry_id, -(quantity_before - 50), 'adjusted', 'rls test - simulate stock drop after planning');
  if (select quantity from public.pantry_items where id = pantry_id) <> 50 then
    raise exception 'FAIL: test setup - could not reduce pantry_item_id to 50 for this check';
  end if;

  -- Submits a deduction for 100g, which WAS coverable when the cooking event
  -- started but is no longer coverable now that live stock is only 50g.
  begin
    perform public.complete_cooking_event(
      event4.id, 1,
      jsonb_build_array(
        jsonb_build_object(
          'recipeIngredientId', (select value from rls_test_scratch_p3 where key = 'pasta_ingredient_id'),
          'pantryItemId', pantry_id,
          'requestedQuantity', 100, 'requestedUnit', 'g',
          'deductedQuantity', 100, 'deductedUnit', 'g',
          'matchConfidence', 'exact', 'userConfirmed', true, 'wasSkipped', false
        )
      ),
      null, 0, null, null
    );
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: completion succeeded despite live stock having dropped below the submitted deduction'; end if;

  select quantity into quantity_after from public.pantry_items where id = pantry_id;
  if quantity_after <> 50 then
    raise exception 'FAIL: pantry quantity changed as a side effect of the rejected completion (expected to stay at 50, got %)', quantity_after;
  end if;

  if exists (select 1 from public.cooking_events where id = event4.id and status = 'completed') then
    raise exception 'FAIL: the cooking event was marked completed despite the rejected, stock-exceeding deduction';
  end if;

  -- Restore stock and clean up this event so it doesn't interfere with later checks.
  perform public.adjust_pantry_quantity(pantry_id, quantity_before - 50, 'corrected', 'rls test cleanup - restore stock');
  perform public.cancel_cooking_event(event4.id, 'rls test cleanup');

  raise notice 'PASS: a deduction that was coverable when planned but no longer is by completion time is rejected atomically, with no partial pantry change';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: a cancelled cooking event creates no deductions and cannot later be completed.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  event3 public.cooking_events;
  succeeded boolean := false;
  deduction_count int;
begin
  event3 := public.start_cooking_event(
    (select value from rls_test_scratch_p3 where key = 'recipe_version_id'),
    null, 2, 'rls-test-cooking-a-3'
  );
  event3 := public.cancel_cooking_event(event3.id, 'changed my mind');
  if event3.status <> 'cancelled' then raise exception 'FAIL: cancel_cooking_event did not mark the event cancelled'; end if;

  select count(*) into deduction_count from public.cooking_event_ingredients where cooking_event_id = event3.id;
  if deduction_count <> 0 then raise exception 'FAIL: a cancelled cooking event has % deduction rows (expected 0)', deduction_count; end if;

  begin
    perform public.complete_cooking_event(event3.id, 2, '[]'::jsonb, null, 0, null, null);
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: a cancelled cooking event was completed'; end if;

  raise notice 'PASS: a cancelled cooking event has no deductions and cannot be completed';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: user_b cannot see, complete, or cancel user_a's cooking event, and
-- cannot see user_a's prepared meal, meal log, or deduction rows.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_B_ID', 'role', 'authenticated')::text, true);

do $$
declare
  leaked_count int;
  succeeded boolean;
  a_event_id uuid;
begin
  a_event_id := (select value from rls_test_scratch_p3 where key = 'cooking_event_1_id');

  select count(*) into leaked_count from public.cooking_events where id = a_event_id;
  if leaked_count <> 0 then raise exception 'FAIL: user_b can see user_a''s cooking_events row'; end if;

  select count(*) into leaked_count from public.prepared_meals where id = (select value from rls_test_scratch_p3 where key = 'prepared_meal_1_id');
  if leaked_count <> 0 then raise exception 'FAIL: user_b can see user_a''s prepared_meals row'; end if;

  select count(*) into leaked_count from public.meal_logs where id = (select value from rls_test_scratch_p3 where key = 'meal_log_1_id');
  if leaked_count <> 0 then raise exception 'FAIL: user_b can see user_a''s meal_logs row'; end if;

  select count(*) into leaked_count from public.cooking_event_ingredients where cooking_event_id = a_event_id;
  if leaked_count <> 0 then raise exception 'FAIL: user_b can see user_a''s cooking_event_ingredients rows'; end if;

  succeeded := false;
  begin
    perform public.cancel_cooking_event(a_event_id, 'hijack attempt');
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_b cancelled user_a''s cooking event'; end if;

  succeeded := false;
  begin
    perform public.complete_cooking_event(a_event_id, 1, '[]'::jsonb, null, 0, null, null);
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_b completed user_a''s cooking event'; end if;

  succeeded := false;
  begin
    perform public.log_prepared_meal_consumption(
      (select value from rls_test_scratch_p3 where key = 'prepared_meal_1_id'), 1, 'dinner', null, null
    );
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_b logged consumption from user_a''s prepared meal'; end if;

  raise notice 'PASS: user_b cannot see or act on any of user_a''s cooking/prepared-meal/meal-log data';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: cooking_event_ingredients and pantry_events cannot be forged
-- directly by a client (no insert grant on either table for authenticated).
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  succeeded boolean := false;
begin
  begin
    insert into public.cooking_event_ingredients (
      user_id, cooking_event_id, recipe_ingredient_id, requested_quantity, deducted_quantity
    ) values (
      'TEST_USER_A_ID'::uuid, (select value from rls_test_scratch_p3 where key = 'cooking_event_1_id'),
      (select value from rls_test_scratch_p3 where key = 'pasta_ingredient_id'), 999, 999
    );
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: a client inserted a cooking_event_ingredients row directly'; end if;

  succeeded := false;
  begin
    insert into public.pantry_events (
      user_id, pantry_item_id, event_type, quantity_delta, quantity_before, quantity_after
    ) values (
      'TEST_USER_A_ID'::uuid, (select value from rls_test_scratch_p3 where key = 'pantry_item_id'),
      'deducted_by_cooking', -9999, 9999, 0
    );
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: a client forged a deducted_by_cooking pantry_events row directly'; end if;

  raise notice 'PASS: cooking_event_ingredients and pantry_events cannot be inserted directly by a client';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: prepared-meal consumption - logging exactly the last serving marks
-- it consumed; logging beyond what remains is rejected.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  meal_id uuid;
  result jsonb;
  remaining numeric;
  status text;
  succeeded boolean := false;
begin
  meal_id := (select value from rls_test_scratch_p3 where key = 'prepared_meal_1_id');

  begin
    perform public.log_prepared_meal_consumption(meal_id, 5, 'dinner', 'too much', null);
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: logging more servings than remain succeeded'; end if;

  result := public.log_prepared_meal_consumption(meal_id, 1, 'dinner', 'the last of it', 'rls-test-prepared-log-1');
  remaining := (result -> 'preparedMeal' ->> 'servingsRemaining')::numeric;
  status := result -> 'preparedMeal' ->> 'status';
  if remaining <> 0 or status <> 'consumed' then
    raise exception 'FAIL: consuming the last serving left remaining=% status=% (expected 0 / consumed)', remaining, status;
  end if;

  -- Retrying the exact same idempotency key must not double-log.
  perform public.log_prepared_meal_consumption(meal_id, 1, 'dinner', 'retry', 'rls-test-prepared-log-1');
  if (select count(*) from public.meal_logs where idempotency_key = 'rls-test-prepared-log-1') <> 1 then
    raise exception 'FAIL: retrying log_prepared_meal_consumption with the same idempotency key created a duplicate log';
  end if;

  raise notice 'PASS: prepared-meal consumption rejects over-consumption, marks consumed at zero, and is idempotent on retry';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: meal_logs immutability - the nutrition snapshot/quantities/source
-- references cannot be edited directly; voiding (and only voiding) works
-- through the restricted column grant; a voided row cannot be re-voided;
-- replaced_by_log_id cannot be set by a plain client update.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  log_id uuid;
  succeeded boolean := false;
  other_log_id uuid;
begin
  log_id := (select value from rls_test_scratch_p3 where key = 'meal_log_1_id');

  begin
    update public.meal_logs set nutrition_snapshot = jsonb_build_object('status', 'verified', 'calories', 1) where id = log_id;
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: a client edited a meal_logs nutrition_snapshot directly'; end if;

  succeeded := false;
  begin
    update public.meal_logs set servings_consumed = 999 where id = log_id;
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: a client edited meal_logs.servings_consumed directly'; end if;

  select id into other_log_id from public.meal_logs where user_id = 'TEST_USER_A_ID'::uuid and id <> log_id limit 1;
  if other_log_id is not null then
    succeeded := false;
    begin
      update public.meal_logs set replaced_by_log_id = other_log_id where id = log_id;
      succeeded := true;
    exception when others then succeeded := false;
    end;
    if succeeded then raise exception 'FAIL: a client set meal_logs.replaced_by_log_id directly (no column grant should exist)'; end if;
  end if;

  -- The one thing a plain client update MAY do: void it.
  update public.meal_logs set voided_at = now(), void_reason = 'rls test void' where id = log_id;
  if (select voided_at from public.meal_logs where id = log_id) is null then
    raise exception 'FAIL: a client could not void their own meal_logs row through the restricted column grant';
  end if;

  -- Re-voiding (or un-voiding) must fail.
  succeeded := false;
  begin
    update public.meal_logs set voided_at = now() where id = log_id;
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: a voided meal_logs row was re-voided'; end if;

  succeeded := false;
  begin
    update public.meal_logs set voided_at = null where id = log_id;
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: a voided meal_logs row was un-voided'; end if;

  raise notice 'PASS: meal_logs snapshot/quantities/replacement-link cannot be edited directly; voiding works once and only once, through the restricted column grant';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: no meal_logs row can ever be hard-deleted by a client (no delete
-- policy exists for the authenticated role on this table at all).
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  delete from public.meal_logs where id = (select value from rls_test_scratch_p3 where key = 'meal_log_1_id');
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: a meal_logs row was hard-deleted by a client'; end if;
  raise notice 'PASS: meal_logs rows cannot be hard-deleted through normal client access';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: correct_meal_log - a normal correction voids the original without
-- mutating its nutrition_snapshot (historical immutability), links
-- replaced_by_log_id, and produces a correct, non-double-counted replacement;
-- correcting the same (now-voided) log again is rejected (no duplicate
-- correction); and a different user cannot correct this user's log.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  original_log public.meal_logs;
  correct_result jsonb;
  voided_row_id uuid;
  replacement_row_id uuid;
  original_snapshot_before jsonb;
  original_snapshot_after jsonb;
  succeeded boolean := false;
begin
  original_log := public.quick_add_meal_log(
    'snack', jsonb_build_object('status', 'estimated', 'calories', 999, 'proteinG', 1, 'carbsG', 1, 'fatG', 1),
    'rls-test-log-to-correct', 'wrong entry', null
  );
  original_snapshot_before := original_log.nutrition_snapshot;

  insert into rls_test_scratch_p3 (key, value) values ('log_to_correct_id', original_log.id) on conflict (key) do update set value = excluded.value;

  correct_result := public.correct_meal_log(
    original_log.id, 'entered the wrong calories', 'snack',
    jsonb_build_object('status', 'estimated', 'calories', 450, 'proteinG', 20, 'carbsG', 40, 'fatG', 15),
    null, null, 'fixed calories', 'rls-test-correction-1', null
  );

  voided_row_id := (correct_result -> 'voided' ->> 'id')::uuid;
  replacement_row_id := (correct_result -> 'replacement' ->> 'id')::uuid;
  if voided_row_id <> original_log.id then raise exception 'FAIL: correct_meal_log voided a different row than the one requested'; end if;

  select nutrition_snapshot into original_snapshot_after from public.meal_logs where id = voided_row_id;
  if original_snapshot_after <> original_snapshot_before then
    raise exception 'FAIL: correcting a meal log mutated the ORIGINAL row''s nutrition_snapshot - historical records must stay immutable';
  end if;

  if (select replaced_by_log_id from public.meal_logs where id = voided_row_id) <> replacement_row_id then
    raise exception 'FAIL: the voided original''s replaced_by_log_id does not point at the new replacement row';
  end if;

  if (select voided_at from public.meal_logs where id = voided_row_id) is null then
    raise exception 'FAIL: the original row was not marked voided by correct_meal_log';
  end if;

  if (select (nutrition_snapshot ->> 'calories')::numeric from public.meal_logs where id = replacement_row_id) <> 450 then
    raise exception 'FAIL: the replacement row does not have the corrected nutrition values';
  end if;

  if (select count(*) from public.meal_logs where id in (voided_row_id, replacement_row_id) and voided_at is null) <> 1 then
    raise exception 'FAIL: expected exactly one non-voided row between the original and its replacement (no double-counting)';
  end if;

  raise notice 'PASS: correct_meal_log voids the original without mutating its snapshot, links replaced_by_log_id, and leaves exactly one non-voided (correct) row';

  -- Duplicate correction: correcting the now-voided original again must fail.
  begin
    perform public.correct_meal_log(
      original_log.id, 'trying again', 'snack',
      jsonb_build_object('status', 'estimated', 'calories', 1), null, null, null, 'rls-test-correction-2', null
    );
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: correcting an already-voided/corrected meal log succeeded (should be rejected)'; end if;

  raise notice 'PASS: correcting an already-voided/replaced meal log is rejected';
end $$;

commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  log_row public.meal_logs;
begin
  log_row := public.quick_add_meal_log(
    'snack', jsonb_build_object('status', 'estimated', 'calories', 300), 'rls-test-log-for-ownership', null, null
  );
  insert into rls_test_scratch_p3 (key, value) values ('log_for_ownership_id', log_row.id) on conflict (key) do update set value = excluded.value;
end $$;

commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_B_ID', 'role', 'authenticated')::text, true);

do $$
declare
  a_log_id uuid;
  succeeded boolean := false;
begin
  a_log_id := (select value from rls_test_scratch_p3 where key = 'log_for_ownership_id');

  begin
    perform public.correct_meal_log(
      a_log_id, 'hijack attempt', 'snack',
      jsonb_build_object('status', 'estimated', 'calories', 1), null, null, null, 'rls-test-correction-hijack', null
    );
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_b corrected user_a''s meal log'; end if;

  if (select voided_at from public.meal_logs where id = a_log_id) is not null then
    raise exception 'FAIL: user_a''s meal log was voided by user_b''s rejected correction attempt';
  end if;

  raise notice 'PASS: a different user cannot correct this user''s meal log';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Check: anonymous requests cannot read any Phase 3 table and cannot call
-- any of the six security-definer RPCs (all reject a null auth.uid()).
-- ----------------------------------------------------------------------------
begin;
set local role anon;
select set_config('request.jwt.claims', '', true);

do $$
declare
  total_count int;
  succeeded boolean;
begin
  select count(*) into total_count from public.recipes; if total_count <> 0 then raise exception 'FAIL: anon read % recipes rows (only public ones should ever be readable, and only by authenticated users)', total_count; end if;
  select count(*) into total_count from public.recipe_versions; if total_count <> 0 then raise exception 'FAIL: anon read % recipe_versions rows', total_count; end if;
  select count(*) into total_count from public.saved_recipes; if total_count <> 0 then raise exception 'FAIL: anon read % saved_recipes rows', total_count; end if;
  select count(*) into total_count from public.meal_plan_items; if total_count <> 0 then raise exception 'FAIL: anon read % meal_plan_items rows', total_count; end if;
  select count(*) into total_count from public.cooking_events; if total_count <> 0 then raise exception 'FAIL: anon read % cooking_events rows', total_count; end if;
  select count(*) into total_count from public.prepared_meals; if total_count <> 0 then raise exception 'FAIL: anon read % prepared_meals rows', total_count; end if;
  select count(*) into total_count from public.meal_logs; if total_count <> 0 then raise exception 'FAIL: anon read % meal_logs rows', total_count; end if;

  succeeded := false;
  begin
    perform public.start_cooking_event((select value from rls_test_scratch_p3 where key = 'recipe_version_id'), null, null, 'anon-attempt');
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: anon called start_cooking_event'; end if;

  succeeded := false;
  begin
    perform public.quick_add_meal_log('snack', jsonb_build_object('status', 'estimated', 'calories', 100), 'anon-attempt', null, null);
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: anon called quick_add_meal_log'; end if;

  succeeded := false;
  begin
    perform public.correct_meal_log(
      (select value from rls_test_scratch_p3 where key = 'log_for_ownership_id'),
      'anon attempt', 'snack', jsonb_build_object('status', 'estimated', 'calories', 1), null, null, null, 'anon-correct-attempt', null
    );
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: anon called correct_meal_log'; end if;

  raise notice 'PASS: anonymous role cannot read any Phase 3 table or call any Phase 3 RPC';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Phase 3 cleanup.
-- ----------------------------------------------------------------------------
begin;
set local role postgres;
delete from public.meal_logs where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
delete from public.prepared_meals where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
delete from public.cooking_event_ingredients where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
delete from public.cooking_events where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
delete from public.meal_plan_items where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
delete from public.saved_recipes where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
delete from public.pantry_items where display_name in ('RLS Test Pasta');
drop table if exists rls_test_scratch_p3;
drop table if exists rls_test_scratch_p3_num;
commit;

-- ============================================================================
-- Phase 4: grocery_lists / grocery_list_items
--
-- Same conventions as Phase 2/3: every "should fail" check uses a `succeeded`
-- flag set inside its own begin/exception block and asserted *outside* it, and
-- any "the victim row is unchanged" assertion is re-read as `postgres` (never
-- as the attacker, whose SELECT is empty under RLS). Run migration 0005 first.
-- ============================================================================

create temporary table if not exists rls_test_scratch_grocery (key text primary key, value uuid);

-- ----------------------------------------------------------------------------
-- Owner CRUD: user_a resolves their active list, inserts an item, reads it,
-- toggles it (checked_at trigger), updates it. All succeed; triggers fire.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

insert into rls_test_scratch_grocery (key, value)
select 'a_list_id', id from public.get_or_create_active_grocery_list()
on conflict (key) do update set value = excluded.value;

do $$
declare
  a_list_id uuid;
  a_list_id_again uuid;
  new_item public.grocery_list_items;
  toggled public.grocery_list_items;
  updated_qty numeric;
begin
  select value into a_list_id from rls_test_scratch_grocery where key = 'a_list_id';
  if a_list_id is null then
    raise exception 'FAIL: get_or_create_active_grocery_list returned no list for user_a';
  end if;

  -- Idempotent: a second call returns the SAME active list, never a new one.
  select id into a_list_id_again from public.get_or_create_active_grocery_list();
  if a_list_id_again <> a_list_id then
    raise exception 'FAIL: get_or_create_active_grocery_list created a second active list for user_a';
  end if;

  insert into public.grocery_list_items (grocery_list_id, user_id, display_name, quantity, unit)
  values (a_list_id, auth.uid(), 'RLS Test Milk', 2, 'container')
  returning * into new_item;

  if new_item.normalized_name <> 'rls test milk' then
    raise exception 'FAIL: normalized_name trigger did not fire on grocery item insert (got %)', new_item.normalized_name;
  end if;
  if new_item.sort_order <= 0 then
    raise exception 'FAIL: sort_order trigger did not assign a positive order (got %)', new_item.sort_order;
  end if;
  if new_item.checked_at is not null then
    raise exception 'FAIL: a freshly-inserted unchecked grocery item already has checked_at set';
  end if;

  if not exists (select 1 from public.grocery_list_items where id = new_item.id) then
    raise exception 'FAIL: user_a cannot read back their own grocery item';
  end if;

  toggled := public.toggle_grocery_item(new_item.id);
  if not toggled.is_checked or toggled.checked_at is null then
    raise exception 'FAIL: toggle_grocery_item did not check the item / set checked_at';
  end if;
  toggled := public.toggle_grocery_item(new_item.id);
  if toggled.is_checked or toggled.checked_at is not null then
    raise exception 'FAIL: toggling back did not clear is_checked / checked_at';
  end if;

  update public.grocery_list_items set quantity = 5, display_name = 'RLS Test Milk 2%' where id = new_item.id;
  select quantity into updated_qty from public.grocery_list_items where id = new_item.id;
  if updated_qty <> 5 then
    raise exception 'FAIL: user_a could not update their own grocery item quantity';
  end if;

  insert into rls_test_scratch_grocery (key, value) values ('a_item_id', new_item.id)
  on conflict (key) do update set value = excluded.value;

  raise notice 'PASS: grocery owner CRUD works (get-or-create list is idempotent; insert/read/toggle/update; normalized_name + sort_order + checked_at triggers fire)';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- user_b gets their OWN active list + item, distinct from user_a's.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_B_ID', 'role', 'authenticated')::text, true);

insert into rls_test_scratch_grocery (key, value)
select 'b_list_id', id from public.get_or_create_active_grocery_list()
on conflict (key) do update set value = excluded.value;

do $$
declare
  b_list_id uuid;
  b_item public.grocery_list_items;
begin
  select value into b_list_id from rls_test_scratch_grocery where key = 'b_list_id';
  insert into public.grocery_list_items (grocery_list_id, user_id, display_name, quantity, unit)
  values (b_list_id, auth.uid(), 'RLS Test Eggs B', 1, 'container')
  returning * into b_item;
  insert into rls_test_scratch_grocery (key, value) values ('b_item_id', b_item.id)
  on conflict (key) do update set value = excluded.value;
  raise notice 'PASS: user_b has their own active grocery list and item';
end $$;

commit;

begin;
set local role postgres;
do $$
begin
  if (select value from rls_test_scratch_grocery where key = 'a_list_id')
   = (select value from rls_test_scratch_grocery where key = 'b_list_id') then
    raise exception 'FAIL: user_a and user_b resolved to the SAME active grocery list';
  end if;
  raise notice 'PASS: user_a and user_b have distinct active grocery lists';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- user_a cannot read / insert into / update / toggle / delete user_b's list
-- or items. The attack runs as plain authenticated user_a.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'TEST_USER_A_ID', 'role', 'authenticated')::text, true);

do $$
declare
  b_list_id uuid := (select value from rls_test_scratch_grocery where key = 'b_list_id');
  b_item_id uuid := (select value from rls_test_scratch_grocery where key = 'b_item_id');
  leaked int;
  affected int;
  succeeded boolean := false;
begin
  select count(*) into leaked from public.grocery_lists where id = b_list_id;
  if leaked <> 0 then raise exception 'FAIL: user_a can see user_b''s grocery_lists row'; end if;

  select count(*) into leaked from public.grocery_list_items where id = b_item_id;
  if leaked <> 0 then raise exception 'FAIL: user_a can see user_b''s grocery_list_items row'; end if;

  select count(*) into leaked from public.grocery_list_items where grocery_list_id = b_list_id;
  if leaked <> 0 then raise exception 'FAIL: user_a can see items in user_b''s list'; end if;

  -- insert into user_b's list, with user_a's own user_id
  begin
    insert into public.grocery_list_items (grocery_list_id, user_id, display_name, quantity, unit)
    values (b_list_id, auth.uid(), 'Hijack A into B list', 1, 'item');
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_a inserted an item into user_b''s grocery list (own user_id)'; end if;

  -- insert into user_b's list while spoofing user_b's user_id
  succeeded := false;
  begin
    insert into public.grocery_list_items (grocery_list_id, user_id, display_name, quantity, unit)
    values (b_list_id, 'TEST_USER_B_ID'::uuid, 'Hijack spoofing user_b', 1, 'item');
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_a inserted an item into user_b''s list by spoofing user_b''s user_id'; end if;

  -- update user_b's item
  update public.grocery_list_items set quantity = 999 where id = b_item_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: user_a updated user_b''s grocery item'; end if;

  -- check (toggle) user_b's item via the RPC
  succeeded := false;
  begin
    perform public.toggle_grocery_item(b_item_id);
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: user_a toggled user_b''s grocery item via toggle_grocery_item'; end if;

  -- delete user_b's item
  delete from public.grocery_list_items where id = b_item_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: user_a deleted user_b''s grocery item'; end if;

  -- delete user_b's list
  delete from public.grocery_lists where id = b_list_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: user_a deleted user_b''s grocery list'; end if;

  raise notice 'PASS: user_a cannot read, insert into, update, toggle, or delete user_b''s grocery list/items';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Verification (as postgres): user_b's item must be byte-for-byte unchanged
-- after all of user_a's attempts above.
-- ----------------------------------------------------------------------------
begin;
set local role postgres;
do $$
declare
  q numeric;
  c boolean;
  n text;
begin
  select quantity, is_checked, display_name into q, c, n
  from public.grocery_list_items
  where id = (select value from rls_test_scratch_grocery where key = 'b_item_id');

  if not found then
    raise exception 'FAIL: user_b''s grocery item disappeared during user_a''s cross-user attempts';
  end if;
  if q <> 1 or c or n <> 'RLS Test Eggs B' then
    raise exception 'FAIL: user_b''s grocery item changed (qty=%, checked=%, name=%) despite the cross-user attempts being rejected', q, c, n;
  end if;
  raise notice 'PASS: user_b''s grocery item verified unchanged as postgres';
end $$;
commit;

-- ----------------------------------------------------------------------------
-- Anonymous requests cannot read the grocery tables or make anything happen
-- through the grocery functions.
-- ----------------------------------------------------------------------------
begin;
set local role anon;
select set_config('request.jwt.claims', '', true);

do $$
declare
  total int;
  succeeded boolean := false;
begin
  select count(*) into total from public.grocery_lists;
  if total <> 0 then raise exception 'FAIL: anon can read grocery_lists (% rows)', total; end if;

  select count(*) into total from public.grocery_list_items;
  if total <> 0 then raise exception 'FAIL: anon can read grocery_list_items (% rows)', total; end if;

  begin
    perform public.get_or_create_active_grocery_list();
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: anon successfully called get_or_create_active_grocery_list'; end if;

  succeeded := false;
  begin
    perform public.toggle_grocery_item((select value from rls_test_scratch_grocery where key = 'b_item_id'));
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'FAIL: anon successfully toggled a grocery item'; end if;

  raise notice 'PASS: anonymous role cannot read the grocery tables or drive the grocery functions';
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Grocery cleanup.
-- ----------------------------------------------------------------------------
begin;
set local role postgres;
delete from public.grocery_list_items where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
delete from public.grocery_lists where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
drop table if exists rls_test_scratch_grocery;
commit;

do $$
begin
  raise notice 'ALL RLS CHECKS PASSED';
end $$;
