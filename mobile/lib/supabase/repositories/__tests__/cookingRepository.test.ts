import { DeductionInput } from '@/lib/validation/cookingSchemas';
import { supabase } from '../../client';
import { completeCookingEvent } from '../cookingRepository';

jest.mock('../../client', () => ({
  supabase: { rpc: jest.fn() },
}));

const rpc = supabase.rpc as jest.Mock;

const NUTRITION = { calories: 400, proteinG: 20, status: 'estimated' };

const COOKING_EVENT_ROW = {
  id: 'ce-1',
  user_id: 'user-1',
  recipe_version_id: 'rv-1',
  meal_plan_item_id: null,
  status: 'completed' as const,
  planned_servings: 2,
  actual_servings_prepared: 2,
  final_batch_weight_g: null,
  pantry_deduction_status: 'applied' as const,
  idempotency_key: 'k1',
  started_at: '2026-09-05T00:00:00.000Z',
  completed_at: '2026-09-05T00:10:00.000Z',
  created_at: '2026-09-05T00:00:00.000Z',
  updated_at: '2026-09-05T00:10:00.000Z',
};

const PREPARED_MEAL_ROW = {
  id: 'pm-1',
  user_id: 'user-1',
  cooking_event_id: 'ce-1',
  recipe_version_id: 'rv-1',
  total_servings_prepared: 2,
  servings_remaining: 1,
  total_batch_weight_g: null,
  remaining_batch_weight_g: null,
  nutrition_snapshot: NUTRITION,
  nutrition_per_serving: NUTRITION,
  nutrition_per_gram: null,
  prepared_at: '2026-09-05T00:10:00.000Z',
  storage_location: null,
  use_by_date: null,
  status: 'available' as const,
  created_at: '2026-09-05T00:10:00.000Z',
  updated_at: '2026-09-05T00:10:00.000Z',
};

function deductionIngredientRow(over: Partial<Record<string, unknown>>) {
  return {
    id: `cei-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    cooking_event_id: 'ce-1',
    recipe_ingredient_id: 'ri-chicken',
    pantry_item_id: null,
    requested_quantity: 0,
    requested_unit: 'g',
    deducted_quantity: 0,
    deducted_unit: null,
    estimated_grams: null,
    match_confidence: null,
    user_confirmed: false,
    was_skipped: false,
    pantry_event_id: null,
    created_at: '2026-09-05T00:10:00.000Z',
    ...over,
  };
}

/** Two lots satisfying ONE recipe ingredient (FEFO: urgent lot first, then the fresher one). */
const MULTI_LOT_DEDUCTIONS: DeductionInput[] = [
  {
    recipeIngredientId: 'ri-chicken',
    pantryItemId: 'lot-urgent',
    requestedQuantity: 300,
    requestedUnit: 'g',
    deductedQuantity: 200,
    deductedUnit: 'g',
    matchConfidence: 'exact',
    userConfirmed: true,
    wasSkipped: false,
  },
  {
    recipeIngredientId: 'ri-chicken',
    pantryItemId: 'lot-fresh',
    requestedQuantity: 0,
    requestedUnit: 'g',
    deductedQuantity: 100,
    deductedUnit: 'g',
    matchConfidence: 'exact',
    userConfirmed: true,
    wasSkipped: false,
  },
];

beforeEach(() => {
  rpc.mockReset();
});

describe('completeCookingEvent - multi-lot deduction payload', () => {
  it('sends every pantry-lot deduction for one recipe ingredient in a SINGLE atomic complete_cooking_event call', async () => {
    rpc.mockResolvedValue({
      data: {
        cookingEvent: COOKING_EVENT_ROW,
        preparedMeal: PREPARED_MEAL_ROW,
        mealLog: null,
        deductions: [
          deductionIngredientRow({ pantry_item_id: 'lot-urgent', deducted_quantity: 200, deducted_unit: 'g', requested_quantity: 300, user_confirmed: true }),
          deductionIngredientRow({ pantry_item_id: 'lot-fresh', deducted_quantity: 100, deducted_unit: 'g', requested_quantity: 0, user_confirmed: true }),
        ],
      },
      error: null,
    });

    const result = await completeCookingEvent({
      cookingEventId: 'ce-1',
      actualServingsPrepared: 2,
      deductions: MULTI_LOT_DEDUCTIONS,
      servingsConsumedNow: 1,
      mealType: 'dinner',
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpc.mock.calls[0];
    expect(fnName).toBe('complete_cooking_event');
    // Both lot deductions travel together in one payload -> one transaction, one idempotency-guarded event.
    expect(args.p_deductions).toHaveLength(2);
    expect(args.p_deductions.map((d: { pantryItemId: string }) => d.pantryItemId)).toEqual(['lot-urgent', 'lot-fresh']);
    // camelCase keys, nulls normalized (complete_cooking_event reads these exact keys back out).
    expect(args.p_deductions[0]).toEqual({
      recipeIngredientId: 'ri-chicken',
      pantryItemId: 'lot-urgent',
      requestedQuantity: 300,
      requestedUnit: 'g',
      deductedQuantity: 200,
      deductedUnit: 'g',
      estimatedGrams: null,
      matchConfidence: 'exact',
      userConfirmed: true,
      wasSkipped: false,
    });

    expect(result.deductions.map((d) => d.pantryItemId)).toEqual(['lot-urgent', 'lot-fresh']);
    expect(result.deductions.map((d) => d.deductedQuantity)).toEqual([200, 100]);
  });

  it('propagates a server rejection without partial local effects (stale stock / cross-user / already completed)', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('insufficient pantry stock for Chicken (have 150, need 200)') });
    await expect(
      completeCookingEvent({
        cookingEventId: 'ce-1',
        actualServingsPrepared: 2,
        deductions: MULTI_LOT_DEDUCTIONS,
        servingsConsumedNow: 0,
      }),
    ).rejects.toThrow('insufficient pantry stock');
  });

  it('a skipped ingredient still sends one row (null pantry item, zero deduction)', async () => {
    rpc.mockResolvedValue({
      data: { cookingEvent: COOKING_EVENT_ROW, preparedMeal: PREPARED_MEAL_ROW, mealLog: null, deductions: [deductionIngredientRow({ was_skipped: true })] },
      error: null,
    });
    await completeCookingEvent({
      cookingEventId: 'ce-1',
      actualServingsPrepared: 2,
      deductions: [
        { recipeIngredientId: 'ri-spice', deductedQuantity: 0, userConfirmed: false, wasSkipped: true },
      ],
      servingsConsumedNow: 0,
    });
    const args = rpc.mock.calls[0][1];
    expect(args.p_deductions[0]).toMatchObject({ recipeIngredientId: 'ri-spice', pantryItemId: null, deductedQuantity: 0, wasSkipped: true });
  });
});
