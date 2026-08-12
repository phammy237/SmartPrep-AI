import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { EmptyState, FilterBar, FilterOption, LoadingState, Screen, SectionHeader } from '@/components';
import { useRecipeCollections, useRecipes } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { getRecipeAvailability } from '@/services';
import { RecipeCarousel } from '../components/RecipeCarousel';

type FilterValue = 'all' | 'quick' | 'high_protein' | 'low_carb';

const FILTERS: FilterOption<FilterValue>[] = [
  { value: 'all', label: 'All' },
  { value: 'quick', label: '<30 min' },
  { value: 'high_protein', label: 'High Protein' },
  { value: 'low_carb', label: 'Low Carb' },
];

export function RecipeDiscoveryScreen() {
  const theme = useTheme();
  const collectionsQuery = useRecipeCollections();
  const recipesQuery = useRecipes();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');

  const isFiltering = search.trim().length > 0 || filter !== 'all';

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (recipesQuery.data ?? []).filter((recipe) => {
      if (query && !recipe.title.toLowerCase().includes(query)) return false;
      if (filter === 'quick' && recipe.prepTimeMinutes + recipe.cookTimeMinutes >= 30) return false;
      if (filter === 'high_protein' && recipe.nutritionPerServing.proteinG < 20) return false;
      if (filter === 'low_carb' && recipe.nutritionPerServing.carbsG > 25) return false;
      return true;
    });
  }, [recipesQuery.data, search, filter]);

  return (
    <Screen scroll header edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
      <SectionHeader title="Recipes" />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: 12,
          backgroundColor: theme.colors.backgroundElevated,
        }}
      >
        <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search recipes"
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel="Search recipes"
          style={[theme.typography.body, { flex: 1, color: theme.colors.textPrimary, minHeight: 44 }]}
        />
      </View>

      <FilterBar options={FILTERS} selected={filter} onSelect={setFilter} />

      {collectionsQuery.isLoading || recipesQuery.isLoading ? (
        <LoadingState message="Finding recipes for you..." />
      ) : collectionsQuery.isError || recipesQuery.isError ? (
        <EmptyState
          title="Couldn't load recipes"
          actionLabel="Retry"
          onActionPress={() => {
            collectionsQuery.refetch();
            recipesQuery.refetch();
          }}
        />
      ) : isFiltering ? (
        filteredRecipes.length === 0 ? (
          <EmptyState title="No recipes match" message="Try a different search or filter." />
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title="Results" subtitle={`${filteredRecipes.length} recipe${filteredRecipes.length === 1 ? '' : 's'}`} />
            <RecipeCarousel
              recipes={filteredRecipes}
              getSubtitle={(r) => {
                const { owned, total } = getRecipeAvailability(r);
                return `${owned}/${total} ingredients`;
              }}
              onPressRecipe={(id) => router.push(`/recipes/${id}`)}
            />
          </View>
        )
      ) : (
        collectionsQuery.data
          ?.filter((collection) => collection.recipes.length > 0)
          .map((collection) => (
            <View key={collection.id} style={{ gap: theme.spacing.sm }}>
              <SectionHeader title={collection.title} />
              <RecipeCarousel
                recipes={collection.recipes}
                getSubtitle={(r) => {
                  const { owned, total } = getRecipeAvailability(r);
                  return `${owned}/${total} ingredients`;
                }}
                onPressRecipe={(id) => router.push(`/recipes/${id}`)}
              />
            </View>
          ))
      )}
    </Screen>
  );
}
