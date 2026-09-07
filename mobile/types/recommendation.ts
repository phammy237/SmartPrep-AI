/**
 * The Smart Expiry & Waste recommendation domain model. The engine and its
 * pure helpers live in `lib/freshness/`; these re-exports give screens and
 * hooks an ergonomic import without reaching into `lib/`.
 */
export type {
  ExpiryState,
  ExpiryAssessment,
} from '@/lib/freshness/expiryModel';
export type {
  ExpiringLot,
  LotAllocation,
  LotUse,
} from '@/lib/freshness/lotAllocation';
export type {
  RecommendationTier,
  RecommendationReasonCode,
  SmartRecommendationReason,
  UrgentIngredientDetail,
  SmartRecipeRecommendation,
} from '@/lib/freshness/recommendationRanking';
