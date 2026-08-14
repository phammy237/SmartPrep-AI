import { router } from 'expo-router';
import React from 'react';

import { Card, IngredientAvatar, ListRow, SectionHeader } from '@/components';
import { MealPlanEntry, Recipe } from '@/types';
import { formatRelativeDay } from '@/utils/format';

interface WeeklyPlanPreviewProps {
  items: MealPlanEntry[];
  recipesById: Record<string, Recipe>;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function WeeklyPlanPreview({ items, recipesById }: WeeklyPlanPreviewProps) {
  if (items.length === 0) return null;

  return (
    <>
      <SectionHeader title="This Week" actionLabel="View Plan" onActionPress={() => router.push('/(tabs)/plan')} />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        {items.map((item, index) => {
          const recipe = recipesById[item.recipeVersionId];
          if (!recipe) return null;
          return (
            <ListRow
              key={item.id}
              icon={<IngredientAvatar imageUri={recipe.imageUri} variant="compact" />}
              title={recipe.title}
              subtitle={`${formatRelativeDay(item.scheduledDate)} · ${capitalize(item.mealSlot)}`}
              isLast={index === items.length - 1}
            />
          );
        })}
      </Card>
    </>
  );
}
