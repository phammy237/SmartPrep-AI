import { z } from 'zod';

/**
 * Non-secret provider-selection flag for ingredient inference. Follows the
 * same `EXPO_PUBLIC_*` + zod pattern as `lib/supabase/env.ts`.
 *
 * OpenAI benchmark inference is opt-in, never a silent default - see
 * docs/INGREDIENT_MODEL_ROADMAP.md: OpenAI is an optional benchmark/fallback,
 * not SmartPrep's production-primary ingredient-recognition path. Set
 * `EXPO_PUBLIC_INGREDIENT_INFERENCE_PROVIDER=openai-benchmark` locally (e.g.
 * in `.env`) to opt into it for development/testing; leave it unset in
 * production so a misconfiguration can never silently fall back to sending
 * photos to OpenAI.
 *
 * NOTE ON TESTABILITY: Expo's babel preset statically inlines
 * `process.env.EXPO_PUBLIC_*` reads at transform time (the same mechanism
 * `EXPO_PUBLIC_SUPABASE_URL` relies on) - mutating `process.env` at test
 * runtime has no effect on already-compiled code. `parseIngredientInferenceProviderFlag`
 * below is a pure function so the validation rule itself is directly
 * unit-testable; `getIngredientInferenceProviderFlag` (the thin env-reading
 * wrapper) is what consumers should mock in their own tests, the same way
 * `lib/supabase/client` is mocked rather than trying to fake `env.ts`'s inputs.
 */
const PROVIDER_FLAG_VALUES = ['openai-benchmark'] as const;
export type IngredientInferenceProviderFlag = (typeof PROVIDER_FLAG_VALUES)[number];

const providerFlagSchema = z.enum(PROVIDER_FLAG_VALUES);

/**
 * Validates a raw string against the allowed provider flag values. An unset,
 * empty, or unrecognized value all resolve to `undefined` - never a guess,
 * never a fallback to a provider nobody asked for.
 */
export function parseIngredientInferenceProviderFlag(raw: string | undefined): IngredientInferenceProviderFlag | undefined {
  const parsed = providerFlagSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Reads and validates `EXPO_PUBLIC_INGREDIENT_INFERENCE_PROVIDER`.
 * `getActiveIngredientInferenceProvider` (./index.ts) treats `undefined` as
 * "no production provider is configured."
 */
export function getIngredientInferenceProviderFlag(): IngredientInferenceProviderFlag | undefined {
  return parseIngredientInferenceProviderFlag(process.env.EXPO_PUBLIC_INGREDIENT_INFERENCE_PROVIDER);
}
