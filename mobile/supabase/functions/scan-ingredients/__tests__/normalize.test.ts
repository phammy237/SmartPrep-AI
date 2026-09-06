import { MAX_DETECTIONS, VISION_JSON_SCHEMA, normalizeVisionResponse } from '../normalize';

describe('normalizeVisionResponse - valid output', () => {
  it('maps a well-formed object, clamping confidence and keeping nullable quantities', () => {
    const r = normalizeVisionResponse({
      detections: [
        { name: 'Chicken breast', quantity: 2, unit: 'item', category: 'protein', confidence: 1.4, quantityConfidence: 0.8, needsReview: false, notes: null },
        { name: 'Spinach', quantity: null, unit: 'bowl', category: 'produce', confidence: 0.7, quantityConfidence: 0.9, needsReview: true, notes: 'Loose in a bowl' },
      ],
      warnings: ['dim lighting'],
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') throw new Error('unexpected');
    expect(r.detections[0]).toEqual({
      name: 'Chicken breast',
      quantity: 2,
      unit: 'item',
      category: 'protein',
      confidence: 1, // clamped
      quantityConfidence: 0.8,
      needsReview: false,
      notes: null,
    });
    // no quantity -> quantityConfidence forced null even though the model sent 0.9
    expect(r.detections[1]).toMatchObject({ quantity: null, quantityConfidence: null, unit: 'bowl', notes: 'Loose in a bowl' });
    expect(r.warnings).toEqual(['dim lighting']);
  });

  it('parses a JSON string', () => {
    const r = normalizeVisionResponse('{"detections":[{"name":"Milk","quantity":1,"unit":"L","category":"dairy","confidence":0.9,"quantityConfidence":0.9,"needsReview":false,"notes":null}],"warnings":[]}');
    expect(r.status).toBe('ok');
  });

  it('drops entries with no usable name (non-food / noise)', () => {
    const r = normalizeVisionResponse({
      detections: [
        { name: '   ', quantity: 1, unit: 'item', category: null, confidence: 0.9, quantityConfidence: 0.9, needsReview: false, notes: null },
        { name: 'Apple', quantity: 3, unit: 'item', category: 'produce', confidence: 0.95, quantityConfidence: 0.95, needsReview: false, notes: null },
      ],
      warnings: [],
    });
    if (r.status !== 'ok') throw new Error('unexpected');
    expect(r.detections.map((d) => d.name)).toEqual(['Apple']);
  });

  it('caps the detection count and adds a warning', () => {
    const many = Array.from({ length: MAX_DETECTIONS + 5 }, (_, i) => ({
      name: `Item ${i}`,
      quantity: 1,
      unit: 'item',
      category: 'other',
      confidence: 0.9,
      quantityConfidence: 0.9,
      needsReview: false,
      notes: null,
    }));
    const r = normalizeVisionResponse({ detections: many, warnings: [] });
    if (r.status !== 'ok') throw new Error('unexpected');
    expect(r.detections).toHaveLength(MAX_DETECTIONS);
    expect(r.warnings.some((w) => w.includes(String(MAX_DETECTIONS)))).toBe(true);
  });

  it('coerces an invalid category to null and negative/zero quantity to null', () => {
    const r = normalizeVisionResponse({
      detections: [{ name: 'Thing', quantity: -2, unit: 'oz', category: 'snacks', confidence: 0.8, quantityConfidence: 0.5, needsReview: false, notes: null }],
      warnings: [],
    });
    if (r.status !== 'ok') throw new Error('unexpected');
    expect(r.detections[0]).toMatchObject({ quantity: null, category: null, quantityConfidence: null });
  });

  it('truncates over-long notes', () => {
    const r = normalizeVisionResponse({
      detections: [{ name: 'X', quantity: 1, unit: 'item', category: null, confidence: 0.9, quantityConfidence: 0.9, needsReview: false, notes: 'z'.repeat(500) }],
      warnings: [],
    });
    if (r.status !== 'ok') throw new Error('unexpected');
    expect((r.detections[0].notes ?? '').length).toBeLessThanOrEqual(200);
  });

  it('never lets a fabricated id-like field through (schema has no id, and unknown keys are ignored)', () => {
    const r = normalizeVisionResponse({
      detections: [{ name: 'Chicken', quantity: 1, unit: 'lb', category: 'protein', confidence: 0.9, quantityConfidence: 0.9, needsReview: false, notes: null, canonicalIngredientHint: 'ing-chicken-breast', id: 'evil' }],
      warnings: [],
    });
    if (r.status !== 'ok') throw new Error('unexpected');
    expect(r.detections[0]).not.toHaveProperty('canonicalIngredientHint');
    expect(r.detections[0]).not.toHaveProperty('id');
  });
});

describe('normalizeVisionResponse - bad output', () => {
  it('non-JSON string -> model_refusal', () => {
    const r = normalizeVisionResponse("I can't help with that.");
    expect(r.status).toBe('model_refusal');
  });

  it('explicit refusal field -> model_refusal', () => {
    expect(normalizeVisionResponse({ refusal: 'no' }).status).toBe('model_refusal');
  });

  it('malformed shapes', () => {
    expect(normalizeVisionResponse('').status).toBe('malformed');
    expect(normalizeVisionResponse(42).status).toBe('malformed');
    expect(normalizeVisionResponse({ detections: 'nope' }).status).toBe('malformed');
  });

  it('empty detections array is still ok (no findings)', () => {
    const r = normalizeVisionResponse({ detections: [], warnings: ['too blurry'] });
    expect(r).toMatchObject({ status: 'ok', detections: [], warnings: ['too blurry'] });
  });
});

describe('VISION_JSON_SCHEMA', () => {
  it('is strict and forbids id / nutrition / date fields', () => {
    expect(VISION_JSON_SCHEMA.strict).toBe(true);
    const props = VISION_JSON_SCHEMA.schema.properties.detections.items.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(
      ['category', 'confidence', 'name', 'needsReview', 'notes', 'quantity', 'quantityConfidence', 'unit'].sort(),
    );
    expect(props).not.toHaveProperty('canonicalIngredientHint');
    expect(props).not.toHaveProperty('fdcId');
    expect(props).not.toHaveProperty('expirationDate');
  });
});
