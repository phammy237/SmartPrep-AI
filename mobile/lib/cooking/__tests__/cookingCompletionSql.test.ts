import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Static guards on the cooking-completion RPCs. The FEFO work is entirely
 * client-side; this test just pins the server-side invariants it relies on so a
 * future migration edit can't quietly break them:
 *   - complete_cooking_event already deducts MULTIPLE pantry lots per call
 *     (loop over a jsonb array), atomically, guarded by an idempotency key.
 *   - prepared-meal consumption NEVER re-touches pantry stock.
 */
const sql = readFileSync(
  join(__dirname, '../../../supabase/migrations/0003_recipe_planning_cooking.sql'),
  'utf8',
);

function fnBody(name: string): string {
  const start = sql.indexOf(`create function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  // up to the next `create function` / `comment on` / `grant`
  const rest = sql.slice(start + 10);
  const end = rest.search(/\ncreate function |\ncomment on function |\ngrant execute/);
  return rest.slice(0, end === -1 ? undefined : end);
}

describe('complete_cooking_event supports atomic multi-lot deductions', () => {
  const body = fnBody('complete_cooking_event');

  it('iterates a jsonb array of deductions (one row per pantry lot, not one per ingredient)', () => {
    expect(body).toMatch(/for\s+deduction\s+in\s+select\s+\*\s+from\s+jsonb_array_elements/);
  });

  it('writes a deducted_by_cooking pantry_events row + a cooking_event_ingredients row inside that loop', () => {
    const loopStart = body.indexOf('jsonb_array_elements');
    const loopEnd = body.indexOf('end loop;');
    const loop = body.slice(loopStart, loopEnd);
    expect(loop).toMatch(/insert into public\.pantry_events/);
    expect(loop).toContain("'deducted_by_cooking'");
    expect(loop).toMatch(/insert into public\.cooking_event_ingredients/);
    // Each lot is locked + stock-checked before it is decremented.
    expect(loop).toMatch(/from public\.pantry_items[\s\S]*for update/);
    expect(loop).toMatch(/insufficient pantry stock/);
  });

  it('rejects a second completion of an already-finished event (idempotency guard over the whole operation)', () => {
    expect(body).toMatch(/event_row\.status\s*<>\s*'started'/);
    expect(body).toMatch(/already completed or cancelled/);
  });

  it('re-derives identity from auth.uid() and scopes every pantry lookup to the caller', () => {
    expect(body).toMatch(/auth\.uid\(\) is null/);
    expect(body).toMatch(/from public\.pantry_items\s+where id = v_pantry_item_id and user_id = auth\.uid\(\)/);
  });
});

describe('prepared-meal consumption never re-deducts pantry (§ "cook once")', () => {
  const body = fnBody('log_prepared_meal_consumption');

  it('touches prepared_meals + meal_logs only - no pantry_items update, no deducted_by_cooking event', () => {
    expect(body).not.toMatch(/update public\.pantry_items/);
    expect(body).not.toContain('deducted_by_cooking');
    expect(body).not.toMatch(/insert into public\.pantry_events/);
  });
});
