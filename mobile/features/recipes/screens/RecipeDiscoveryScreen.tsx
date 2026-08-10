import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { EmptyState, LoadingState, Screen, SectionHeader } from '@/components';
import { useRecipeCollections } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { getRecipeAvailability } from '@/services';
import { RecipeCarousel } from '../components/RecipeCarousel';

export function RecipeDiscoveryScreen() {
  const theme = useTheme();
  const collectionsQuery = useRecipeCollections();

  return (
    <Screen scroll header edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
      <SectionHeader title="Recipes" />

      {collectionsQuery.isLoading ? (
        <LoadingState message="Finding recipes for you..." />
      ) : collectionsQuery.isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load recipes"
          actionLabel="Retry"
          onActionPress={() => collectionsQuery.refetch()}
        />
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
                  return `${owned}/${total} ingredients · ${r.smartMatchScore} Match`;
                }}
                onPressRecipe={(id) => router.push(`/recipes/${id}`)}
              />
            </View>
          ))
      )}
    </Screen>
  );
}
