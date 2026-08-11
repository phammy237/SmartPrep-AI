import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Button, PrioritySlider, Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { useOnboardingStore } from '@/store';
import { SmartPrepPriorities } from '@/types';
import { OnboardingProgress } from '../components/OnboardingProgress';

const PRIORITY_FIELDS: { key: keyof SmartPrepPriorities; label: string; description: string }[] = [
  { key: 'useWhatIHave', label: 'Use what I have', description: 'Favor recipes built around your current pantry.' },
  { key: 'reduceFoodWaste', label: 'Reduce food waste', description: 'Prioritize ingredients before they go bad.' },
  { key: 'saveMoney', label: 'Save money', description: 'Favor recipes that need little to no shopping.' },
  { key: 'eatHealthier', label: 'Eat healthier', description: 'Favor lighter, more balanced meals.' },
  { key: 'cookQuickly', label: 'Cook quickly', description: 'Favor recipes that fit your time window.' },
  { key: 'tryNewFoods', label: 'Try new foods', description: 'Occasionally suggest something unexpected.' },
];

export function PrioritiesScreen() {
  const theme = useTheme();
  const priorities = useOnboardingStore((s) => s.priorities);
  const setPriority = useOnboardingStore((s) => s.setPriority);

  return (
    <Screen scroll contentContainerStyle={{ flex: 1 }}>
      <OnboardingProgress step={7} total={7} onBack={() => router.back()} />
      <View style={{ flex: 1, padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>
            What matters most to you?
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            This shapes how we recommend meals. You can adjust it anytime in your profile.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.lg }}>
          {PRIORITY_FIELDS.map((field) => (
            <PrioritySlider
              key={field.key}
              label={field.label}
              description={field.description}
              value={priorities[field.key]}
              onChange={(value) => setPriority(field.key, value)}
            />
          ))}
        </View>

        <View style={{ minHeight: theme.spacing.xl }} />
        <Button label="Continue" onPress={() => router.push('/onboarding/first-scan')} fullWidth />
      </View>
    </Screen>
  );
}
