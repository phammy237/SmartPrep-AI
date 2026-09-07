import {
  RecommendationCandidate,
  UrgentIngredientDetail,
  rankRecommendations,
} from '../recommendationRanking';

const TODAY = '2026-06-10';

function urgent(over: Partial<UrgentIngredientDetail> = {}): UrgentIngredientDetail {
  return {
    ingredientId: 'ing-chicken-breast',
    name: 'chicken',
    expiryState: 'critical',
    expirationDate: '2026-06-11',
    daysUntilExpiry: 1,
    isUserConfirmedDate: true,
    quantityUtilized: 200,
    unit: 'g',
    quantityUnresolved: false,
    ...over,
  };
}

function candidate(over: Partial<RecommendationCandidate> = {}): RecommendationCandidate {
  return {
    recipeId: 'r1',
    recipeVersionId: 'rv-1',
    title: 'Recipe 1',
    imageUri: '',
    coveredCount: 4,
    totalCount: 4,
    missingIngredientCount: 0,
    urgentIngredients: [urgent()],
    ...over,
  };
}

function rank(cands: RecommendationCandidate[]) {
  return rankRecommendations(cands, { today: TODAY });
}

describe('rankRecommendations - urgency drives the score', () => {
  it('a recipe using a tomorrow-expiring (critical) ingredient outranks one using only use-soon stock', () => {
    const critical = candidate({ recipeVersionId: 'rv-crit', urgentIngredients: [urgent({ expiryState: 'critical' })] });
    const useSoon = candidate({
      recipeVersionId: 'rv-soon',
      urgentIngredients: [urgent({ expiryState: 'use_soon', daysUntilExpiry: 3 })],
    });
    const out = rank([useSoon, critical]);
    expect(out.map((r) => r.recipeVersionId)).toEqual(['rv-crit', 'rv-soon']);
    expect(out[0].rankScore).toBeGreaterThan(out[1].rankScore);
  });

  it('expired outranks critical outranks use_soon (state weight)', () => {
    const exp = candidate({ recipeVersionId: 'rv-exp', urgentIngredients: [urgent({ expiryState: 'expired', daysUntilExpiry: -2 })] });
    const crit = candidate({ recipeVersionId: 'rv-crit', urgentIngredients: [urgent({ expiryState: 'critical' })] });
    const soon = candidate({ recipeVersionId: 'rv-soon', urgentIngredients: [urgent({ expiryState: 'use_soon', daysUntilExpiry: 3 })] });
    expect(rank([soon, crit, exp]).map((r) => r.recipeVersionId)).toEqual(['rv-exp', 'rv-crit', 'rv-soon']);
  });

  it('more urgent ingredients raise the score', () => {
    const one = candidate({ recipeVersionId: 'rv-one', urgentIngredients: [urgent()] });
    const two = candidate({
      recipeVersionId: 'rv-two',
      urgentIngredients: [urgent(), urgent({ ingredientId: 'ing-spinach', name: 'spinach' })],
    });
    const out = rank([one, two]);
    expect(out[0].recipeVersionId).toBe('rv-two');
    expect(out[0].rankScore).toBeGreaterThan(out[1].rankScore);
  });
});

describe('rankRecommendations - coverage vs shortfall', () => {
  it('a fully-covered urgent recipe outranks a heavily-missing one with the same urgency', () => {
    const ready = candidate({ recipeVersionId: 'rv-ready', coveredCount: 5, totalCount: 5, missingIngredientCount: 0 });
    const missing = candidate({ recipeVersionId: 'rv-missing', coveredCount: 1, totalCount: 6, missingIngredientCount: 5 });
    const out = rank([missing, ready]);
    expect(out[0].recipeVersionId).toBe('rv-ready');
    expect(out[0].tier).toBe('ready_now');
    expect(out[1].tier).toBe('use_soon_match');
  });

  it('tiers: 0 missing = ready_now, 1-2 = almost_ready, 3+ = use_soon_match', () => {
    expect(rank([candidate({ missingIngredientCount: 0 })])[0].tier).toBe('ready_now');
    expect(rank([candidate({ missingIngredientCount: 1, coveredCount: 3, totalCount: 4 })])[0].tier).toBe('almost_ready');
    expect(rank([candidate({ missingIngredientCount: 2, coveredCount: 2, totalCount: 4 })])[0].tier).toBe('almost_ready');
    expect(rank([candidate({ missingIngredientCount: 4, coveredCount: 1, totalCount: 5 })])[0].tier).toBe('use_soon_match');
  });
});

