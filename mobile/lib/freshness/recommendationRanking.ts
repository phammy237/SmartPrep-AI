/**
 * Deterministic ranking for "Use Soon" recipe recommendations.
 *
 * NO LLM. The score is a small, fixed-weight sum of explainable facts:
 *
 *   rankScore =
 *       urgencyContribution      Σ over urgent ingredients used:
 *                                  STATE_WEIGHT[state] * utilizationFactor
 *     + coverageContribution     COVERAGE_WEIGHT * covered / total
 *     - shortfallPenalty         MISSING_PENALTY * missing  (capped)
 *     + plannedBonus             +PLANNED_BONUS if already scheduled soon
 *     - unresolvedPenalty        -UNRESOLVED_PENALTY if a quantity couldn't be compared
 *
 * The number is used ONLY for sorting; the UI shows the structured `reasons`.
 * Tie-breaks are fully specified so the output never depends on input order.
 */

import { daysBetweenIsoDates } from '@/utils/expiration';
import { ExpiryState } from './expiryModel';

export type RecommendationTier = 'ready_now' | 'almost_ready' | 'use_soon_match';

export type RecommendationReasonCode =
  | 'uses_expiring_ingredient'
  | 'uses_multiple_use_soon'
  | 'ready_now'
  | 'almost_ready'
  | 'missing_several'
  | 'already_planned'
  | 'planned_after_expiry'
  | 'quantity_unresolved';

export interface SmartRecommendationReason {
  code: RecommendationReasonCode;
  text: string;
}

export interface UrgentIngredientDetail {
  ingredientId: string;
  name: string;
  expiryState: ExpiryState;
  expirationDate?: string;
  /** Whole calendar days from today; negative = past. Undefined when the date is not comparable. */
  daysUntilExpiry?: number;
  /** True only for a user-provided printed date. Drives "expires" vs "estimated to expire" phrasing. */
  isUserConfirmedDate: boolean;
  /** Recommendation-only FEFO allocation: how much of this at-risk stock the recipe would use. */
  quantityUtilized?: number;
  unit?: string;
  /** True when lot/recipe units couldn't be compared - identity match only. */
  quantityUnresolved: boolean;
}

/** Per-recipe facts the service gathers; ranking turns these into the output rows. */
export interface RecommendationCandidate {
  recipeId: string;
  recipeVersionId: string;
  title: string;
  imageUri: string;
  /** Non-staple ingredient coverage from the hydrated recipe. */
  coveredCount: number;
  totalCount: number;
  missingIngredientCount: number;
  urgentIngredients: UrgentIngredientDetail[];
  /** Nearest upcoming planned date (YYYY-MM-DD) for this recipe within the window, if any. */
  plannedDate?: string;
  /** An urgent ingredient's date falls before `plannedDate`. */
  plannedAfterExpiryWarning?: boolean;
}

export interface SmartRecipeRecommendation extends RecommendationCandidate {
  rankScore: number;
  tier: RecommendationTier;
  reasons: SmartRecommendationReason[];
}

export interface RankRecommendationsOptions {
  /** Today (YYYY-MM-DD) in the user's zone - for "planned for Tuesday" phrasing. Pure/deterministic. */
  today: string;
  /** Recipes with 1..this many missing ingredients are `almost_ready`. Default 2. */
  almostReadyMaxMissing?: number;
}

const STATE_WEIGHT: Record<ExpiryState, number> = {
  expired: 5,
  critical: 4,
  use_soon: 2,
  unknown: 0,
  fresh: 0,
};

