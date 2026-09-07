-- Phase 8b: least-privilege column grants for grocery_list_items.
--
-- 0005 granted authenticated blanket INSERT + UPDATE on grocery_list_items,
-- and 0009 then added the Grocery -> Pantry transfer columns
-- (pantry_transfer_status / pantry_transferred_at / pantry_item_id) WITHOUT
-- narrowing that grant. So a raw authenticated Supabase client can currently
-- write transfer state, is_checked, checked_at, normalized_name, sort_order,
-- etc. directly on an ACTIVE grocery item - fields that belong to RPCs and
-- triggers, not the client. TypeScript Insert/Update shapes are not a security
-- boundary; only grants are.
--
-- This migration replaces the blanket grants with the exact columns the
-- production repository (lib/supabase/repositories/groceryRepository.ts) is
-- observed to write, and moves is_checked behind toggle_grocery_item by making
-- that function security definer.
--
-- It does NOT touch:
--   * SELECT / DELETE table grants (delete is needed for single-delete,
--     "Clear Checked", and meal-plan reconciliation; RLS + the 0010
--     require-active-parent trigger already bound it)
--   * RLS policies (ownership boundary - unchanged)
--   * the 0010 completed-trip immutability triggers / grocery_lists grants
--   * transfer_grocery_item_to_pantry (security definer - runs as owner, so
--     revoking the transfer columns from authenticated does not affect it)
--
-- ============================================================================
-- grocery_list_items: blanket INSERT/UPDATE -> least-privilege column grants
-- ============================================================================
--
-- A table-level UPDATE (or INSERT) grant cannot be narrowed by revoking
-- individual columns - it must be revoked whole, then re-granted per column.

revoke insert, update on public.grocery_list_items from authenticated;

-- INSERT: every column groceryRepository.insertGroceryListItems() emits.
--   grocery_list_id / user_id  - the parent + denormalized owner (RLS +
--                                the composite FK enforce they match).
--   display_name / image_uri / category / quantity / unit  - the item.
--   catalog_ingredient_id      - optional catalog link, set once at insert.
--   source / source_recipe_version_ids / source_metadata / quantity_basis
--                              - provenance for generated (recipe / meal_plan)
--                                lines, written only at insert.
--   sort_order                 - 0005 documents this as a client-passable
--                                batch-ordering hint; the BEFORE INSERT trigger
--                                still normalizes 0 / absent to "append".
-- NOT granted (trigger- / default- / RPC-owned): id, normalized_name,
--   is_checked, checked_at, pantry_transfer_status, pantry_transferred_at,
--   pantry_item_id, estimated_price, swap_suggestion, waste_note,
--   created_at, updated_at.
grant insert (
  grocery_list_id,
  user_id,
  catalog_ingredient_id,
  display_name,
  image_uri,
  category,
  quantity,
  unit,
  source,
  source_recipe_version_ids,
  source_metadata,
  quantity_basis,
  sort_order
) on public.grocery_list_items to authenticated;

-- UPDATE: only what groceryRepository.updateGroceryListItem() emits -
--   active-list editing (name / category / quantity / unit) plus the
--   recipe-shortfall merge (source_recipe_version_ids, quantity_basis).
-- Everything else is immutable-after-insert (grocery_list_id, user_id,
-- source, catalog_ingredient_id, image_uri, source_metadata, sort_order),
-- trigger-owned (normalized_name, checked_at, updated_at), or RPC-owned
-- (is_checked -> toggle_grocery_item; pantry_transfer_* -> transfer RPC).
grant update (
  display_name,
  category,
  quantity,
  unit,
  source_recipe_version_ids,
  quantity_basis
) on public.grocery_list_items to authenticated;

-- ============================================================================
-- toggle_grocery_item: security invoker -> security definer.
--
-- With is_checked no longer client-writable, the acquire/un-acquire toggle
-- must run with the function owner's privileges. Ownership is still enforced
-- explicitly (auth.uid() null check + `user_id = auth.uid()` filter), the
-- checked_at trigger still keeps the timestamp in sync, and the 0010
-- require-active-parent trigger still blocks toggling a completed trip's item
-- (auth.uid() is non-null for a real caller even inside a definer function).
-- ============================================================================

create or replace function public.toggle_grocery_item(p_item_id uuid)
returns public.grocery_list_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.grocery_list_items;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.grocery_list_items
  set is_checked = not is_checked
  where id = p_item_id and user_id = auth.uid()
  returning * into result;

  if not found then
    raise exception 'grocery item not found';
  end if;

  return result;
end;
$$;

comment on function public.toggle_grocery_item is
  'security definer (0011): is_checked is not a client-writable column. Toggles it under an explicit auth.uid() ownership check; the set_grocery_list_item_checked_at trigger keeps checked_at in sync; the require-active-parent trigger (0010) still blocks toggling a completed trip''s items.';

-- (CREATE OR REPLACE preserves the existing grant execute ... to authenticated.)

-- ============================================================================
-- grocery_lists: narrow INSERT to (user_id) as well.
--
-- 0010 already revoked the blanket UPDATE (client keeps UPDATE (title) only).
-- INSERT was still blanket, letting a client craft a bogus history row, e.g.
--   insert into grocery_lists (user_id, status, completed_at)
--     values (auth.uid(), 'completed', now())
-- get_or_create_active_grocery_list() (security invoker) only ever inserts
-- user_id; complete_grocery_list() is security definer. No production code
-- inserts a grocery_lists row with any other column.
-- ============================================================================

revoke insert on public.grocery_lists from authenticated;
grant insert (user_id) on public.grocery_lists to authenticated;