describe('rankRecommendations - reasons', () => {
  it('carries fact-derived reasons, no raw score', () => {
    const [r] = rank([candidate({ missingIngredientCount: 0, urgentIngredients: [urgent({ daysUntilExpiry: 1 })] })]);
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toContain('uses_expiring_ingredient');
    expect(codes).toContain('ready_now');
    expect(r.reasons.find((x) => x.code === 'uses_expiring_ingredient')?.text).toBe('Uses chicken expiring tomorrow');
    expect(r.reasons.find((x) => x.code === 'ready_now')?.text).toBe('You have everything you need');
    expect(JSON.stringify(r.reasons)).not.toMatch(/rankScore|\d\.\d{2}/);
  });

  it('estimated dates get tentative language', () => {
    const [r] = rank([candidate({ urgentIngredients: [urgent({ isUserConfirmedDate: false, daysUntilExpiry: 1 })] })]);
    expect(r.reasons[0].text).toBe('Uses chicken estimated to expire tomorrow');
  });

  it('multiple use-soon ingredients add a summary reason', () => {
    const [r] = rank([
      candidate({
        urgentIngredients: [
          urgent({ expiryState: 'use_soon', daysUntilExpiry: 3 }),
          urgent({ ingredientId: 'ing-spinach', name: 'spinach', expiryState: 'use_soon', daysUntilExpiry: 3 }),
        ],
      }),
    ]);
    expect(r.reasons.find((x) => x.code === 'uses_multiple_use_soon')?.text).toBe(
      'Uses 2 ingredients that should be used soon',
    );
  });

  it('"only missing 1 ingredient" vs "missing N ingredients"', () => {
    expect(rank([candidate({ missingIngredientCount: 1, coveredCount: 3, totalCount: 4 })])[0].reasons.map((x) => x.text)).toContain(
      'Only missing 1 ingredient',
    );
    expect(rank([candidate({ missingIngredientCount: 3, coveredCount: 1, totalCount: 4 })])[0].reasons.map((x) => x.text)).toContain(
      'Missing 3 ingredients',
    );
  });

  it('flags an unresolved quantity relationship', () => {
    const [r] = rank([candidate({ urgentIngredients: [urgent({ quantityUnresolved: true, quantityUtilized: undefined, unit: undefined })] })]);
    expect(r.reasons.map((x) => x.code)).toContain('quantity_unresolved');
  });
});

describe('rankRecommendations - planner context', () => {
  it('already-planned-soon adds a bonus and a reason', () => {
    const planned = candidate({ recipeVersionId: 'rv-planned', plannedDate: '2026-06-12' });
    const notPlanned = candidate({ recipeVersionId: 'rv-free' });
    const out = rank([notPlanned, planned]);
    expect(out[0].recipeVersionId).toBe('rv-planned');
    expect(out[0].rankScore - out[1].rankScore).toBeCloseTo(1, 5); // PLANNED_BONUS
    expect(out[0].reasons.find((x) => x.code === 'already_planned')?.text).toBe('Already planned for Friday');
  });

  it('"planned too late" warning appears when the ingredient expires before the meal (advisory, no score change)', () => {
    const withWarn = candidate({
      recipeVersionId: 'rv-w',
      plannedDate: '2026-06-14',
      plannedAfterExpiryWarning: true,
      urgentIngredients: [urgent({ expirationDate: '2026-06-11', daysUntilExpiry: 1 })],
    });
    const withoutWarn = { ...withWarn, plannedAfterExpiryWarning: false };
    const [a] = rank([withWarn]);
    const [b] = rank([withoutWarn]);
    expect(a.reasons.map((x) => x.code)).toContain('planned_after_expiry');
    expect(a.reasons.find((x) => x.code === 'planned_after_expiry')?.text).toBe(
      'Chicken may need to be used before your Sunday meal',
    );
    expect(a.rankScore).toBe(b.rankScore);
  });
});

describe('rankRecommendations - determinism & filtering', () => {
  it('excludes candidates with no urgent ingredients (Use Soon is urgency-specific)', () => {
    const out = rank([candidate({ recipeVersionId: 'rv-x', urgentIngredients: [] })]);
    expect(out).toEqual([]);
  });

  it('is order-independent', () => {
    const a = candidate({ recipeVersionId: 'rv-a', urgentIngredients: [urgent({ expiryState: 'use_soon', daysUntilExpiry: 3 })], missingIngredientCount: 2, coveredCount: 2, totalCount: 4 });
    const b = candidate({ recipeVersionId: 'rv-b', urgentIngredients: [urgent({ expiryState: 'critical' })] });
    const c = candidate({ recipeVersionId: 'rv-c', urgentIngredients: [urgent({ expiryState: 'expired', daysUntilExpiry: -1 })], missingIngredientCount: 1, coveredCount: 3, totalCount: 4 });
    expect(rank([a, b, c]).map((r) => r.recipeVersionId)).toEqual(rank([c, a, b]).map((r) => r.recipeVersionId));
  });

  it('breaks exact ties by urgent count, then missing count, then recipeVersionId', () => {
    const base = { urgentIngredients: [urgent()], missingIngredientCount: 0, coveredCount: 4, totalCount: 4 };
    const p = candidate({ ...base, recipeVersionId: 'rv-zzz' });
    const q = candidate({ ...base, recipeVersionId: 'rv-aaa' });
    expect(rank([p, q]).map((r) => r.recipeVersionId)).toEqual(['rv-aaa', 'rv-zzz']);
  });
});
