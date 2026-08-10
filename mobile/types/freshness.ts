/**
 * Freshness is always represented as a human-readable label in the UI.
 * The 0-100 score and model confidence are retained for future-backend
 * compatibility, but no screen should ever display the raw number as fact -
 * see utils/freshness.ts for the score -> label rules and copy.
 */

export type FreshnessLabel = 'fresh' | 'use_soon' | 'prioritize' | 'cant_tell';

export interface FreshnessState {
  /** 0-100 underlying freshness score (future ML output). */
  score: number;
  /** 0-1 model confidence in that score. */
  confidence: number;
  /** Resolved label - derived from score/confidence, or set directly on manual override. */
  label: FreshnessLabel;
  /** True if the user (not the AI) set this freshness value. */
  isManualOverride?: boolean;
  /** Optional human-readable estimate, e.g. "Use within 2 days". Never a guarantee. */
  estimatedUseBy?: string;
}
