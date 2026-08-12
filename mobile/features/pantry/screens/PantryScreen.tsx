import { router } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { EmptyState, FilterBar, FilterOption, LoadingState, Screen } from '@/components';
import { usePantry } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { IngredientCategory, PantryItem } from '@/types';
import { freshnessSortWeight } from '@/utils/freshness';
import { PantryItemRow } from '../components/PantryItemRow';

type FilterValue = 'all' | 'use_soon' | IngredientCategory;

const FILTERS: FilterOption<FilterValue>[] = [
  { value: 'all', label: 'All' },
  { value: 'use_soon', label: 'Use Soon' },
  { value: 'produce', label: 'Produce' },
  { value: 'protein', label: 'Protein' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'frozen', label: 'Frozen' },
];

function matchesFilter(item: PantryItem, filter: FilterValue): boolean {
  if (filter === 'all') return true;
  if (filter === 'use_soon') return item.freshness.label === 'use_soon' || item.freshness.label === 'prioritize';
  return item.category === filter;
}

export function PantryScreen() {
  const theme = useTheme();
  const pantryQuery = usePantry();
  const [filter, setFilter] = useState<FilterValue>('all');

  const filtered = (pantryQuery.data ?? [])
    .filter((item) => matchesFilter(item, filter))
    .sort(
      (a, b) =>
        freshnessSortWeight(a.freshness.label) - freshnessSortWeight(b.freshness.label) ||
        a.name.localeCompare(b.name),
    );

  return (
    <Screen header edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.md }}>
        <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>Pantry</Text>
        <FilterBar options={FILTERS} selected={filter} onSelect={setFilter} />
      </View>

      {pantryQuery.isLoading ? (
        <LoadingState fullscreen message="Loading your pantry..." />
      ) : pantryQuery.isError ? (
        <EmptyState
          title="Couldn't load pantry"
          message="Something went wrong. Please try again."
          actionLabel="Retry"
          onActionPress={() => pantryQuery.refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={pantryQuery.data && pantryQuery.data.length > 0 ? 'No items in this filter' : 'Your pantry is empty'}
          message={
            pantryQuery.data && pantryQuery.data.length > 0
              ? 'Try a different category.'
              : 'Scan your kitchen to start building your pantry.'
          }
          actionLabel="Scan Kitchen"
          onActionPress={() => router.push('/scan')}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xxxl }}
          renderItem={({ item }) => <PantryItemRow item={item} onPress={() => router.push(`/pantry/${item.id}`)} />}
        />
      )}
    </Screen>
  );
}
