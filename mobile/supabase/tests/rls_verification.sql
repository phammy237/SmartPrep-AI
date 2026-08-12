-- RLS verification for Phase 1 (profiles, dietary_preferences, nutrition_goals).
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
begin
  begin
    insert into public.dietary_preferences (user_id, dietary_patterns)
    values ('TEST_USER_B_ID'::uuid, array['vegan']);
    raise exception 'FAIL: user_a was able to insert a dietary_preferences row for user_b';
  exception
    when insufficient_privilege or others then
      raise notice 'PASS: user_a cannot insert a dietary_preferences row for user_b';
  end;
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

-- ----------------------------------------------------------------------------
-- Cleanup: remove the rows this script created so re-running it is safe.
-- Comment this block out if you want to inspect the rows afterward.
-- ----------------------------------------------------------------------------
begin;
set local role postgres;
delete from public.nutrition_goals where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
delete from public.dietary_preferences where user_id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
update public.profiles set household_size = 1 where id in ('TEST_USER_A_ID'::uuid, 'TEST_USER_B_ID'::uuid);
commit;

do $$
begin
  raise notice 'ALL RLS CHECKS PASSED';
end $$;
