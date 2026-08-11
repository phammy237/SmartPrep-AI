import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, MacroBar, ProgressRing } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { NutritionFacts, NutritionGoals } from '@/types';
import { macroPercent } from '@/utils/nutrition';

interface NutritionCardProps {
  consumed: NutritionFacts;
  goals: NutritionGoals;
  onPress: () => void;
}

export function NutritionCard({ consumed, goals, onPress }: NutritionCardProps) {
  const theme = useTheme();
  const percent = Math.min(100, macroPercent(consumed.calories, goals.dailyCalories));
  const remaining = Math.max(0, Math.round(goals.dailyCalories - consumed.calories));

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Today's nutrition">
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ gap: 2 }}>
            <Text style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}>Today's plan</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>
                {Math.round(consumed.calories)}
              </Text>
              <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
                / {goals.dailyCalories} kcal
              </Text>
            </View>
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{remaining} kcal left</Text>
          </View>
          <ProgressRing progress={percent} size={64} strokeWidth={7}>
            <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>{percent}%</Text>
          </ProgressRing>
        </View>
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          <MacroBar label="Protein" value={consumed.proteinG} goal={goals.proteinG} />
          <MacroBar label="Carbs" value={consumed.carbsG} goal={goals.carbsG} color={theme.colors.freshness.useSoon} />
          <MacroBar label="Fat" value={consumed.fatG} goal={goals.fatG} color={theme.colors.secondary} />
        </View>
      </Card>
    </Pressable>
  );
}
