import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Button, ChipGroup, Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { useOnboardingStore } from '@/store';
import { DietaryPreference } from '@/types';
import { OnboardingProgress } from '../components/OnboardingProgress';

const OPTIONS: { value: DietaryPreference; label: string }[] = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'dairy_free', label: 'Dairy-free' },
  { value: 'none', label: 'None' },
];

export function DietaryScreen() {
  const theme = useTheme();
  const dietary = useOnboardingStore((s) => s.dietary);
  const toggleDietary = useOnboardingStore((s) => s.toggleDietary);

  return (
    <Screen scroll>
      <OnboardingProgress step={2} total={7} onBack={() => router.back()} />
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>
            Any dietary preferences?
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            Select all that apply. You can change this anytime.
          </Text>
        </View>
        <ChipGroup
          options={OPTIONS}
          selected={dietary}
          onToggle={(value) => toggleDietary(value as DietaryPreference)}
        />
        <Button label="Continue" onPress={() => router.push('/onboarding/allergies')} fullWidth />
      </View>
    </Screen>
  );
}
