import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';

import { Button, Card, Chip, EmptyState, LoadingState, Screen, Stepper } from '@/components';
import { useLogPreparedMealConsumption, usePreparedMeals } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { MealType } from '@/types';
import { generateId } from '@/utils/id';
import { validatePreparedMealConsumption } from '@/utils/nutritionSnapshot';

const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

/**
 * Minimal prepared-food inventory: remaining servings from a cooking event
 * that weren't eaten immediately. Stays reachable after leaving the cooking
 * flow (linked from Nutrition & Progress) so leftovers aren't stranded.
 */
export function PreparedMealsScreen() {
  const theme = useTheme();
  const preparedMealsQuery = usePreparedMeals('available');
  const logConsumption = useLogPreparedMealConsumption();
  const [servingsByMeal, setServingsByMeal] = useState<Record<string, number>>({});
  const [mealTypeByMeal, setMealTypeByMeal] = useState<Record<string, MealType>>({});

  if (preparedMealsQuery.isLoading) {
    return (
      <Screen>
        <LoadingState fullscreen message="Loading leftovers..." />
      </Screen>
    );
  }

  if (preparedMealsQuery.isError) {
    return (
      <Screen>
        <EmptyState title="Couldn't load leftovers" actionLabel="Retry" onActionPress={() => preparedMealsQuery.refetch()} />
      </Screen>
    );
  }

  const meals = preparedMealsQuery.data ?? [];

  const handleLog = (mealId: string, remaining: number) => {
    const servings = servingsByMeal[mealId] ?? Math.min(1, remaining);
    const validation = validatePreparedMealConsumption(remaining, servings);
    if (!validation.ok) {
      Alert.alert('Cannot log', validation.reason);
      return;
    }
    logConsumption.mutate({
      preparedMealId: mealId,
      servingsConsumed: servings,
      mealType: mealTypeByMeal[mealId] ?? 'dinner',
      idempotencyKey: generateId('prepared-log'),
    });
  };

  return (
    <Screen scroll header edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
      <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>Leftovers</Text>

      {meals.length === 0 ? (
        <EmptyState
          title="No leftovers right now"
          message="Servings you don't eat right after cooking show up here so you can log them later."
          actionLabel="Back to Nutrition"
          onActionPress={() => router.back()}
        />
      ) : (
        meals.map((meal) => {
          const servings = servingsByMeal[meal.id] ?? Math.min(1, meal.servingsRemaining);
          const mealType = mealTypeByMeal[meal.id] ?? 'dinner';
          return (
            <Card key={meal.id} style={{ gap: theme.spacing.sm }}>
              <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
                {meal.servingsRemaining} serving{meal.servingsRemaining === 1 ? '' : 's'} remaining
              </Text>
              {meal.nutritionPerServing.calories != null ? (
                <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
                  ~{Math.round(meal.nutritionPerServing.calories)} kcal / serving
                  {meal.nutritionPerServing.status !== 'verified' ? ` (${meal.nutritionPerServing.status})` : ''}
                </Text>
              ) : null}

              <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>Log a serving</Text>
              <Stepper
                value={servings}
                onChange={(value) => setServingsByMeal((state) => ({ ...state, [meal.id]: value }))}
                min={0.5}
                max={meal.servingsRemaining}
                step={0.5}
                accessibilityLabel="servings to log"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {MEAL_TYPE_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={mealType === option.value}
                    onPress={() => setMealTypeByMeal((state) => ({ ...state, [meal.id]: option.value }))}
                  />
                ))}
              </ScrollView>
              <Button
                label="Log Serving"
                onPress={() => handleLog(meal.id, meal.servingsRemaining)}
                loading={logConsumption.isPending}
                fullWidth
              />
            </Card>
          );
        })
      )}
    </Screen>
  );
}
