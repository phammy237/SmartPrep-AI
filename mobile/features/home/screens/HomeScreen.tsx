import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

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
import { isPantryItemNeedingAttention } from '@/utils/freshness';
import { dailyNutritionTotal } from '@/utils/nutritionSnapshot';
import { GreetingHeader } from '../components/GreetingHeader';
import { ImpactSummaryCard } from '../components/ImpactSummaryCard';
import { NutritionCard } from '../components/NutritionCard';
import { TonightCard } from '../components/TonightCard';
import { UseSoonSection } from '../components/UseSoonSection';
import { WeeklyPlanPreview } from '../components/WeeklyPlanPreview';

const SHORTCUTS: { label: string; icon: keyof typeof Ionicons.glyphMap; href: string }[] = [
  { label: 'Recipes', icon: 'book-outline', href: '/recipes' },
  { label: 'Grocery List', icon: 'cart-outline', href: '/grocery' },
  { label: 'Leftovers', icon: 'fast-food-outline', href: '/prepared-meals' },
];

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

  const attentionCount = useMemo(
    () => (pantry ?? []).filter((item) => isPantryItemNeedingAttention(item.freshness.label)).length,
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
  // Home renders on the core four queries only. Recommendations / plan / impact
  // are best-effort strips - a failure there must never break Home.
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

      {/* 1. Freshness / Use Soon - the headline "what to care about today" */}
      <UseSoonSection
        recommendations={useSoonQuery.data ?? []}
        isLoading={useSoonQuery.isLoading}
        ready={!pantryQuery.isLoading}
      />

      {attentionCount > 0 ? (
        <Pressable
          onPress={() => router.push('/pantry?filter=use_soon')}
          accessibilityRole="button"
          accessibilityLabel={`${attentionCount} pantry ingredients need attention`}
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              backgroundColor: theme.colors.freshness.useSoonMuted,
              borderRadius: theme.radius.md,
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
            },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Ionicons name="time-outline" size={18} color={theme.colors.freshness.useSoon} />
          <Text style={[theme.typography.footnote, { color: theme.colors.textPrimary, flex: 1 }]}>
            {attentionCount} pantry ingredient{attentionCount === 1 ? '' : 's'} need attention
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.freshness.useSoon} />
        </Pressable>
      ) : null}

      {/* 2. Today's meals */}
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

      {mealPlanQuery.data ? (
        <View style={{ gap: theme.spacing.sm }}>
          <WeeklyPlanPreview items={upcomingPlanItems} recipesById={recipesById} />
        </View>
      ) : null}

      {/* 3. Jump to the areas that don't have their own tab */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {SHORTCUTS.map((s) => (
          <Pressable
            key={s.href}
            onPress={() => router.push(s.href as never)}
            accessibilityRole="button"
            accessibilityLabel={s.label}
            style={({ pressed }) => [
              {
                flex: 1,
                alignItems: 'center',
                gap: 4,
                backgroundColor: theme.colors.backgroundElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                paddingVertical: theme.spacing.md,
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Ionicons name={s.icon} size={22} color={theme.colors.accent} />
            <Text style={[theme.typography.caption, { color: theme.colors.textPrimary }]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {almostThere && almostThere.recipes.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader
            title="Almost There"
            subtitle="You have most of what you need"
            actionLabel="All recipes"
            onActionPress={() => router.push('/recipes')}
          />
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

      {/* 4. Progress / activity - lower priority */}
      <NutritionCard consumed={todaysNutrition} goals={user.preferences.nutritionGoals} onPress={() => router.push('/nutrition')} />

      {impactQuery.data ? (
        <View style={{ gap: theme.spacing.sm }}>
          <ImpactSummaryCard impact={impactQuery.data} />
        </View>
      ) : null}

      {attentionCount === 0 && !tonightRecipe ? (
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          Add food to your pantry to get personalized meal ideas.
        </Text>
      ) : null}
    </Screen>
  );
}
