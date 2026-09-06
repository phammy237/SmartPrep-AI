import { correctMealLogSchema, quickAddMealLogSchema, voidMealLogSchema } from '../mealLogSchemas';

const validNutrition = {
  calories: 400,
  proteinG: 20,
  carbsG: 40,
  fatG: 15,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  status: 'estimated' as const,
  calculationBasis: 'manual_entry' as const,
};

describe('quickAddMealLogSchema', () => {
  it('accepts a calories-only entry', () => {
    const result = quickAddMealLogSchema.safeParse({
      mealType: 'snack',
      nutrition: { ...validNutrition, proteinG: null, carbsG: null, fatG: null, status: 'incomplete' },
      idempotencyKey: 'abc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative nutrient values', () => {
    const result = quickAddMealLogSchema.safeParse({
      mealType: 'snack',
      nutrition: { ...validNutrition, calories: -100 },
      idempotencyKey: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing idempotency key', () => {
    const result = quickAddMealLogSchema.safeParse({ mealType: 'snack', nutrition: validNutrition, idempotencyKey: '' });
    expect(result.success).toBe(false);
  });
});

describe('voidMealLogSchema', () => {
  it('requires a non-empty reason', () => {
    expect(voidMealLogSchema.safeParse({ mealLogId: '11111111-1111-1111-1111-111111111111', reason: '' }).success).toBe(false);
    expect(voidMealLogSchema.safeParse({ mealLogId: '11111111-1111-1111-1111-111111111111', reason: 'wrong meal' }).success).toBe(true);
  });

  it('requires a valid uuid meal log id', () => {
    expect(voidMealLogSchema.safeParse({ mealLogId: 'not-a-uuid', reason: 'oops' }).success).toBe(false);
  });
});

describe('correctMealLogSchema', () => {
  const base = {
    mealLogId: '11111111-1111-1111-1111-111111111111',
    reason: 'wrong calories',
    newMealType: 'dinner' as const,
    newNutrition: validNutrition,
  };

  it('accepts a valid correction with optional servings and a corrected consumed time', () => {
    const result = correctMealLogSchema.safeParse({
      ...base,
      newServingsConsumed: 1.5,
      newConsumedAt: '2026-08-13T18:30:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing/empty reason - correction cannot proceed without one', () => {
    expect(correctMealLogSchema.safeParse({ ...base, reason: '' }).success).toBe(false);
  });

  it('rejects negative or non-finite nutrition values', () => {
    expect(correctMealLogSchema.safeParse({ ...base, newNutrition: { ...validNutrition, calories: -1 } }).success).toBe(false);
    expect(correctMealLogSchema.safeParse({ ...base, newNutrition: { ...validNutrition, calories: Infinity } }).success).toBe(false);
  });

  it('rejects a zero or negative corrected servings/grams amount', () => {
    expect(correctMealLogSchema.safeParse({ ...base, newServingsConsumed: 0 }).success).toBe(false);
    expect(correctMealLogSchema.safeParse({ ...base, newGramsConsumed: -50 }).success).toBe(false);
  });

  it('rejects a malformed consumed-time value', () => {
    expect(correctMealLogSchema.safeParse({ ...base, newConsumedAt: 'not a date' }).success).toBe(false);
  });

  it('rejects an invalid meal log id', () => {
    expect(correctMealLogSchema.safeParse({ ...base, mealLogId: 'nope' }).success).toBe(false);
  });
});
