/**
 * Canonical classification of pantry event types for Kitchen Impact.
 *
 * This MUST stay in sync with the `event_type in (...)` lists in
 * supabase/migrations/0006_kitchen_impact.sql - Postgres has no import, so the
 * two are kept aligned by hand (the same arrangement `is_valid_nutrition_snapshot`
 * <-> nutritionSchemas.ts uses). The SQL is the runtime source of truth for
 * the numbers; this module exists so the taxonomy is expressed and tested in
 * one obvious place.
 */

import { Database } from '@/types/database.types';

export type PantryEventType = Database['public']['Tables']['pantry_events']['Row']['event_type'];

/** Inventory coming in - counted on its own, never as "used" or "discarded". */
export const IMPACT_ADDED_EVENT_TYPES = ['added'] as const;

/**
 * A real outflow of food that was used:
 *  - consumed             direct "I used some" from the pantry detail screen
 *  - deducted_by_cooking   pantry leaving for a cooking session
 *  - depleted             the pantry UI's "Finished" action ("Mark ... as fully used?")
 */
export const IMPACT_USED_EVENT_TYPES = ['consumed', 'deducted_by_cooking', 'depleted'] as const;

/** Food thrown away. */
export const IMPACT_DISCARDED_EVENT_TYPES = ['discarded'] as const;

/**
 * Not a signal about food being used or wasted:
 *  - adjusted   inventory recount (direction isn't a real consumption/waste signal)
 *  - corrected  a data correction (deplete 'corrected') or the delta-0 "still have this"
 *               confirmation - the food didn't necessarily move
 *  - restored   item reactivated; a status change, no food movement
 *  - donated / traded  reserved and never written; would be "given away", neither
 *               used-by-me nor wasted
 */
export const IMPACT_EXCLUDED_EVENT_TYPES = ['adjusted', 'corrected', 'restored', 'donated', 'traded'] as const;

export type ImpactEventClass = 'added' | 'used' | 'discarded' | 'excluded';

export function classifyPantryEventForImpact(eventType: PantryEventType): ImpactEventClass {
  if ((IMPACT_ADDED_EVENT_TYPES as readonly string[]).includes(eventType)) return 'added';
  if ((IMPACT_USED_EVENT_TYPES as readonly string[]).includes(eventType)) return 'used';
  if ((IMPACT_DISCARDED_EVENT_TYPES as readonly string[]).includes(eventType)) return 'discarded';
  return 'excluded';
}

/** Every event_type the pantry_events CHECK constraint allows (0002). Kept here so the
 *  taxonomy test can assert the classification is total. */
export const ALL_PANTRY_EVENT_TYPES: PantryEventType[] = [
  'added',
  'adjusted',
  'consumed',
  'deducted_by_cooking',
  'depleted',
  'discarded',
  'donated',
  'traded',
  'corrected',
  'restored',
];
