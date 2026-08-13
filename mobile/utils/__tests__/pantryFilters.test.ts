import { PantryItem } from '@/types';
import { filterPantryItemsByCategory, filterPantryItemsByStatus, sortPantryItems } from '../pantryFilters';

function makeItem(overrides: Partial<PantryItem>): PantryItem {
  return {
    id: overrides.id ?? 'id',
    ingredientId: 'ing',
    name: overrides.name ?? 'Item',
    imageUri: '',
    category: overrides.category ?? 'other',
    quantity: 1,
    unit: 'item',
    freshness: overrides.freshness ?? { score: 80, confidence: 0.9, label: 'fresh' },
    addedAt: overrides.addedAt ?? '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    source: 'manual',
    status: overrides.status,
    ...overrides,
  };
}

describe('filterPantryItemsByStatus', () => {
  it('returns only active items for "active"', () => {
    const items = [makeItem({ id: '1', status: 'active' }), makeItem({ id: '2', status: 'depleted' })];
    expect(filterPantryItemsByStatus(items, 'active').map((i) => i.id)).toEqual(['1']);
  });

  it('returns only depleted items for "depleted"', () => {
    const items = [makeItem({ id: '1', status: 'active' }), makeItem({ id: '2', status: 'depleted' })];
    expect(filterPantryItemsByStatus(items, 'depleted').map((i) => i.id)).toEqual(['2']);
  });

  it('treats items with no status (mock/scan-sourced) as active', () => {
    const items = [makeItem({ id: '1', status: undefined })];
    expect(filterPantryItemsByStatus(items, 'active').map((i) => i.id)).toEqual(['1']);
    expect(filterPantryItemsByStatus(items, 'depleted')).toEqual([]);
  });
});

describe('filterPantryItemsByCategory', () => {
  it('returns everything for "all"', () => {
    const items = [makeItem({ id: '1', category: 'produce' }), makeItem({ id: '2', category: 'dairy' })];
    expect(filterPantryItemsByCategory(items, 'all')).toHaveLength(2);
  });

  it('filters to a specific category', () => {
    const items = [makeItem({ id: '1', category: 'produce' }), makeItem({ id: '2', category: 'dairy' })];
    expect(filterPantryItemsByCategory(items, 'dairy').map((i) => i.id)).toEqual(['2']);
  });
});

describe('sortPantryItems', () => {
  const items = [
    makeItem({ id: 'fresh', name: 'Zucchini', freshness: { score: 90, confidence: 0.9, label: 'fresh' } }),
    makeItem({ id: 'prioritize', name: 'Apple', freshness: { score: 10, confidence: 0.9, label: 'prioritize' } }),
    makeItem({ id: 'use_soon', name: 'Milk', freshness: { score: 50, confidence: 0.9, label: 'use_soon' } }),
  ];

  it('sorts by urgency first (prioritize, use_soon, cant_tell, fresh), then name', () => {
    expect(sortPantryItems(items, 'urgency').map((i) => i.id)).toEqual(['prioritize', 'use_soon', 'fresh']);
  });

  it('sorts alphabetically by name', () => {
    expect(sortPantryItems(items, 'name').map((i) => i.name)).toEqual(['Apple', 'Milk', 'Zucchini']);
  });

  it('sorts by most recently added first', () => {
    const withDates = [
      makeItem({ id: 'old', addedAt: '2026-01-01T00:00:00.000Z' }),
      makeItem({ id: 'new', addedAt: '2026-08-01T00:00:00.000Z' }),
    ];
    expect(sortPantryItems(withDates, 'recentlyAdded').map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('does not mutate the input array', () => {
    const original = [...items];
    sortPantryItems(items, 'name');
    expect(items).toEqual(original);
  });
});
