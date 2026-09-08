import {
  fetchOpenFoodFactsProduct,
  guessCategory,
  mapOpenFoodFactsProduct,
  parseQuantityText,
  toPantryUnit,
} from '../openFoodFacts';

const COMPLETE = {
  code: '3017620422003',
  product_name: 'Nutella',
  product_name_en: 'Nutella Hazelnut Spread',
  brands: 'Ferrero, Nutella',
  image_front_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.jpg',
  quantity: '400 g',
  product_quantity: 400,
  product_quantity_unit: 'g',
  serving_size: '15 g',
  serving_quantity: 15,
  ingredients_text: 'Sugar, palm oil, hazelnuts, cocoa',
  categories_tags: ['en:breakfasts', 'en:spreads'],
  nutriments: {
    'energy-kcal_100g': 539,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
    fiber_100g: 0,
    sugars_100g: 56.3,
    sodium_100g: 0.0428, // OFF stores sodium in GRAMS
  },
};

describe('mapOpenFoodFactsProduct', () => {
  it('maps a complete product into the provider-neutral candidate', () => {
    const c = mapOpenFoodFactsProduct(COMPLETE, '3017620422003');
    expect(c.productName).toBe('Nutella Hazelnut Spread'); // *_en wins
    expect(c.brand).toBe('Ferrero'); // first of the comma list
    expect(c.imageUrl).toMatch(/^https:\/\/images\.openfoodfacts\.org/);
    expect(c.packageQuantity).toBe(400);
    expect(c.packageUnit).toBe('g');
    expect(c.packageRawText).toBe('400 g');
    expect(c.ingredientsText).toContain('hazelnuts');
    expect(c.nutrition?.per100g.calories).toBe(539);
    expect(c.nutrition?.per100g.sodiumMg).toBeCloseTo(42.8, 2); // 0.0428 g -> mg
    expect(c.source).toBe('open_food_facts');
    expect(c.sourceProductId).toBe('3017620422003');
    expect(c.completeness).toEqual({ hasName: true, hasBrand: true, hasNutrition: true, hasPackageSize: true, hasImage: true });
  });

  it('keeps the SCANNED barcode as provenance even if the hit came from a variant', () => {
    const c = mapOpenFoodFactsProduct(COMPLETE, '036000291452');
    expect(c.barcode).toBe('036000291452');
  });

  it('missing image -> undefined, completeness.hasImage false', () => {
    const c = mapOpenFoodFactsProduct({ ...COMPLETE, image_front_url: undefined, image_url: undefined }, 'x');
    expect(c.imageUrl).toBeUndefined();
    expect(c.completeness.hasImage).toBe(false);
  });

  it('non-https image is dropped', () => {
    const c = mapOpenFoodFactsProduct({ ...COMPLETE, image_front_url: 'http://insecure/img.jpg', image_url: undefined }, 'x');
    expect(c.imageUrl).toBeUndefined();
  });

  it('missing brand -> undefined', () => {
    const c = mapOpenFoodFactsProduct({ ...COMPLETE, brands: '' }, 'x');
    expect(c.brand).toBeUndefined();
    expect(c.completeness.hasBrand).toBe(false);
  });

  it('missing package size -> undefined, degrades gracefully', () => {
    const c = mapOpenFoodFactsProduct({ ...COMPLETE, quantity: undefined, product_quantity: undefined, product_quantity_unit: undefined }, 'x');
    expect(c.packageQuantity).toBeUndefined();
    expect(c.packageUnit).toBeUndefined();
    expect(c.completeness.hasPackageSize).toBe(false);
  });

  it('missing nutrition -> nutrition undefined, not a fabricated zero snapshot', () => {
    const c = mapOpenFoodFactsProduct({ ...COMPLETE, nutriments: undefined }, 'x');
    expect(c.nutrition).toBeUndefined();
    expect(c.completeness.hasNutrition).toBe(false);
  });

  it('a package unit Pantry does not support is dropped (raw text kept for the user)', () => {
    const c = mapOpenFoodFactsProduct(
      { ...COMPLETE, quantity: '5 cl', product_quantity: 5, product_quantity_unit: 'cl' },
      'x',
    );
    expect(c.packageUnit).toBeUndefined();
    expect(c.packageRawText).toBe('5 cl');
    expect(c.completeness.hasPackageSize).toBe(false);
  });

  it('no usable name -> empty name flagged incomplete (review will require one)', () => {
    const c = mapOpenFoodFactsProduct({ code: 'x' }, 'x');
    expect(c.productName).toBe('');
    expect(c.completeness.hasName).toBe(false);
  });

  it('derives sodium from salt only when sodium is absent (exact factor, not a guess)', () => {
    const c = mapOpenFoodFactsProduct(
      { ...COMPLETE, nutriments: { salt_100g: 1 } },
      'x',
    );
    expect(c.nutrition?.per100g.sodiumMg).toBeCloseTo(393.4, 1);
  });
});

