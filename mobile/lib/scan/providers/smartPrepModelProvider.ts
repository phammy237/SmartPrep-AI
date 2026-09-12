import type { IngredientInferenceInput, IngredientInferenceProvider, IngredientInferenceResult } from './types';

/**
 * FUTURE production provider - SmartPrep's own custom ingredient-recognition
 * model. NOT implemented yet: no model has been trained, exported, or
 * deployed (see docs/INGREDIENT_MODEL_ROADMAP.md for the staged plan). This
 * stub exists only to reserve the integration point: wiring in the real model
 * later is a one-line change in `getActiveIngredientInferenceProvider`
 * (./index.ts) - Scan UI, Review, History, and Pantry confirmation never need
 * to change when it lands, because they all depend on `IngredientInferenceProvider`,
 * not on this file.
 */
export const smartPrepModelProvider: IngredientInferenceProvider = {
  id: 'smartprep-model',
  async detect(_input: IngredientInferenceInput): Promise<IngredientInferenceResult> {
    throw new Error(
      'smartPrepModelProvider is not implemented yet - SmartPrep\'s custom ingredient model has not been trained or deployed. See docs/INGREDIENT_MODEL_ROADMAP.md.',
    );
  },
};
