import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { EmptyState, LoadingState, Screen, SectionHeader } from '@/components';
import { RecipeCarousel } from '@/features/recipes/components/RecipeCarousel';
import {
  useKitchenImpact,
  useMealLogs,
  useMealPlanWeek,
  usePantry,
  useRecipeCollections,
  useRecipes,
  useUseSoonRecommendations,
  useUser,
} from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { countIngredientsNeedingAttention, getRecipeAvailability } from '@/services';
import { todayIsoDateInTimeZone } from '@/utils/expiration';
import { freshnessSortWeight } from '@/utils/freshness';
import { dailyNutritionTotal } from '@/utils/nutritionSnapshot';
import { GreetingHeader } from '../components/GreetingHeader';
import { ImpactSummaryCard } from '../components/ImpactSummaryCard';
import { NutritionCard } from '../components/NutritionCard';
import { ScanHeroCard } from '../components/ScanHeroCard';
import { TonightCard } from '../components/TonightCard';
import { UseFirstSection } from '../components/UseFirstSection';
import { UseSoonSection } from '../components/UseSoonSection';
import { WeeklyPlanPreview } from '../components/WeeklyPlanPreview';

export function HomeScreen() {
  const theme = useTheme();
  const userQuery = useUser();
  const pantryQuery = usePantry();
  const collectionsQuery = useRecipeCollections();
  const recipesQuery = useRecipes();
  const mealPlanQuery = useMealPlanWeek();
  const impactQuery = useKitchenImpact();
  const useSoonQuery = useUseSoonRecommendations();
  const timeZone = userQuery.data?.timezone ?? 'UTC';
  const today = todayIsoDateInTimeZone(timeZone);
  const mealLogsQuery = useMealLogs(today, today);

  const pantry = pantryQuery.data;
  const collections = collectionsQuery.data;
  const recipes = recipesQuery.data;

  const recipesById = useMemo(() => Object.fromEntries((recipes ?? []).map((r) => [r.id, r])), [recipes]);

  const useFirstItems = useMemo(
    () =>
      (pantry ?? [])
        .filter((item) => item.freshness.label === 'prioritize' || item.freshness.label === 'use_soon')
        .sort((a, b) => freshnessSortWeight(a.freshness.label) - freshnessSortWeight(b.freshness.label)),
    [pantry],
  );

  const tonightRecipe = useMemo(() => {
    const cookRightNow = collections?.find((c) => c.id === 'cook_right_now');
    return [...(cookRightNow?.recipes ?? []), ...(recipes ?? [])].sort(
      (a, b) => b.smartMatchScore - a.smartMatchScore,
    )[0];
  }, [collections, recipes]);

  const upcomingPlanItems = useMemo(
    () => (mealPlanQuery.data ?? []).filter((item) => item.mealSlot === 'dinner').slice(0, 4),
    [mealPlanQuery.data],
  );

  // Real consumed nutrition from today's meal_logs - never the meal plan
  // (planned meals must never count toward consumed calories/macros).
  const todaysNutritionTotal = useMemo(
    () =>
      dailyNutritionTotal(
        (mealLogsQuery.data ?? []).map((log) => ({
          localDate: log.localDate,
          nutritionSnapshot: log.nutritionSnapshot,
          voidedAt: log.voidedAt,
        })),
        today,
      ),
    [mealLogsQuery.data, today],
  );
  // NutritionCard expects always-known numbers; coalescing null->0 here is
  // safe because "no nutrition known yet today" and "0 consumed so far" read
  // the same on this small summary card - see NutritionProgressScreen for
  // the honest incomplete-aware rendering.
  const todaysNutrition = {
    calories: todaysNutritionTotal.calories ?? 0,
    proteinG: todaysNutritionTotal.proteinG ?? 0,
    carbsG: todaysNutritionTotal.carbsG ?? 0,
    fatG: todaysNutritionTotal.fatG ?? 0,
    fiberG: todaysNutritionTotal.fiberG ?? 0,
  };

  const isLoading =
    userQuery.isLoading || pantryQuery.isLoading || collectionsQuery.isLoading || recipesQuery.isLoading;
  const isError =
    userQuery.isError || pantryQuery.isError || collectionsQuery.isError || recipesQuery.isError;

  if (isLoading) {
    return (
      <Screen>
        <LoadingState fullscreen message="Loading your kitchen..." />
      </Screen>
    );
  }

  if (isError || !userQuery.data || !pantry || !collections || !recipes) {
    return (
      <Screen>
        <EmptyState
          title="Couldn't load Home"
          message="Something went wrong loading your kitchen. Please try again."
          actionLabel="Retry"
          onActionPress={() => {
            userQuery.refetch();
            pantryQuery.refetch();
            collectionsQuery.refetch();
            recipesQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const user = userQuery.data;
  const almostThere = collections.find((c) => c.id === 'almost_there');

  return (
    <Screen scroll header contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
      <GreetingHeader name={user.name} />

      <NutritionCard consumed={todaysNutrition} goals={user.preferences.nutritionGoals} onPress={() => router.push('/nutrition')} />

      <ScanHeroCard />

      <UseFirstSection items={useFirstItems} />

      <UseSoonSection
        recommendations={useSoonQuery.data ?? []}
        isLoading={useSoonQuery.isLoading}
        ready={!pantryQuery.isLoading}
      />

      {tonightRecipe ? (
        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader title="Tonight" />
          <TonightCard
            recipe={tonightRecipe}
            ownedCount={getRecipeAvailability(tonightRecipe).owned}
            needsAttentionCount={countIngredientsNeedingAttention(tonightRecipe, pantry)}
            onPress={() => router.push(`/recipes/${tonightRecipe.id}`)}
          />
        </View>
      ) : null}

      {almostThere && almostThere.recipes.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader title="Almost There" subtitle="You have most of what you need" />
          <RecipeCarousel
            recipes={almostThere.recipes}
            getSubtitle={(r) => {
              const { owned, total } = getRecipeAvailability(r);
              return `${owned}/${total} ingredients available`;
            }}
            onPressRecipe={(id) => router.push(`/recipes/${id}`)}
          />
        </View>
      ) : null}

      {mealPlanQuery.data ? (
        <View style={{ gap: theme.spacing.sm }}>
          <WeeklyPlanPreview items={upcomingPlanItems} recipesById={recipesById} />
        </View>
      ) : null}

      {impactQuery.data ? (
        <View style={{ gap: theme.spacing.sm }}>
          <ImpactSummaryCard impact={impactQuery.data} />
        </View>
      ) : null}

      {useFirstItems.length === 0 && !tonightRecipe ? (
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          Scan your kitchen to get started.
        </Text>
      ) : null}
    </Screen>
  );
}
