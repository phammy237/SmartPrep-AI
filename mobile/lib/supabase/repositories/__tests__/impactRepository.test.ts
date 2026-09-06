import { supabase } from '../../client';
import { fetchKitchenImpactSummary } from '../impactRepository';

jest.mock('../../client', () => ({
  supabase: { rpc: jest.fn() },
}));

const rpc = supabase.rpc as jest.Mock;

const FULL_RESPONSE = {
  itemsAddedCount: 4,
  useEventCount: 9,
  itemsDiscardedCount: 3,
  cookingSessionsCount: 2,
  utilizationRate: 0.75,
  usedQuantitiesByUnit: [
    { unit: 'g', totalQuantity: 500, eventCount: 2 },
    { unit: 'item', totalQuantity: 3, eventCount: 3 },
  ],
  discardedQuantitiesByUnit: [{ unit: 'bag', totalQuantity: 1, eventCount: 1 }],
  hasActivity: true,
};

beforeEach(() => jest.clearAllMocks());

describe('fetchKitchenImpactSummary', () => {
  it('calls the RPC with local dates + timezone and maps the response', async () => {
    rpc.mockResolvedValue({ data: FULL_RESPONSE, error: null });

    const result = await fetchKitchenImpactSummary({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      timeZone: 'America/New_York',
    });

    expect(rpc).toHaveBeenCalledWith('get_kitchen_impact_summary', {
      p_start_date: '2026-09-01',
      p_end_date: '2026-09-30',
      p_timezone: 'America/New_York',
    });
    expect(result).toEqual({
      itemsAddedCount: 4,
      useEventCount: 9,
      itemsDiscardedCount: 3,
      cookingSessionsCount: 2,
      utilizationRate: 0.75,
      usedQuantitiesByUnit: [
        { unit: 'g', totalQuantity: 500, eventCount: 2 },
        { unit: 'item', totalQuantity: 3, eventCount: 3 },
      ],
      discardedQuantitiesByUnit: [{ unit: 'bag', totalQuantity: 1, eventCount: 1 }],
      hasActivity: true,
    });
  });

  it('passes null bounds through for an all-time query', async () => {
    rpc.mockResolvedValue({ data: { ...FULL_RESPONSE }, error: null });
    await fetchKitchenImpactSummary({ startDate: null, endDate: null, timeZone: 'UTC' });
    expect(rpc).toHaveBeenCalledWith('get_kitchen_impact_summary', {
      p_start_date: null,
      p_end_date: null,
      p_timezone: 'UTC',
    });
  });

  it('keeps utilizationRate null when unavailable (never coerces to 0)', async () => {
    rpc.mockResolvedValue({
      data: {
        itemsAddedCount: 0,
        useEventCount: 0,
        itemsDiscardedCount: 0,
        cookingSessionsCount: 0,
        utilizationRate: null,
        usedQuantitiesByUnit: [],
        discardedQuantitiesByUnit: [],
        hasActivity: false,
      },
      error: null,
    });

    const result = await fetchKitchenImpactSummary({ startDate: null, endDate: null, timeZone: 'UTC' });
    expect(result.utilizationRate).toBeNull();
    expect(result.hasActivity).toBe(false);
  });

  it('coerces stringified numbers (jsonb numeric) and defaults missing arrays', async () => {
    rpc.mockResolvedValue({
      data: {
        itemsAddedCount: '1',
        useEventCount: '2',
        itemsDiscardedCount: '1',
        cookingSessionsCount: '0',
        utilizationRate: '0.6667',
        hasActivity: true,
      },
      error: null,
    });

    const result = await fetchKitchenImpactSummary({ startDate: null, endDate: null, timeZone: 'UTC' });
    expect(result.useEventCount).toBe(2);
    expect(result.utilizationRate).toBeCloseTo(0.6667);
    expect(result.usedQuantitiesByUnit).toEqual([]);
    expect(result.discardedQuantitiesByUnit).toEqual([]);
  });

  it('propagates a Supabase error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('permission denied') });
    await expect(
      fetchKitchenImpactSummary({ startDate: null, endDate: null, timeZone: 'UTC' }),
    ).rejects.toThrow('permission denied');
  });

  it('throws when the RPC returns nothing usable', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(
      fetchKitchenImpactSummary({ startDate: null, endDate: null, timeZone: 'UTC' }),
    ).rejects.toThrow(/no summary/);
  });
});
