import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, EmptyState, ListRow, LoadingState, Screen } from '@/components';
import {
  useAddMealPlanItem,
  useGenerateWeek,
  useMealPlan,
  useMoveMealPlanItem,
  useRecipes,
  useRemoveMealPlanItem,
  useReplaceMealPlanItem,
} from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { DayOfWeek, MealPlanItem, MealType } from '@/types';
import { formatRelativeDay } from '@/utils/format';
import { MoveMealModal } from '../components/MoveMealModal';
import { RecipePickerModal } from '../components/RecipePickerModal';
import { DAY_LABELS, DAY_ORDER } from '../constants';

interface PickerTarget {
  day: DayOfWeek;
  mealType: MealType;
  replaceItemId?: string;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PlannerScreen() {
  const theme = useTheme();
  const mealPlanQuery = useMealPlan();
  const recipesQuery = useRecipes();
  const generateWeek = useGenerateWeek();
  const addItem = useAddMealPlanItem();
  const replaceItem = useReplaceMealPlanItem();
  const removeItem = useRemoveMealPlanItem();
  const moveItem = useMoveMealPlanItem();

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MealPlanItem | null>(null);

  const recipesById = useMemo(
    () => Object.fromEntries((recipesQuery.data ?? []).map((r) => [r.id, r])),
    [recipesQuery.data],
  );

  const itemsByDay = useMemo(() => {
    const buckets: Record<DayOfWeek, MealPlanItem[]> = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    for (const item of mealPlanQuery.data?.items ?? []) {
      buckets[item.day].push(item);
    }
    return buckets;
  }, [mealPlanQuery.data]);

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
        <EmptyState
          icon="⚠️"
          title="Couldn't load your plan"
          actionLabel="Retry"
          onActionPress={() => mealPlanQuery.refetch()}
        />
      </Screen>
    );
  }

  const handleRowMenu = (item: MealPlanItem) => {
    const recipe = recipesById[item.recipeId];
    Alert.alert(recipe?.title ?? 'Meal', undefined, [
      { text: 'Replace', onPress: () => setPickerTarget({ day: item.day, mealType: item.mealType, replaceItemId: item.id }) },
      { text: 'Move', onPress: () => setMoveTarget(item) },
      { text: 'Remove', style: 'destructive', onPress: () => removeItem.mutate(item.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Screen scroll header edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
      <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>Plan</Text>

      <View style={{ gap: theme.spacing.sm }}>
        <Button label="Generate My Week" onPress={() => generateWeek.mutate()} loading={generateWeek.isPending} fullWidth />
        <Button label="View Grocery List" variant="secondary" onPress={() => router.push('/grocery')} fullWidth />
      </View>

      {DAY_ORDER.map((day) => {
        const dayItems = itemsByDay[day];
        const date = dayItems[0]?.date;
        return (
          <View key={day} style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
              {DAY_LABELS[day]}
              {date ? ` · ${formatRelativeDay(date)}` : ''}
            </Text>
            <Card padded={false} style={{ paddingHorizontal: theme.spacing.md }}>
              {dayItems.length === 0 ? (
                <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary, paddingVertical: theme.spacing.md }]}>
                  No meals planned
                </Text>
              ) : (
                dayItems.map((item, index) => {
                  const recipe = recipesById[item.recipeId];
                  return (
                    <ListRow
                      key={item.id}
                      title={recipe?.title ?? 'Recipe'}
                      subtitle={capitalize(item.mealType)}
                      isLast={index === dayItems.length - 1}
                      onPress={() => recipe && router.push(`/recipes/${recipe.id}`)}
                      right={
                        <Pressable
                          onPress={() => handleRowMenu(item)}
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
            <Button label="+ Add Meal" variant="ghost" onPress={() => setPickerTarget({ day, mealType: 'dinner' })} />
          </View>
        );
      })}

      <RecipePickerModal
        visible={!!pickerTarget}
        onClose={() => setPickerTarget(null)}
        onSelect={(recipeId) => {
          if (!pickerTarget) return;
          if (pickerTarget.replaceItemId) {
            replaceItem.mutate({ itemId: pickerTarget.replaceItemId, recipeId });
          } else {
            addItem.mutate({ day: pickerTarget.day, mealType: pickerTarget.mealType, recipeId });
          }
        }}
      />
      <MoveMealModal
        item={moveTarget}
        onClose={() => setMoveTarget(null)}
        onMove={(day, mealType) => {
          if (moveTarget) moveItem.mutate({ itemId: moveTarget.id, day, mealType });
        }}
      />
    </Screen>
  );
}
