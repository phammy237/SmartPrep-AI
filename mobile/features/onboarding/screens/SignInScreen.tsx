import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { useOnboardingStore } from '@/store';
import { AuthProvider } from '@/types';
import { OnboardingProgress } from '../components/OnboardingProgress';

interface SignInOption {
  provider: Exclude<AuthProvider, null>;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const OPTIONS: SignInOption[] = [
  { provider: 'apple', label: 'Continue with Apple', icon: 'logo-apple' },
  { provider: 'google', label: 'Continue with Google', icon: 'logo-google' },
  { provider: 'email', label: 'Continue with Email', icon: 'mail-outline' },
];

export function SignInScreen() {
  const theme = useTheme();
  const setAuthProvider = useOnboardingStore((s) => s.setAuthProvider);

  const handleSelect = (provider: Exclude<AuthProvider, null>) => {
    setAuthProvider(provider);
    router.push('/onboarding/dietary');
  };

  return (
    <Screen contentContainerStyle={{ flex: 1 }}>
      <OnboardingProgress step={1} total={6} onBack={() => router.back()} />
      <View style={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'center', gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Create your account</Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            This is a prototype - no account is actually created yet.
          </Text>
        </View>
        <View style={{ gap: theme.spacing.md }}>
          {OPTIONS.map((option) => (
            <Pressable
              key={option.provider}
              onPress={() => handleSelect(option.provider)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: theme.colors.backgroundElevated, borderColor: theme.colors.border },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name={option.icon} size={20} color={theme.colors.textPrimary} />
              <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    minHeight: 52,
  },
});
