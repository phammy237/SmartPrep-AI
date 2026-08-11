import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Button, Chip, Screen, Stepper } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { useOnboardingStore } from '@/store';
import { WeightGoalDirection } from '@/types';
import { computeMacroGoals } from '@/utils/nutrition';
import { OnboardingProgress } from '../components/OnboardingProgress';

const DIRECTION_OPTIONS: { value: WeightGoalDirection; label: string }[] = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain weight' },
];

const TIMEFRAME_OPTIONS = [
  { label: '4 weeks', weeks: 4 },
  { label: '8 weeks', weeks: 8 },
  { label: '12 weeks', weeks: 12 },
];

const MACRO_OPTIONS: { value: 'balanced' | 'low_carb' | 'high_protein'; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'low_carb', label: 'Low Carb' },
  { value: 'high_protein', label: 'High Protein' },
];

function weeksFromToday(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export function GoalsScreen() {
  const theme = useTheme();
  const weightGoalDirection = useOnboardingStore((s) => s.weightGoalDirection);
  const setWeightGoalDirection = useOnboardingStore((s) => s.setWeightGoalDirection);
  const weightGoalTargetLbs = useOnboardingStore((s) => s.weightGoalTargetLbs);
  const setWeightGoalTargetLbs = useOnboardingStore((s) => s.setWeightGoalTargetLbs);
  const weightGoalTargetDate = useOnboardingStore((s) => s.weightGoalTargetDate);
  const setWeightGoalTargetDate = useOnboardingStore((s) => s.setWeightGoalTargetDate);
  const dailyCalories = useOnboardingStore((s) => s.dailyCalories);
  const setDailyCalories = useOnboardingStore((s) => s.setDailyCalories);
  const macroPreference = useOnboardingStore((s) => s.macroPreference);
  const setMacroPreference = useOnboardingStore((s) => s.setMacroPreference);
  const weeklyGroceryBudget = useOnboardingStore((s) => s.weeklyGroceryBudget);
  const setWeeklyGroceryBudget = useOnboardingStore((s) => s.setWeeklyGroceryBudget);

  const macros = computeMacroGoals(dailyCalories, macroPreference);

  return (
    <Screen scroll>
      <OnboardingProgress step={6} total={7} onBack={() => router.back()} />
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Set your goals</Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            This helps us personalize recipes and daily targets. You can change this anytime.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Weight goal</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {DIRECTION_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={weightGoalDirection === option.value}
                onPress={() => setWeightGoalDirection(option.value)}
              />
            ))}
          </View>
          {weightGoalDirection !== 'maintain' ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}>Target pounds</Text>
                <Stepper
                  value={weightGoalTargetLbs}
                  onChange={setWeightGoalTargetLbs}
                  min={0}
                  max={100}
                  accessibilityLabel="target pounds"
                />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {TIMEFRAME_OPTIONS.map((option) => (
                  <Chip
                    key={option.label}
                    label={`In ${option.label}`}
                    selected={weightGoalTargetDate === weeksFromToday(option.weeks)}
                    onPress={() => setWeightGoalTargetDate(weeksFromToday(option.weeks))}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Daily calorie target</Text>
          <Stepper value={dailyCalories} onChange={setDailyCalories} min={1200} max={4000} step={50} accessibilityLabel="daily calories" />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Macro preference</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {MACRO_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={macroPreference === option.value}
                onPress={() => setMacroPreference(option.value)}
              />
            ))}
          </View>
          <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]}>
            ~{macros.proteinG}g protein · {macros.carbsG}g carbs · {macros.fatG}g fat · {macros.fiberG}g fiber
          </Text>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Weekly grocery budget</Text>
          <Stepper value={weeklyGroceryBudget} onChange={setWeeklyGroceryBudget} min={20} max={300} step={5} accessibilityLabel="weekly grocery budget" />
        </View>

        <Button label="Continue" onPress={() => router.push('/onboarding/priorities')} fullWidth />
      </View>
    </Screen>
  );
}
