import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BarChart, Card, Chip, EmptyState, LoadingState, MacroBar, ProgressRing, Screen } from '@/components';
import { DAY_LABELS, DAY_ORDER } from '@/features/planner/constants';
import { useKitchenImpact, useMealPlan, useRecipes, useUser } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { DayOfWeek, NutritionFacts } from '@/types';
import { currentWeekday } from '@/utils/date';
import { formatNumber } from '@/utils/format';
import { macroPercent, NutritionPeriod as Period, scopeNutritionForPeriod, sumNutrition } from '@/utils/nutrition';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export function NutritionProgressScreen() {
  const theme = useTheme();
  const userQuery = useUser();
  const mealPlanQuery = useMealPlan();
  const recipesQuery = useRecipes();
  const impactQuery = useKitchenImpact();
  const [period, setPeriod] = useState<Period>('week');

  const recipesById = useMemo(
    () => Object.fromEntries((recipesQuery.data ?? []).map((r) => [r.id, r])),
    [recipesQuery.data],
  );

  const dayTotals = useMemo(() => {
    const itemsByDay = {} as Record<DayOfWeek, NutritionFacts[]>;
    for (const day of DAY_ORDER) itemsByDay[day] = [];
    for (const item of mealPlanQuery.data?.items ?? []) {
      const facts = recipesById[item.recipeId]?.nutritionPerServing;
      if (facts) itemsByDay[item.day].push(facts);
    }
    const totals = {} as Record<DayOfWeek, NutritionFacts>;
    for (const day of DAY_ORDER) totals[day] = sumNutrition(itemsByDay[day]);
    return totals;
  }, [mealPlanQuery.data, recipesById]);

  const weeklyTotals = useMemo(() => sumNutrition(DAY_ORDER.map((day) => dayTotals[day])), [dayTotals]);

  const today = currentWeekday();

  const chartData = useMemo(
    () =>
      DAY_ORDER.map((day) => ({
        label: DAY_LABELS[day].slice(0, 3),
        value: dayTotals[day].calories,
        highlighted: day === today,
      })),
    [dayTotals, today],
  );

  const goals = userQuery.data?.preferences.nutritionGoals;

  const scoped = useMemo(() => {
    if (!goals) return null;
    return scopeNutritionForPeriod(period, dayTotals[today], weeklyTotals, goals);
  }, [dayTotals, today, weeklyTotals, goals, period]);

  const isLoading = userQuery.isLoading || mealPlanQuery.isLoading || recipesQuery.isLoading;

  if (isLoading) {
    return (
      <Screen>
        <LoadingState fullscreen message="Loading your nutrition..." />
      </Screen>
    );
  }

  if (!userQuery.data || !goals || !scoped) {
    return (
      <Screen>
        <EmptyState title="Couldn't load nutrition" actionLabel="Retry" onActionPress={() => userQuery.refetch()} />
      </Screen>
    );
  }

  const percent = Math.min(100, macroPercent(scoped.consumed.calories, scoped.goal.dailyCalories));

  return (
    <Screen scroll edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Nutrition & Progress</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PERIODS.map((option) => (
          <Chip key={option.value} label={option.label} selected={period === option.value} onPress={() => setPeriod(option.value)} />
        ))}
      </View>

      <Card>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <ProgressRing progress={percent} size={96} strokeWidth={9}>
            <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>{percent}%</Text>
          </ProgressRing>
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            {formatNumber(Math.round(scoped.consumed.calories))} of {formatNumber(Math.round(scoped.goal.dailyCalories))} kcal
          </Text>
        </View>
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
          <MacroBar label="Protein" value={scoped.consumed.proteinG} goal={scoped.goal.proteinG} />
          <MacroBar label="Carbs" value={scoped.consumed.carbsG} goal={scoped.goal.carbsG} color={theme.colors.freshness.useSoon} />
          <MacroBar label="Fat" value={scoped.consumed.fatG} goal={scoped.goal.fatG} color={theme.colors.secondary} />
        </View>
      </Card>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Weekly trend (kcal)</Text>
        <Card>
          <BarChart data={chartData} goal={goals.dailyCalories} />
        </Card>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Ionicons name="flame" size={22} color={theme.colors.freshness.useSoon} />
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>
            {impactQuery.data?.cookingStreakDays ?? 0}
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Day streak</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Ionicons name="leaf" size={22} color={theme.colors.accent} />
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>
            {impactQuery.data?.estimatedFoodSavedLbs ?? 0} lbs
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Estimated food saved</Text>
        </Card>
      </View>
    </Screen>
  );
}
