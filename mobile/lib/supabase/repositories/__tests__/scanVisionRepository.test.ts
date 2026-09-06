import { supabase } from '../../client';
import { ScanInferenceError, detectScanIngredients } from '../scanVisionRepository';

jest.mock('../../client', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = supabase.functions.invoke as jest.Mock;

const IMG = { base64: 'x'.repeat(200), mimeType: 'image/jpeg' as const };

beforeEach(() => jest.clearAllMocks());

describe('detectScanIngredients - request', () => {
  it('invokes scan-ingredients with the image + mode; drops section for quick mode', async () => {
    invoke.mockResolvedValue({ data: { status: 'ok', detections: [], warnings: [] }, error: null });
    await detectScanIngredients({ image: IMG, scanMode: 'quick', section: 'quick' });
    expect(invoke).toHaveBeenCalledWith('scan-ingredients', {
      body: { image: { base64: IMG.base64, mimeType: 'image/jpeg' }, scanMode: 'quick', section: undefined, knownContext: undefined },
    });
  });

  it('passes a guided section through', async () => {
    invoke.mockResolvedValue({ data: { status: 'ok', detections: [], warnings: [] }, error: null });
    await detectScanIngredients({ image: IMG, scanMode: 'guided', section: 'fridge' });
    expect(invoke.mock.calls[0][1].body.section).toBe('fridge');
  });
});

describe('detectScanIngredients - success mapping', () => {
  it('returns validated detections + warnings', async () => {
    invoke.mockResolvedValue({
      data: {
        status: 'ok',
        detections: [
          { name: 'Milk', quantity: 1, unit: 'L', category: 'dairy', confidence: 0.9, quantityConfidence: 0.85, needsReview: false, notes: null },
        ],
        warnings: ['ok'],
      },
      error: null,
    });
    const r = await detectScanIngredients({ image: IMG, scanMode: 'quick' });
    expect(r.detections).toHaveLength(1);
    expect(r.detections[0].name).toBe('Milk');
    expect(r.warnings).toEqual(['ok']);
  });

  it('accepts a no_detections success (empty list)', async () => {
    invoke.mockResolvedValue({ data: { status: 'no_detections', detections: [], warnings: ['too blurry'] }, error: null });
    const r = await detectScanIngredients({ image: IMG, scanMode: 'quick' });
    expect(r.detections).toEqual([]);
  });
});

describe('detectScanIngredients - errors are typed, never canned data', () => {
  it.each([
    ['unauthenticated', 'unauthenticated'],
    ['rate_limited', 'rate_limited'],
    ['upstream_timeout', 'upstream_timeout'],
    ['image_too_large', 'image_too_large'],
    ['config_error', 'config_error'],
    ['malformed_upstream', 'malformed_upstream'],
  ])('maps function status %s -> ScanInferenceError(%s)', async (status, code) => {
    invoke.mockResolvedValue({ data: { status }, error: null });
    const err = await detectScanIngredients({ image: IMG, scanMode: 'quick' }).catch((e) => e);
    expect(err).toBeInstanceOf(ScanInferenceError);
    expect(err.code).toBe(code);
  });

  it('maps a model_refusal body -> ScanInferenceError("model_refusal")', async () => {
    invoke.mockResolvedValue({ data: { status: 'model_refusal', message: 'no' }, error: null });
    const err = await detectScanIngredients({ image: IMG, scanMode: 'quick' }).catch((e) => e);
    expect(err).toBeInstanceOf(ScanInferenceError);
    expect(err.code).toBe('model_refusal');
  });

  it('a transport error (no usable body) -> ScanInferenceError("upstream_error")', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('FunctionsFetchError') });
    const err = await detectScanIngredients({ image: IMG, scanMode: 'quick' }).catch((e) => e);
    expect(err).toBeInstanceOf(ScanInferenceError);
    expect(err.code).toBe('upstream_error');
  });

  it('a thrown network failure -> ScanInferenceError("network")', async () => {
    invoke.mockRejectedValue(new Error('Network request failed'));
    const err = await detectScanIngredients({ image: IMG, scanMode: 'quick' }).catch((e) => e);
    expect(err).toBeInstanceOf(ScanInferenceError);
    expect(err.code).toBe('network');
  });

  it('a malformed success body -> ScanInferenceError("malformed_upstream")', async () => {
    invoke.mockResolvedValue({ data: { status: 'ok', detections: [{ name: 'X' /* missing required fields */ }] }, error: null });
    const err = await detectScanIngredients({ image: IMG, scanMode: 'quick' }).catch((e) => e);
    expect(err).toBeInstanceOf(ScanInferenceError);
    expect(err.code).toBe('malformed_upstream');
  });
});
