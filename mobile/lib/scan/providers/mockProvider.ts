import type {
  IngredientInferenceInput,
  IngredientInferenceProvider,
  IngredientInferenceResult,
} from './types';

/**
 * A deterministic, network-free provider for tests and local dev - never
 * calls a real model. Pass either a fixed result or a function of the input
 * (e.g. to vary the response by `scanMode`/`section`).
 */
export function createMockIngredientInferenceProvider(
  fixture:
    | IngredientInferenceResult
    | ((input: IngredientInferenceInput) => IngredientInferenceResult | Promise<IngredientInferenceResult>),
): IngredientInferenceProvider {
  return {
    id: 'mock',
    async detect(input) {
      const result = typeof fixture === 'function' ? await fixture(input) : fixture;
      return { model: { provider: 'mock' }, ...result };
    },
  };
}
