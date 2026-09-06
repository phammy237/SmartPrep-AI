import { supabase } from '@/lib/supabase/client';
import * as repositories from '@/lib/supabase/repositories';
import { KitchenImpactSummary } from '@/types';
import { impactService } from '../impactService';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('@/lib/supabase/repositories', () => ({
  fetchKitchenImpactSummary: jest.fn(),
}));

const fetchSummary = repositories.fetchKitchenImpactSummary as jest.Mock;
const getUser = supabase.auth.getUser as jest.Mock;

function summary(overrides: Partial<KitchenImpactSummary> = {}): KitchenImpactSummary {
  return {
    itemsAddedCount: 4,
    useEventCount: 9,
    itemsDiscardedCount: 3,
    cookingSessionsCount: 2,
    utilizationRate: 0.75,
    usedQuantitiesByUnit: [{ unit: 'g', totalQuantity: 500, eventCount: 2 }],
    discardedQuantitiesByUnit: [],
    hasActivity: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  fetchSummary.mockResolvedValue(summary());
});

describe('getKitchenImpact - auth / failure handling', () => {
  it('throws before any query when there is no session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(impactService.getKitchenImpact()).rejects.toThrow('Not signed in');
    expect(fetchSummary).not.toHaveBeenCalled();
  });

  it('propagates a Supabase failure (no mock fallback)', async () => {
    fetchSummary.mockRejectedValue(new Error('rpc exploded'));
    await expect(impactService.getKitchenImpact()).rejects.toThrow('rpc exploded');
  });

  it('MOCK_KITCHEN_IMPACT no longer exists in the data barrel', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data = require('@/data') as Record<string, unknown>;
    expect(data.MOCK_KITCHEN_IMPACT).toBeUndefined();
  });
});

describe('getKitchenImpact - range resolution', () => {
  it('defaults to the month range and forwards it to the repository', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T12:00:00Z'));
    await impactService.getKitchenImpact({ timeZone: 'UTC' });
    expect(fetchSummary).toHaveBeenCalledWith({ startDate: '2026-09-01', endDate: '2026-09-30', timeZone: 'UTC' });
    jest.useRealTimers();
  });

  it('week period forwards a Monday-Sunday range', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T12:00:00Z'));
    await impactService.getKitchenImpact({ period: 'week', timeZone: 'UTC' });
    expect(fetchSummary).toHaveBeenCalledWith({ startDate: '2026-09-07', endDate: '2026-09-13', timeZone: 'UTC' });
    jest.useRealTimers();
  });

  it('all period forwards unbounded null dates', async () => {
    await impactService.getKitchenImpact({ period: 'all', timeZone: 'UTC' });
    expect(fetchSummary).toHaveBeenCalledWith({ startDate: null, endDate: null, timeZone: 'UTC' });
  });

  it('passes the caller timezone straight through (server applies it)', async () => {
    await impactService.getKitchenImpact({ period: 'all', timeZone: 'America/New_York' });
    expect(fetchSummary).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'America/New_York' }));
  });
});

describe('getKitchenImpact - result shape / no client-side aggregation', () => {
  it('returns the repo summary verbatim plus range/label context', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T12:00:00Z'));
    const result = await impactService.getKitchenImpact({ period: 'month', timeZone: 'UTC' });
    expect(result).toEqual({
      ...summary(),
      period: 'month',
      rangeLabel: 'This month',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      timezone: 'UTC',
    });
    jest.useRealTimers();
  });

  it('never folds cookingSessionsCount into useEventCount (or otherwise recomputes counts)', async () => {
    fetchSummary.mockResolvedValue(summary({ useEventCount: 7, cookingSessionsCount: 2, itemsDiscardedCount: 1 }));
    const result = await impactService.getKitchenImpact({ period: 'all', timeZone: 'UTC' });
    expect(result.useEventCount).toBe(7);
    expect(result.cookingSessionsCount).toBe(2);
    expect(result.itemsDiscardedCount).toBe(1);
  });

  it('surfaces an honest empty summary without inventing values', async () => {
    fetchSummary.mockResolvedValue(
      summary({
        itemsAddedCount: 0,
        useEventCount: 0,
        itemsDiscardedCount: 0,
        cookingSessionsCount: 0,
        utilizationRate: null,
        usedQuantitiesByUnit: [],
        discardedQuantitiesByUnit: [],
        hasActivity: false,
      }),
    );
    const result = await impactService.getKitchenImpact({ period: 'all', timeZone: 'UTC' });
    expect(result.hasActivity).toBe(false);
    expect(result.utilizationRate).toBeNull();
  });

  it('keeps incompatible units as separate grouped entries', async () => {
    fetchSummary.mockResolvedValue(
      summary({
        usedQuantitiesByUnit: [
          { unit: 'g', totalQuantity: 500, eventCount: 1 },
          { unit: 'item', totalQuantity: 3, eventCount: 3 },
          { unit: 'bag', totalQuantity: 2, eventCount: 2 },
        ],
      }),
    );
    const result = await impactService.getKitchenImpact({ period: 'all', timeZone: 'UTC' });
    expect(result.usedQuantitiesByUnit.map((u) => u.unit)).toEqual(['g', 'item', 'bag']);
    // no combined total field exists on the type
    expect(result).not.toHaveProperty('totalQuantityUsed');
  });
});
