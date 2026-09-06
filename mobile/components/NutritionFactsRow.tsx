import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/** Accepts either the legacy always-complete NutritionFacts or a nullable-fields NutritionSnapshot - unknown values render as "-", never as 0. */
interface NutritionFactsLike {
  calories: number | null | undefined;
  proteinG: number | null | undefined;
  carbsG: number | null | undefined;
  fatG: number | null | undefined;
  fiberG: number | null | undefined;
}

interface NutritionFactsRowProps {
  facts: NutritionFactsLike;
  servingLabel?: string;
  /** Shown next to the heading when nutrition isn't fully known, e.g. "estimated". */
  statusLabel?: string;
}

function display(value: number | null | undefined, suffix = ''): string {
  return value == null ? '–' : `${Math.round(value)}${suffix}`;
}

export function NutritionFactsRow({ facts, servingLabel, statusLabel }: NutritionFactsRowProps) {
  const theme = useTheme();
  const stats = [
    { label: 'kcal', value: display(facts.calories) },
    { label: 'Protein', value: display(facts.proteinG, 'g') },
    { label: 'Carbs', value: display(facts.carbsG, 'g') },
    { label: 'Fat', value: display(facts.fatG, 'g') },
    { label: 'Fiber', value: display(facts.fiberG, 'g') },
  ];

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {servingLabel ? (
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
          Nutrition ({servingLabel}){statusLabel ? ` · ${statusLabel}` : ''}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row' }}>
        {stats.map((stat) => (
          <View key={stat.label} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>{stat.value}</Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
