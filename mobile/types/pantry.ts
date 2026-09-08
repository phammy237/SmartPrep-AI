import { IngredientCategory, QuantityUnit } from './common';
import { FreshnessState } from './freshness';

export type PantryItemSource = 'scan' | 'manual' | 'grocery' | 'barcode' | 'receipt';

/** Simple two-state lifecycle. Richer "why it left" semantics live only in the pantry_events ledger, not here. */
export type PantryItemStatus = 'active' | 'depleted';

export type StorageLocation = 'fridge' | 'freezer' | 'pantry' | 'counter' | 'other';

/** Whether the stored quantity is a real user-entered number ('exact') or a rough estimate (reserved for future scan-derived quantities). */
export type QuantityConfidence = 'exact' | 'estimated';

/** A user-provided printed date is guidance, never a guaranteed safety deadline - see utils/expiration.ts. */
export type UserProvidedDateType = 'best_by' | 'use_by' | 'sell_by';

/**
 * How much we trust `estimatedExpirationDate`:
 *  - 'high': derived directly from a user-provided printed date
 *  - 'medium': derived from a generic category shelf-life heuristic + purchase date
 *  - 'low': a heuristic with no purchase date to anchor it (rare, defensive fallback)
 *  - 'unknown': no date information at all - never fabricate one
 */
export type ExpirationConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface PantryItem {
  id: string;
  ingredientId: string;
  /** Denormalized for fast list rendering. */
  name: string;
  imageUri: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
  freshness: FreshnessState;
  addedAt: string;
  updatedAt: string;
  source: PantryItemSource;
  notes?: string;

  // --- Phase 2 additions -----------------------------------------------
  // Populated for real (Supabase-backed) pantry items. Left undefined for
  // mock/scan-sourced items, which predate this schema and are unaffected -
  // every field below is optional so existing mock data stays valid as-is.
  /** Lowercased/trimmed form of `name`, for future search/matching. Never shown to the user. */
  normalizedName?: string;
  status?: PantryItemStatus;
  storageLocation?: StorageLocation;
  quantityConfidence?: QuantityConfidence;
  /** ISO date (YYYY-MM-DD) the item was purchased/added, if known. */
  purchaseDate?: string;
  /** ISO date the item was opened, if applicable. */
  openedDate?: string;
  /** ISO date printed on the package, as entered by the user - not a system estimate. */
  userProvidedDate?: string;
  userProvidedDateType?: UserProvidedDateType;
  /** System-computed estimate (from userProvidedDate, or a category heuristic + purchaseDate). Always paired with expirationConfidence. */
  estimatedExpirationDate?: string;
  expirationConfidence?: ExpirationConfidence;
  /** Last time the user confirmed "I still have this" - purely informational, not a safety signal. */
  lastConfirmedAt?: string;

  // Reserved for later phases (schema only - nothing in Phase 2 populates these
  // beyond a null/default): USDA matching (Phase 4), barcode scanning (Phase 9).
  estimatedGrams?: number;
  fdcId?: string;
  usdaMatchConfidence?: string;
  barcode?: string;
  brand?: string;
  /** Receipt intake provenance (see migration 0015). */
  sourceReceiptCandidateId?: string;
  sourceReceiptId?: string;
}
