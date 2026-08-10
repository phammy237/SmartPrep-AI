import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Button, ChipGroup, ChipOption, Screen, TagInput } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { useOnboardingStore } from '@/store';
import { OnboardingProgress } from '../components/OnboardingProgress';

const CUISINES: ChipOption[] = [
  { value: 'Italian', label: 'Italian' },
  { value: 'Mexican', label: 'Mexican' },
  { value: 'Thai', label: 'Thai' },
  { value: 'Indian', label: 'Indian' },
  { value: 'Chinese', label: 'Chinese' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Mediterranean', label: 'Mediterranean' },
  { value: 'American', label: 'American' },
  { value: 'French', label: 'French' },
  { value: 'Korean', label: 'Korean' },
  { value: 'Vietnamese', label: 'Vietnamese' },
];

export function FoodPreferencesScreen() {
  const theme = useTheme();
  const favoriteCuisines = useOnboardingStore((s) => s.favoriteCuisines);
  const dislikedFoods = useOnboardingStore((s) => s.dislikedFoods);
  const toggleListValue = useOnboardingStore((s) => s.toggleListValue);

  const dislikedOptions: ChipOption[] = dislikedFoods.map((f) => ({ value: f, label: f }));

  return (
    <Screen scroll contentContainerStyle={{ flex: 1 }}>
      <OnboardingProgress step={4} total={6} onBack={() => router.back()} />
      <View style={{ flex: 1, padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>What do you love to cook?</Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            Pick your favorite cuisines.
          </Text>
        </View>
        <ChipGroup
          options={CUISINES}
          selected={favoriteCuisines}
          onToggle={(v) => toggleListValue('favoriteCuisines', v)}
        />

        <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.md }}>
          <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
            Any foods you'd rather avoid?
          </Text>
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            We'll steer recommendations away from these.
          </Text>
        </View>
        {dislikedOptions.length > 0 ? (
          <ChipGroup
            options={dislikedOptions}
            selected={dislikedFoods}
            onToggle={(v) => toggleListValue('dislikedFoods', v)}
          />
        ) : null}
        <TagInput placeholder="Add a food to avoid" onAdd={(v) => toggleListValue('dislikedFoods', v)} />

        <View style={{ flex: 1, minHeight: theme.spacing.xl }} />
        <Button label="Continue" onPress={() => router.push('/onboarding/cooking-profile')} fullWidth />
      </View>
    </Screen>
  );
}
