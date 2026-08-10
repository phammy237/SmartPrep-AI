import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Screen } from '@/components';
import { useCompleteOnboarding } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { useOnboardingStore, useSessionStore } from '@/store';

export function FirstScanScreen() {
  const theme = useTheme();
  const authProvider = useOnboardingStore((s) => s.authProvider);
  const toPreferences = useOnboardingStore((s) => s.toPreferences);
  const resetOnboardingDraft = useOnboardingStore((s) => s.reset);
  const completeOnboarding = useSessionStore((s) => s.completeOnboarding);
  const { mutateAsync, isPending } = useCompleteOnboarding();

  const finishOnboarding = async () => {
    await mutateAsync({ preferences: toPreferences(), authProvider });
    completeOnboarding();
    resetOnboardingDraft();
  };

  return (
    <Screen contentContainerStyle={{ padding: theme.spacing.xl, justifyContent: 'space-between' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: theme.colors.accentMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 44 }}>📷</Text>
        </View>
        <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary, textAlign: 'center' }]}>
          Let's see what's in your kitchen.
        </Text>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary, textAlign: 'center', maxWidth: 300 }]}>
          Scan your fridge, freezer, or pantry and SmartPrep will build your digital pantry for you.
        </Text>
      </View>
      <View style={{ gap: theme.spacing.md }}>
        <Button
          label="Start First Scan"
          loading={isPending}
          onPress={async () => {
            await finishOnboarding();
            router.replace('/scan');
          }}
          fullWidth
        />
        <Pressable
          onPress={async () => {
            await finishOnboarding();
            router.replace('/(tabs)/home');
          }}
          accessibilityRole="button"
          accessibilityLabel="I'll do this later"
          hitSlop={8}
          style={{ alignSelf: 'center', padding: theme.spacing.sm }}
        >
          <Text style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}>I'll do this later</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
