import {
  isDefensiblyVerified,
  normalizeFoodDetail,
  normalizeSearchResponse,
} from '../normalize';

describe('normalizeFoodDetail', () => {
  it('maps USDA foodNutrients (per 100 g) to the seven SmartPrep nutrients', () => {
    const raw = {
      fdcId: 171077,
      description: 'Chicken, broilers or fryers, breast, meat only, raw',
      dataType: 'SR Legacy',
      foodNutrients: [
        { nutrient: { number: '1008' }, amount: 165 },
        { nutrient: { number: '1003' }, amount: 31 },
        { nutrient: { number: '1004' }, amount: 3.6 },
        { nutrient: { number: '1005' }, amount: 0 },
        { nutrient: { number: '1079' }, amount: 0 },
        { nutrient: { number: '2000' }, amount: 0 },
        { nutrient: { number: '1093' }, amount: 74 },
        { nutrient: { number: '9999' }, amount: 123 }, // ignored
      ],
    };
    const r = normalizeFoodDetail(raw);
    expect(r).toEqual({
      status: 'ok',
      fdcId: 171077,
      description: 'Chicken, broilers or fryers, breast, meat only, raw',
      dataType: 'SR Legacy',
      brandOwner: null,
      servingSize: null,
      servingSizeUnit: null,
      nutritionPer100g: { calories: 165, proteinG: 31, fatG: 3.6, carbsG: 0, fiberG: 0, sugarG: 0, sodiumMg: 74 },
    });
  });

  it('derives kcal from kJ (1062) when no kcal nutrient is present', () => {
    const r = normalizeFoodDetail({
      fdcId: 1,
      description: 'x',
      foodNutrients: [
        { nutrient: { number: '1062' }, amount: 2000 },
        { nutrient: { number: '1003' }, amount: 5 },
      ],
    });
    if (r.status !== 'ok') throw new Error('unexpected');
    // 2000 kJ / 4.184 = 478.01... -> 478.0 at 1 dp
    expect(r.nutritionPer100g.calories).toBe(478);
  });

  it('malformed when shape is wrong', () => {
    expect(normalizeFoodDetail(null).status).toBe('malformed');
    expect(normalizeFoodDetail({ description: 'x' }).status).toBe('malformed');
    expect(normalizeFoodDetail({ fdcId: 1, foodNutrients: 'not-array' }).status).toBe('malformed');
  });

  it('unusable_food when the shape is fine but no recognized nutrients', () => {
    const r = normalizeFoodDetail({ fdcId: 42, description: 'mystery', foodNutrients: [{ nutrient: { number: '9999' }, amount: 1 }] });
    expect(r).toEqual({ status: 'unusable_food', fdcId: 42, reason: 'no_recognized_nutrients' });
  });
});

describe('normalizeSearchResponse', () => {
  const raw = {
    foods: [
      { fdcId: 1, description: 'Chicken breast', dataType: 'SR Legacy' },
      { fdcId: 2, description: 'Chicken breast, grilled', dataType: 'Survey (FNDDS)' },
      { fdcId: 3, description: 'CHICKEN BREAST', dataType: 'Branded', brandOwner: 'Acme' },
    ],
  };

  it('returns candidates and flags exact (normalized) description matches', () => {
    const r = normalizeSearchResponse(raw, 'chicken breast');
    if (r.status !== 'ok') throw new Error('unexpected');
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates.filter((c) => c.isExactDescriptionMatch).map((c) => c.fdcId)).toEqual([1, 3]);
  });

  it('no_match on an empty foods array', () => {
    expect(normalizeSearchResponse({ foods: [] }, 'nothing')).toEqual({ status: 'no_match', candidates: [] });
  });

  it('malformed when foods is missing / wrong type', () => {
    expect(normalizeSearchResponse({}, 'x').status).toBe('malformed');
    expect(normalizeSearchResponse(null, 'x').status).toBe('malformed');
  });
});

describe('isDefensiblyVerified (documented rule; not auto-applied this phase)', () => {
  it('verified only when there is exactly ONE exact match from a whole-food data type', () => {
    const single = normalizeSearchResponse({ foods: [{ fdcId: 10, description: 'Butter, salted', dataType: 'Foundation' }] }, 'butter, salted');
    expect(isDefensiblyVerified(single)).toEqual({ verified: true, fdcId: 10 });
  });

  it('NOT verified when multiple exact matches, or the only exact match is Branded', () => {
    const branded = normalizeSearchResponse({ foods: [{ fdcId: 3, description: 'Chicken breast', dataType: 'Branded' }] }, 'chicken breast');
    expect(isDefensiblyVerified(branded)).toEqual({ verified: false, fdcId: null });

    const twoExact = normalizeSearchResponse(
      { foods: [
        { fdcId: 1, description: 'Milk', dataType: 'Foundation' },
        { fdcId: 2, description: 'Milk', dataType: 'SR Legacy' },
      ] },
      'milk',
    );
    expect(isDefensiblyVerified(twoExact)).toEqual({ verified: false, fdcId: null });
  });

  it('NOT verified for a no_match / malformed search', () => {
    expect(isDefensiblyVerified({ status: 'no_match', candidates: [] })).toEqual({ verified: false, fdcId: null });
  });
});