const COVERAGE_WEIGHT = 3;
const MISSING_PENALTY = 0.75;
const MISSING_PENALTY_CAP = 3;
const PLANNED_BONUS = 1;
const UNRESOLVED_PENALTY = 0.5;
/** Identity-only match (no comparable quantity) still counts, at half strength. */
const UNRESOLVED_UTILIZATION = 0.5;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "tomorrow" / "Tuesday" / "Jun 12" depending on distance. */
function relativePlannedPhrase(today: string, planned: string): string {
  const diff = daysBetweenIsoDates(today, planned);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 6) return weekdayOf(planned);
  const [, m, d] = planned.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`;
}

/**
 * Weight for a single urgent ingredient's contribution (0..1):
 *   - a real, quantified use of at-risk stock  -> 1
 *   - identity match but no comparable quantity -> 0.5
 */
function utilizationFactor(u: UrgentIngredientDetail): number {
  if (u.quantityUnresolved) return UNRESOLVED_UTILIZATION;
  return typeof u.quantityUtilized === 'number' && u.quantityUtilized > 0 ? 1 : UNRESOLVED_UTILIZATION;
}

function mostUrgent(list: UrgentIngredientDetail[]): UrgentIngredientDetail | undefined {
  const order: ExpiryState[] = ['expired', 'critical', 'use_soon'];
  return [...list].sort((a, b) => {
    const ra = order.indexOf(a.expiryState);
    const rb = order.indexOf(b.expiryState);
    if (ra !== rb) return ra - rb;
    return a.ingredientId < b.ingredientId ? -1 : a.ingredientId > b.ingredientId ? 1 : 0;
  })[0];
}

function whenPhrase(days: number | undefined): string {
  if (days === undefined) return 'soon';
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function expiringPhrase(u: UrgentIngredientDetail): string {
  const name = u.name.toLowerCase();
  if (u.expiryState === 'expired') {
    return u.isUserConfirmedDate ? `Uses ${name} past its date` : `Uses ${name} past its estimated date`;
  }
  if (u.expiryState === 'critical') {
    const when = whenPhrase(u.daysUntilExpiry);
    return u.isUserConfirmedDate ? `Uses ${name} expiring ${when}` : `Uses ${name} estimated to expire ${when}`;
  }
  return `Uses ${name} that should be used soon`;
}

/**
 * Tier from non-staple missing count. Exported so the meal-plan generator uses
 * the exact same thresholds as Home recommendations.
 */
export function recommendationTierOf(missing: number, almostReadyMaxMissing = 2): RecommendationTier {
  if (missing === 0) return 'ready_now';
  if (missing <= almostReadyMaxMissing) return 'almost_ready';
  return 'use_soon_match';
}

function reasonsFor(c: RecommendationCandidate, tier: RecommendationTier, opts: RankRecommendationsOptions): SmartRecommendationReason[] {
  const reasons: SmartRecommendationReason[] = [];

  const top = mostUrgent(c.urgentIngredients);
  if (top) reasons.push({ code: 'uses_expiring_ingredient', text: expiringPhrase(top) });
  if (c.urgentIngredients.length >= 2) {
    reasons.push({
      code: 'uses_multiple_use_soon',
      text: `Uses ${c.urgentIngredients.length} ingredients that should be used soon`,
    });
  }

  if (tier === 'ready_now') {
    reasons.push({ code: 'ready_now', text: 'You have everything you need' });
  } else if (c.missingIngredientCount === 1) {
    reasons.push({ code: 'almost_ready', text: 'Only missing 1 ingredient' });
  } else if (c.missingIngredientCount >= 2) {
    reasons.push({ code: 'missing_several', text: `Missing ${c.missingIngredientCount} ingredients` });
  }

  if (c.plannedDate) {
    reasons.push({
      code: 'already_planned',
      text: `Already planned for ${relativePlannedPhrase(opts.today, c.plannedDate)}`,
    });
    if (c.plannedAfterExpiryWarning && top) {
      reasons.push({
        code: 'planned_after_expiry',
        text: `${cap(top.name)} may need to be used before your ${relativePlannedPhrase(opts.today, c.plannedDate)} meal`,
      });
    }
  }

  if (c.urgentIngredients.some((u) => u.quantityUnresolved)) {
    reasons.push({ code: 'quantity_unresolved', text: "Some quantities couldn't be compared to your pantry" });
  }

  return reasons;
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * The one deterministic candidate score. Used by `rankRecommendations` for
 * Home "Use Soon" AND by the meal-plan generator for `Generate My Week`, so
 * the two features can never disagree on what "more urgent to cook" means.
 * Works for candidates with or without urgent ingredients (a fresh-only
 * candidate just gets `urgency = 0` and is ranked on coverage / shortfall).
 */
export function scoreRecommendationCandidate(c: RecommendationCandidate): number {
  const urgency = c.urgentIngredients.reduce((sum, u) => sum + STATE_WEIGHT[u.expiryState] * utilizationFactor(u), 0);
  const coverage = c.totalCount > 0 ? (COVERAGE_WEIGHT * c.coveredCount) / c.totalCount : COVERAGE_WEIGHT;
  const missingPenalty = Math.min(MISSING_PENALTY_CAP, MISSING_PENALTY * c.missingIngredientCount);
  const plannedBonus = c.plannedDate ? PLANNED_BONUS : 0;
  const unresolvedPenalty = c.urgentIngredients.some((u) => u.quantityUnresolved) ? UNRESOLVED_PENALTY : 0;
  return round3(urgency + coverage - missingPenalty + plannedBonus - unresolvedPenalty);
}

function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/**
 * Rank + tier + explain. Candidates with NO urgent ingredient are dropped -
 * "Use Soon" is urgency-specific by definition. Fully deterministic:
 *   1. rankScore desc
 *   2. more urgent ingredients desc
 *   3. fewer missing ingredients asc
 *   4. recipeVersionId asc
 */
export function rankRecommendations(
  candidates: RecommendationCandidate[],
  opts: RankRecommendationsOptions,
): SmartRecipeRecommendation[] {
  const almostReadyMax = opts.almostReadyMaxMissing ?? 2;

  return candidates
    .filter((c) => c.urgentIngredients.length > 0)
    .map((c) => {
      const tier = recommendationTierOf(c.missingIngredientCount, almostReadyMax);
      return { ...c, rankScore: scoreRecommendationCandidate(c), tier, reasons: reasonsFor(c, tier, opts) };
    })
    .sort((a, b) => {
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
      if (b.urgentIngredients.length !== a.urgentIngredients.length) {
        return b.urgentIngredients.length - a.urgentIngredients.length;
      }
      if (a.missingIngredientCount !== b.missingIngredientCount) {
        return a.missingIngredientCount - b.missingIngredientCount;
      }
      return a.recipeVersionId < b.recipeVersionId ? -1 : a.recipeVersionId > b.recipeVersionId ? 1 : 0;
    });
}
