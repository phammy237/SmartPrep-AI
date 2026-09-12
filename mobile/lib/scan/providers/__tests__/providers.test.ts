import * as repositories from '@/lib/supabase/repositories';
import { ScanInferenceError } from '@/lib/supabase/repositories';
import { getIngredientInferenceProviderFlag, parseIngredientInferenceProviderFlag } from '../config';
import {
  createMockIngredientInferenceProvider,
  getActiveIngredientInferenceProvider,
  isIngredientInferenceAvailable,
  openAiBenchmarkProvider,
  smartPrepModelProvider,
} from '../index';

// `@/lib/supabase/repositories` transitively imports the real Supabase client
// (for scanVisionRepository's `supabase.functions.invoke`), which throws at
// import time without real EXPO_PUBLIC_SUPABASE_* env vars - mock the client
// out first so `jest.requireActual` below can safely pull in the real
// `ScanInferenceError` class alongside the mocked `detectScanIngredients`.
jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

jest.mock('@/lib/supabase/repositories', () => {
  const actual = jest.requireActual('@/lib/supabase/repositories');
  return { ...actual, detectScanIngredients: jest.fn() };
});

// Expo's babel preset statically inlines `process.env.EXPO_PUBLIC_*` at
// transform time, so mutating `process.env` at test runtime cannot control
// `getIngredientInferenceProviderFlag`'s return value (see config.ts's own
// comment). Mock only the env-reading wrapper - `parseIngredientInferenceProviderFlag`
// stays real so its own validation rule is still exercised directly below.
jest.mock('../config', () => {
  const actual = jest.requireActual('../config');
  return { ...actual, getIngredientInferenceProviderFlag: jest.fn() };
});
const getFlag = getIngredientInferenceProviderFlag as jest.Mock;

const detectScanIngredients = repositories.detectScanIngredients as jest.Mock;

const INPUT = { image: { base64: 'x', mimeType: 'image/jpeg' as const }, scanMode: 'quick' as const, section: 'quick' as const };

beforeEach(() => {
  jest.clearAllMocks();
  getFlag.mockReturnValue(undefined);
});

describe('parseIngredientInferenceProviderFlag (pure - no env/transform involved)', () => {
  it('accepts the one recognized value', () => {
    expect(parseIngredientInferenceProviderFlag('openai-benchmark')).toBe('openai-benchmark');
  });

  it('treats unset, empty, and unrecognized values all as "not configured"', () => {
    expect(parseIngredientInferenceProviderFlag(undefined)).toBeUndefined();
    expect(parseIngredientInferenceProviderFlag('')).toBeUndefined();
    expect(parseIngredientInferenceProviderFlag('smartprep-model')).toBeUndefined();
    expect(parseIngredientInferenceProviderFlag('gpt-vision-please')).toBeUndefined();
  });
});

describe('openAiBenchmarkProvider', () => {
  it('delegates to detectScanIngredients with the input unchanged and tags the result with its provider id', async () => {
    detectScanIngredients.mockResolvedValue({ detections: [], warnings: ['dim'] });

    const result = await openAiBenchmarkProvider.detect(INPUT);

    expect(detectScanIngredients).toHaveBeenCalledWith(INPUT);
    expect(result).toEqual({ detections: [], warnings: ['dim'], model: { provider: 'openai-benchmark' } });
  });

  it('propagates a provider failure (e.g. ScanInferenceError) unchanged', async () => {
    const err = new Error('rate_limited');
    detectScanIngredients.mockRejectedValue(err);
    await expect(openAiBenchmarkProvider.detect(INPUT)).rejects.toBe(err);
  });
});

describe('smartPrepModelProvider', () => {
  it('is not implemented yet - rejects rather than pretending to infer', async () => {
    await expect(smartPrepModelProvider.detect(INPUT)).rejects.toThrow(/not implemented/i);
  });
});

describe('createMockIngredientInferenceProvider', () => {
  it('returns a fixed result tagged with the mock provider id', async () => {
    const provider = createMockIngredientInferenceProvider({ detections: [], warnings: [] });
    const result = await provider.detect(INPUT);
    expect(result).toEqual({ detections: [], warnings: [], model: { provider: 'mock' } });
  });

  it('supports a function fixture that can vary by input', async () => {
    const provider = createMockIngredientInferenceProvider((input) => ({
      detections: [],
      warnings: [`mode:${input.scanMode}`],
    }));
    const result = await provider.detect(INPUT);
    expect(result.warnings).toEqual(['mode:quick']);
  });

  it('lets a fixture override the provider tag', async () => {
    const provider = createMockIngredientInferenceProvider({
      detections: [],
      warnings: [],
      model: { provider: 'mock', version: 'v-test' },
    });
    const result = await provider.detect(INPUT);
    expect(result.model).toEqual({ provider: 'mock', version: 'v-test' });
  });
});

describe('getActiveIngredientInferenceProvider - OpenAI is opt-in, never a silent default', () => {
  it('runs the OpenAI benchmark provider ONLY when explicitly selected via the flag', async () => {
    getFlag.mockReturnValue('openai-benchmark');
    detectScanIngredients.mockResolvedValue({ detections: [], warnings: [] });

    const provider = getActiveIngredientInferenceProvider();
    expect(provider).toBe(openAiBenchmarkProvider);

    await provider.detect(INPUT);
    expect(detectScanIngredients).toHaveBeenCalledWith(INPUT);
  });

  it('an unconfigured flag does NOT fall back to OpenAI - it fails closed', async () => {
    getFlag.mockReturnValue(undefined);

    const provider = getActiveIngredientInferenceProvider();
    expect(provider).not.toBe(openAiBenchmarkProvider);

    await expect(provider.detect(INPUT)).rejects.toBeInstanceOf(ScanInferenceError);
    expect(detectScanIngredients).not.toHaveBeenCalled();
  });

  it('never activates smartPrepModelProvider - it stays unimplemented until wired in for real', () => {
    for (const flag of [undefined, 'openai-benchmark', 'smartprep-model', 'garbage'] as const) {
      getFlag.mockReturnValue(flag);
      expect(getActiveIngredientInferenceProvider()).not.toBe(smartPrepModelProvider);
    }
  });

  it('the unconfigured failure carries the provider_unavailable code the UI already knows how to render', async () => {
    getFlag.mockReturnValue(undefined);
    const provider = getActiveIngredientInferenceProvider();
    const err = await provider.detect(INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(ScanInferenceError);
    expect(err.code).toBe('provider_unavailable');
  });
});

describe('isIngredientInferenceAvailable - the pre-capture gate ScanModeSelectScreen uses', () => {
  it('is false with no provider configured - photo capture must not proceed', () => {
    getFlag.mockReturnValue(undefined);
    expect(isIngredientInferenceAvailable()).toBe(false);
  });

  it('is false for an unrecognized flag value too', () => {
    getFlag.mockReturnValue('garbage');
    expect(isIngredientInferenceAvailable()).toBe(false);
  });

  it('is true once the OpenAI benchmark provider is explicitly opted into - capture stays enabled', () => {
    getFlag.mockReturnValue('openai-benchmark');
    expect(isIngredientInferenceAvailable()).toBe(true);
  });

  it('never reports available on the strength of smartPrepModelProvider, which has no wiring to select it', () => {
    for (const flag of [undefined, 'smartprep-model', 'garbage'] as const) {
      getFlag.mockReturnValue(flag);
      expect(isIngredientInferenceAvailable()).toBe(false);
    }
  });
});
