import { detectScanIngredients } from '@/lib/supabase/repositories';
import type { IngredientInferenceInput, IngredientInferenceProvider, IngredientInferenceResult } from './types';

/**
 * Wraps the existing `scan-ingredients` Supabase Edge Function (OpenAI vision).
 * This was SmartPrep's original ingredient-recognition path; it is kept as an
 * optional benchmark/fallback and internal comparison tool while
 * `smartPrepModelProvider` is developed, but is no longer the intended
 * production-primary architecture - see docs/INGREDIENT_MODEL_ROADMAP.md.
 *
 * `scan-ingredients` itself is unchanged: it is not deployed or modified by
 * this pivot, only no longer wired in as the assumed permanent default.
 */
export const openAiBenchmarkProvider: IngredientInferenceProvider = {
  id: 'openai-benchmark',
  async detect(input: IngredientInferenceInput): Promise<IngredientInferenceResult> {
    const result = await detectScanIngredients(input);
    return { ...result, model: { provider: 'openai-benchmark' } };
  },
};
