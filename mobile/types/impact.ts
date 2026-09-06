/**
 * Kitchen Impact is derived entirely from the real pantry event ledger
 * (`pantry_events`) plus the completed-cooking-session count, via the
 * `get_kitchen_impact_summary` RPC. Every field here is a defensible count or
 * a grouped-by-unit total - there are no money, weight, CO2, "waste avoided",
 * or freshness-window figures, because the ledger cannot support those
 * honestly (see 0006_kitchen_impact.sql).
 */

export type ImpactPeriod = 'today' | 'week' | 'month' | 'all';

/** A quantity total for a single unit. Units are never combined (no conversion table). */
export interface ImpactUnitTotal {
  /** The pantry unit exactly as stored on the event, or 'unknown'. */
  unit: string;
  /** Sum of |quantity_delta| for events in this unit over the range. */
  totalQuantity: number;
  eventCount: number;
}

/** The aggregate half returned by the RPC (before the service adds range/label context). */
export interface KitchenImpactSummary {
  /** `added` pantry events in range. */
  itemsAddedCount: number;
  /**
   * Count of pantry-use EVENTS (`consumed` + `deducted_by_cooking` + `depleted`)
   * in range - NOT distinct items. One real consumption is one event; the same
   * item used across three sessions is 3. A distinct-item metric does not exist yet.
   */
  useEventCount: number;
  /** `discarded` events. */
  itemsDiscardedCount: number;
  /** `cooking_events` with status = 'completed' whose completed_at falls in range. */
  cookingSessionsCount: number;
  /** used / (used + discarded), 0..1. `null` when there was no used-or-discarded outflow to rate. */
  utilizationRate: number | null;
  usedQuantitiesByUnit: ImpactUnitTotal[];
  discardedQuantitiesByUnit: ImpactUnitTotal[];
  /** False when there is no ledger activity at all in range - drives the honest empty state. */
  hasActivity: boolean;
}

export interface KitchenImpact extends KitchenImpactSummary {
  period: ImpactPeriod;
  /** e.g. "This week", "This month", "All time". */
  rangeLabel: string;
  /** Local calendar date, inclusive; null for all-time. */
  startDate: string | null;
  /** Local calendar date, inclusive; null for all-time. */
  endDate: string | null;
  /** IANA zone the range boundaries were resolved in (falls back to 'UTC'). */
  timezone: string;
}
