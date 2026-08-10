import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Button, ChipGroup, ChipOption, Screen, TagInput } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { useOnboardingStore } from '@/store';
import { OnboardingProgress } from '../components/OnboardingProgress';

const COMMON_ALLERGENS: ChipOption[] = [
  { value: 'Peanuts', label: 'Peanuts' },
  { value: 'Tree Nuts', label: 'Tree Nuts' },
  { value: 'Shellfish', label: 'Shellfish' },
  { value: 'Dairy', label: 'Dairy' },
  { value: 'Eggs', label: 'Eggs' },
  { value: 'Soy', label: 'Soy' },
  { value: 'Wheat', label: 'Wheat' },
  { value: 'Fish', label: 'Fish' },
  { value: 'Sesame', label: 'Sesame' },
];

export function AllergiesScreen() {
  const theme = useTheme();
  const allergies = useOnboardingStore((s) => s.allergies);
  const toggleListValue = useOnboardingStore((s) => s.toggleListValue);

  const customOptions: ChipOption[] = allergies
    .filter((a) => !COMMON_ALLERGENS.some((o) => o.value === a))
    .map((a) => ({ value: a, label: a }));
  const options = [...COMMON_ALLERGENS, ...customOptions];

  return (
    <Screen scroll>
      <OnboardingProgress step={3} total={6} onBack={() => router.back()} />
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>
            Any allergies we should know about?
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            We'll flag recipes that contain these.
          </Text>
        </View>
        <ChipGroup options={options} selected={allergies} onToggle={(v) => toggleListValue('allergies', v)} />
        <TagInput placeholder="Add another allergy" onAdd={(v) => toggleListValue('allergies', v)} />
        <Button label="Continue" onPress={() => router.push('/onboarding/food-preferences')} fullWidth />
      </View>
    </Screen>
  );
}
