import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, EmptyState, ListRow, LoadingState, Screen } from '@/components';
import { useAddMealPlanEntry, useGenerateWeek, useMealPlanWeek, useRecipes, useRemoveMealPlanEntry, useUpdateMealPlanEntry } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { MealPlanEntry, MealType } from '@/types';
import { addDaysToIsoDate } from '@/utils/expiration';
import { formatRelativeDay } from '@/utils/format';
import { MoveMealModal } from '../components/MoveMealModal';
import { RecipePickerModal } from '../components/RecipePickerModal';
import { DAY_LABELS, DAY_ORDER, MEAL_TYPE_LABELS } from '../constants';

interface PickerTarget {
  date: string;
  mealSlot: MealType;
  replaceEntryId?: string;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PlannerScreen() {
  const theme = useTheme();
  const mealPlanQuery = useMealPlanWeek();
  const recipesQuery = useRecipes();
  const generateWeek = useGenerateWeek();
  const addEntry = useAddMealPlanEntry();
  const updateEntry = useUpdateMealPlanEntry();
  const removeEntry = useRemoveMealPlanEntry();

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MealPlanEntry | null>(null);

  const recipesById = useMemo(
    () => Object.fromEntries((recipesQuery.data ?? []).map((r) => [r.recipeVersionId ?? r.id, r])),
    [recipesQuery.data],
  );

  const weekDates = useMemo(
    () => DAY_ORDER.map((day, index) => ({ day, date: addDaysToIsoDate(mealPlanQuery.weekStart, index) })),
    [mealPlanQuery.weekStart],
  );

  const entriesByDate = useMemo(() => {
    const buckets: Record<string, MealPlanEntry[]> = {};
    for (const { date } of weekDates) buckets[date] = [];
    for (const entry of mealPlanQuery.data ?? []) {
      if (!buckets[entry.scheduledDate]) buckets[entry.scheduledDate] = [];
      buckets[entry.scheduledDate].push(entry);
    }
    return buckets;
  }, [mealPlanQuery.data, weekDates]);

  if (mealPlanQuery.isLoading || recipesQuery.isLoading) {
    return (
      <Screen>
        <LoadingState fullscreen message="Loading your plan..." />
      </Screen>
    );
  }

  if (!mealPlanQuery.data || !recipesQuery.data) {
    return (
      <Screen>
        <EmptyState title="Couldn't load your plan" actionLabel="Retry" onActionPress={() => mealPlanQuery.refetch()} />
      </Screen>
    );
  }

  const handleRowMenu = (entry: MealPlanEntry) => {
    const recipe = recipesById[entry.recipeVersionId];
    Alert.alert(recipe?.title ?? 'Meal', undefined, [
      {
        text: 'Replace',
        onPress: () => setPickerTarget({ date: entry.scheduledDate, mealSlot: entry.mealSlot, replaceEntryId: entry.id }),
      },
      { text: 'Move', onPress: () => setMoveTarget(entry) },
      { text: 'Cook Now', onPress: () => router.push(`/recipes/${entry.recipeVersionId}/cook?planItemId=${entry.id}`) },
      { text: 'Skip', onPress: () => updateEntry.mutate({ id: entry.id, patch: { status: 'skipped' } }) },
      { text: 'Remove', style: 'destructive', onPress: () => removeEntry.mutate(entry.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Screen scroll header edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
      <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>Plan</Text>
      <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
        Planned meals don't count toward your nutrition until you cook and log them.
      </Text>

      <View style={{ gap: theme.spacing.sm }}>
        <Button label="Generate My Week" onPress={() => generateWeek.mutate()} loading={generateWeek.isPending} fullWidth />
        <Button label="View Grocery List" variant="secondary" onPress={() => router.push('/grocery')} fullWidth />
      </View>

      {weekDates.map(({ day, date }) => {
        const dayEntries = entriesByDate[date] ?? [];
        return (
          <View key={day} style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
              {DAY_LABELS[day]} · {formatRelativeDay(date)}
            </Text>
            <Card padded={false} style={{ paddingHorizontal: theme.spacing.md }}>
              {dayEntries.length === 0 ? (
                <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary, paddingVertical: theme.spacing.md }]}>
                  No meals planned
                </Text>
              ) : (
                dayEntries.map((entry, index) => {
                  const recipe = recipesById[entry.recipeVersionId];
                  const subtitle = `${MEAL_TYPE_LABELS[entry.mealSlot]}${entry.status !== 'planned' ? ` · ${capitalize(entry.status)}` : ''}`;
                  return (
                    <ListRow
                      key={entry.id}
                      title={recipe?.title ?? 'Recipe'}
                      subtitle={subtitle}
                      isLast={index === dayEntries.length - 1}
                      onPress={() => recipe && router.push(`/recipes/${recipe.id}`)}
                      right={
                        <Pressable
                          onPress={() => handleRowMenu(entry)}
                          accessibilityRole="button"
                          accessibilityLabel="Meal options"
                          hitSlop={8}
                        >
                          <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textTertiary} />
                        </Pressable>
                      }
                    />
                  );
                })
              )}
            </Card>
            <Button label="+ Add Meal" variant="ghost" onPress={() => setPickerTarget({ date, mealSlot: 'dinner' })} />
          </View>
        );
      })}

      <RecipePickerModal
        visible={!!pickerTarget}
        onClose={() => setPickerTarget(null)}
        onSelect={(recipeId) => {
          if (!pickerTarget) return;
          if (pickerTarget.replaceEntryId) {
            updateEntry.mutate({ id: pickerTarget.replaceEntryId, patch: { recipeVersionId: recipeId } });
          } else {
            const recipe = recipesById[recipeId];
            addEntry.mutate({
              scheduledDate: pickerTarget.date,
              timezone: mealPlanQuery.timeZone,
              mealSlot: pickerTarget.mealSlot,
              recipeVersionId: recipeId,
              plannedServings: recipe?.servings ?? 1,
            });
          }
        }}
      />
      <MoveMealModal
        visible={!!moveTarget}
        currentDate={moveTarget?.scheduledDate}
        currentMealSlot={moveTarget?.mealSlot}
        weekDates={weekDates}
        onClose={() => setMoveTarget(null)}
        onMove={(scheduledDate, mealSlot) => {
          if (moveTarget) updateEntry.mutate({ id: moveTarget.id, patch: { scheduledDate, mealSlot } });
        }}
      />
    </Screen>
  );
}
