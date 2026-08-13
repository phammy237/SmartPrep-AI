import { IngredientCategory, PantryItem } from '@/types';
import { freshnessSortWeight } from './freshness';

export type PantryStatusFilter = 'active' | 'depleted';
export type PantryCategoryFilter = IngredientCategory | 'all';
export type PantrySortOption = 'urgency' | 'name' | 'recentlyAdded';

/**
 * 'active' means "everything currently in the pantry" - matching the
 * historical UX where finishing/discarding an item made it disappear from
 * the list. Items with no `status` set (mock/scan-sourced, which predate
 * this field) are treated as active for backward compatibility.
 */
export function filterPantryItemsByStatus(items: PantryItem[], filter: PantryStatusFilter): PantryItem[] {
  return items.filter((item) => (item.status ?? 'active') === filter);
}

export function filterPantryItemsByCategory(items: PantryItem[], category: PantryCategoryFilter): PantryItem[] {
  if (category === 'all') return items;
  return items.filter((item) => item.category === category);
}

export function sortPantryItems(items: PantryItem[], sort: PantrySortOption): PantryItem[] {
  const copy = [...items];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'recentlyAdded':
      return copy.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    case 'urgency':
    default:
      return copy.sort(
        (a, b) =>
          freshnessSortWeight(a.freshness.label) - freshnessSortWeight(b.freshness.label) ||
          a.name.localeCompare(b.name),
      );
  }
}
