import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { EmptyState, FilterBar, FilterOption, LoadingState, Screen } from '@/components';
import { usePantry } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { IngredientCategory, PantryItem } from '@/types';
import { filterPantryItemsByCategory, filterPantryItemsByStatus, sortPantryItems } from '@/utils/pantryFilters';
import { PantryItemRow } from '../components/PantryItemRow';

type FilterValue = 'all' | 'use_soon' | 'depleted' | IngredientCategory;

const FILTERS: FilterOption<FilterValue>[] = [
  { value: 'all', label: 'All' },
  { value: 'use_soon', label: 'Use Soon' },
  { value: 'produce', label: 'Produce' },
  { value: 'protein', label: 'Protein' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'depleted', label: 'Depleted' },
];

function applyFilter(items: PantryItem[], filter: FilterValue): PantryItem[] {
  if (filter === 'depleted') {
    return filterPantryItemsByStatus(items, 'depleted');
  }
  const active = filterPantryItemsByStatus(items, 'active');
  if (filter === 'all') return active;
  if (filter === 'use_soon') return active.filter((item) => item.freshness.label === 'use_soon' || item.freshness.label === 'prioritize');
  return filterPantryItemsByCategory(active, filter);
}

export function PantryScreen() {
  const theme = useTheme();
  const pantryQuery = usePantry();
  const [filter, setFilter] = useState<FilterValue>('all');

  const filtered = sortPantryItems(applyFilter(pantryQuery.data ?? [], filter), 'urgency');

  return (
    <Screen header edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>Pantry</Text>
          <Pressable
            onPress={() => router.push('/pantry/add')}
            accessibilityRole="button"
            accessibilityLabel="Add pantry item"
            hitSlop={8}
            style={({ pressed }) => [
              {
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accent,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="add" size={22} color={theme.colors.textOnAccent} />
          </Pressable>
        </View>
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
              : 'Add an item manually or scan your kitchen to get started.'
          }
          actionLabel={pantryQuery.data && pantryQuery.data.length > 0 ? undefined : 'Add Item'}
          onActionPress={pantryQuery.data && pantryQuery.data.length > 0 ? undefined : () => router.push('/pantry/add')}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xxxl }}
          renderItem={({ item }) => <PantryItemRow item={item} onPress={() => router.push(`/pantry/${item.id}`)} />}
          refreshControl={
            <RefreshControl refreshing={pantryQuery.isRefetching} onRefresh={() => pantryQuery.refetch()} tintColor={theme.colors.accent} />
          }
        />
      )}
    </Screen>
  );
}
