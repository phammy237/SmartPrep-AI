/**
 * Provider-neutral ingredient-inference contract. `scanService` (and
 * everything above it - Scan UI, Review, History, Pantry confirmation) depends
 * ONLY on these types, never on a specific inference provider's request/response
 * shape. See docs/INGREDIENT_MODEL_ROADMAP.md for the plan to add a custom
 * SmartPrep model behind this same boundary.
 *
 * These are deliberately ALIASES of the existing scan-ingredients wire types
 * (`lib/validation/scanSchemas.ts`, `lib/supabase/repositories/scanVisionRepository.ts`)
 * rather than a duplicate concept - today's only real provider (the OpenAI
 * Edge Function) already returns exactly this shape, so no mapping layer is
 * needed. A future provider (custom model, mock) just needs to produce the
 * same shape.
 */

import type { DetectScanIngredientsArgs, ScanVisionResult } from '@/lib/supabase/repositories';
import type { VisionDetection } from '@/lib/validation/scanSchemas';

/** One candidate ingredient a provider proposed, pre-review. Same shape scanService.mapVisionDetection already consumes. */
export type IngredientDetectionCandidate = VisionDetection;

/** What a provider needs to run inference: the captured photo + scan context. */
export type IngredientInferenceInput = DetectScanIngredientsArgs;

/** Which model/provider actually produced a result - not persisted anywhere yet (see docs/INGREDIENT_MODEL_ROADMAP.md Phase E), but available at this boundary for when it is. */
export interface IngredientInferenceModelInfo {
  provider: string;
  version?: string;
}

export interface IngredientInferenceResult extends ScanVisionResult {
  model?: IngredientInferenceModelInfo;
}

/**
 * One ingredient-inference backend. `SmartPrepModelProvider` (future, not yet
 * implemented), `OpenAIBenchmarkProvider` (today's default - wraps the existing
 * `scan-ingredients` Edge Function), and a mock provider for tests/dev all
 * implement this same interface, so swapping which one is "active" never
 * requires touching Scan UI, Review, History, or Pantry confirmation.
 */
export interface IngredientInferenceProvider {
  /** Stable identifier, e.g. for the eventual `model.provider` tag and logs - never shown to the user. */
  readonly id: string;
  detect(input: IngredientInferenceInput): Promise<IngredientInferenceResult>;
}
