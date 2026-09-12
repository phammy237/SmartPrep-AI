import { ScanInferenceError } from '@/lib/supabase/repositories';
import { getIngredientInferenceProviderFlag } from './config';
import { openAiBenchmarkProvider } from './openAiBenchmarkProvider';
import type { IngredientInferenceProvider } from './types';

export * from './types';
export * from './config';
export { openAiBenchmarkProvider } from './openAiBenchmarkProvider';
export { smartPrepModelProvider } from './smartPrepModelProvider';
export { createMockIngredientInferenceProvider } from './mockProvider';

/** `IngredientInferenceProvider.id` for `unavailableProvider` below - exported so `isIngredientInferenceAvailable` (and tests) don't duplicate the literal. */
const UNAVAILABLE_PROVIDER_ID = 'unavailable';

/**
 * Returned when no production ingredient-inference provider is configured.
 * `smartPrepModelProvider` is intentionally NOT used here - it is unimplemented
 * (see docs/INGREDIENT_MODEL_ROADMAP.md) and returning it would just trade one
 * throwing stub for another with a less honest error code. This gives Scan a
 * single, clear, provider-neutral failure (`ScanInferenceError('provider_unavailable')`)
 * that `ProcessingScreen`'s existing error handling already knows how to render.
 */
const unavailableProvider: IngredientInferenceProvider = {
  id: UNAVAILABLE_PROVIDER_ID,
  async detect() {
    throw new ScanInferenceError(
      'provider_unavailable',
      'No ingredient-recognition provider is configured. SmartPrep\'s custom model is not implemented yet, and the OpenAI benchmark provider is opt-in only (see docs/INGREDIENT_MODEL_ROADMAP.md).',
    );
  },
};

/**
 * The ONE seam `scanService` depends on for ingredient inference.
 *
 * OpenAI is an optional benchmark/fallback, not SmartPrep's production-primary
 * path (docs/INGREDIENT_MODEL_ROADMAP.md) - so it only runs when explicitly
 * selected via `EXPO_PUBLIC_INGREDIENT_INFERENCE_PROVIDER=openai-benchmark`
 * (./config.ts). Production, where that flag is unset, gets a clear
 * `provider_unavailable` failure instead of a silent OpenAI call.
 * `smartPrepModelProvider` (SmartPrep's future custom model) is never
 * returned here yet - it has no implementation to activate. Wiring it in for
 * real, once trained, is the only change this function will ever need.
 */
export function getActiveIngredientInferenceProvider(): IngredientInferenceProvider {
  const flag = getIngredientInferenceProviderFlag();
  if (flag === 'openai-benchmark') return openAiBenchmarkProvider;
  return unavailableProvider;
}

/**
 * Provider-neutral availability check for the Scan UI to use BEFORE letting
 * the user take a photo - so an unconfigured provider is surfaced up front
 * ("Ingredient photo scanning is currently in development") instead of only
 * after capture + processing. Single source of truth with
 * `getActiveIngredientInferenceProvider` above: this can never drift out of
 * sync with which provider will actually be used, because it asks the same
 * factory rather than re-deriving the answer from the flag itself.
 */
export function isIngredientInferenceAvailable(): boolean {
  return getActiveIngredientInferenceProvider().id !== UNAVAILABLE_PROVIDER_ID;
}