describe('parseQuantityText / toPantryUnit / guessCategory', () => {
  it('parses common package strings', () => {
    expect(parseQuantityText('500 g')).toEqual({ quantity: 500, unit: 'g' });
    expect(parseQuantityText('1,5 L')).toEqual({ quantity: 1.5, unit: 'L' });
    expect(parseQuantityText('16 oz')).toEqual({ quantity: 16, unit: 'oz' });
    expect(parseQuantityText('NET WT 12 OZ')).toEqual({ quantity: 12, unit: 'oz' });
  });

  it('leaves the unit undefined when it is not a supported pantry unit', () => {
    expect(parseQuantityText('5 cl').unit).toBeUndefined();
  });

  it('maps l -> L and rejects unsupported units', () => {
    expect(toPantryUnit('l')).toBe('L');
    expect(toPantryUnit('KG')).toBe('kg');
    expect(toPantryUnit('cl')).toBeUndefined();
    expect(toPantryUnit(undefined)).toBeUndefined();
  });

  it('guesses a coarse category conservatively, defaulting to other', () => {
    expect(guessCategory(['en:yogurts', 'en:dairies'])).toBe('dairy');
    expect(guessCategory(['en:frozen-foods'])).toBe('frozen');
    expect(guessCategory(['en:snacks'])).toBe('pantry');
    expect(guessCategory(['en:unknowns'])).toBe('other');
    expect(guessCategory(undefined)).toBe('other');
  });
});

function fakeResponse(status: number, body: unknown, jsonThrows = false): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (jsonThrows) throw new Error('bad json');
      return body;
    },
  } as unknown as Response;
}

describe('fetchOpenFoodFactsProduct', () => {
  it('returns a found result and sends a descriptive User-Agent, no Authorization, no key in the URL', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse(200, { status: 1, product: COMPLETE }));
    const result = await fetchOpenFoodFactsProduct('3017620422003', '3017620422003', { fetchImpl });
    expect(result.status).toBe('found');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/api/v2/product/3017620422003.json');
    expect(url).not.toMatch(/api_key|apikey|secret|token|password/i);
    expect(init.headers['User-Agent']).toMatch(/SmartPrep/);
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('status:0 -> not_found', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse(200, { status: 0 }));
    expect((await fetchOpenFoodFactsProduct('x', 'x', { fetchImpl })).status).toBe('not_found');
  });

  it('HTTP 404 -> not_found', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse(404, {}));
    expect((await fetchOpenFoodFactsProduct('x', 'x', { fetchImpl })).status).toBe('not_found');
  });

  it('HTTP 429 -> error rate_limited', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse(429, {}));
    expect(await fetchOpenFoodFactsProduct('x', 'x', { fetchImpl })).toEqual({ status: 'error', reason: 'rate_limited', barcode: 'x' });
  });

  it('HTTP 5xx -> error provider_unavailable', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse(503, {}));
    expect(await fetchOpenFoodFactsProduct('x', 'x', { fetchImpl })).toEqual({ status: 'error', reason: 'provider_unavailable', barcode: 'x' });
  });

  it('a network throw -> error offline', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('Network request failed'));
    expect(await fetchOpenFoodFactsProduct('x', 'x', { fetchImpl })).toEqual({ status: 'error', reason: 'offline', barcode: 'x' });
  });

  it('a malformed body -> error malformed_response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse(200, null, true));
    expect(await fetchOpenFoodFactsProduct('x', 'x', { fetchImpl })).toEqual({ status: 'error', reason: 'malformed_response', barcode: 'x' });
  });
});
