import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Button, Chip, ConfidenceSelector, Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { useOnboardingStore } from '@/store';
import { CookingTimePreference } from '@/types';
import { OnboardingProgress } from '../components/OnboardingProgress';

const TIME_OPTIONS: { value: CookingTimePreference; label: string }[] = [
  { value: 'under_15', label: 'Under 15 min' },
  { value: '15_30', label: '15-30 min' },
  { value: '30_60', label: '30-60 min' },
  { value: 'no_preference', label: "Doesn't matter" },
];

export function CookingProfileScreen() {
  const theme = useTheme();
  const cookingTime = useOnboardingStore((s) => s.cookingTime);
  const setCookingTime = useOnboardingStore((s) => s.setCookingTime);
  const cookingConfidence = useOnboardingStore((s) => s.cookingConfidence);
  const setCookingConfidence = useOnboardingStore((s) => s.setCookingConfidence);

  return (
    <Screen scroll>
      <OnboardingProgress step={5} total={7} onBack={() => router.back()} />
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>
            Tell us about your cooking style.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
            How much time do you usually have?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {TIME_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={cookingTime === option.value}
                onPress={() => setCookingTime(option.value)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
            How confident are you in the kitchen?
          </Text>
          <ConfidenceSelector value={cookingConfidence} onChange={setCookingConfidence} />
        </View>

        <Button label="Continue" onPress={() => router.push('/onboarding/goals')} fullWidth />
      </View>
    </Screen>
  );
}
