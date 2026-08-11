import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { NutritionFacts } from '@/types';

interface NutritionFactsRowProps {
  facts: NutritionFacts;
  servingLabel?: string;
}

export function NutritionFactsRow({ facts, servingLabel }: NutritionFactsRowProps) {
  const theme = useTheme();
  const stats = [
    { label: 'kcal', value: String(Math.round(facts.calories)) },
    { label: 'Protein', value: `${Math.round(facts.proteinG)}g` },
    { label: 'Carbs', value: `${Math.round(facts.carbsG)}g` },
    { label: 'Fat', value: `${Math.round(facts.fatG)}g` },
    { label: 'Fiber', value: `${Math.round(facts.fiberG)}g` },
  ];

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {servingLabel ? (
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Nutrition ({servingLabel})</Text>
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
