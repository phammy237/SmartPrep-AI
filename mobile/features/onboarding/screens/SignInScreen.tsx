import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { OnboardingProgress } from '../components/OnboardingProgress';

interface SignInOption {
  key: 'apple' | 'google' | 'email';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  available: boolean;
}

const OPTIONS: SignInOption[] = [
  { key: 'apple', label: 'Continue with Apple', icon: 'logo-apple', available: false },
  { key: 'google', label: 'Continue with Google', icon: 'logo-google', available: false },
  { key: 'email', label: 'Continue with Email', icon: 'mail-outline', available: true },
];

export function SignInScreen() {
  const theme = useTheme();

  const handleSelect = (option: SignInOption) => {
    if (!option.available) {
      Alert.alert('Coming soon', `${option.label} isn't set up yet - use email for now.`);
      return;
    }
    router.push('/onboarding/email');
  };

  return (
    <Screen contentContainerStyle={{ flex: 1 }}>
      <OnboardingProgress step={1} total={7} onBack={() => router.back()} />
      <View style={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'center', gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Create your account</Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            Your pantry, meal plans, and nutrition goals stay saved to this account.
          </Text>
        </View>
        <View style={{ gap: theme.spacing.md }}>
          {OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => handleSelect(option)}
              accessibilityRole="button"
              accessibilityLabel={option.available ? option.label : `${option.label} (coming soon)`}
              accessibilityState={{ disabled: !option.available }}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: theme.colors.backgroundElevated, borderColor: theme.colors.border },
                !option.available && styles.unavailable,
                pressed && option.available && { opacity: 0.85 },
              ]}
            >
              <Ionicons
                name={option.icon}
                size={20}
                color={option.available ? theme.colors.textPrimary : theme.colors.textTertiary}
              />
              <Text
                style={[
                  theme.typography.headline,
                  { color: option.available ? theme.colors.textPrimary : theme.colors.textTertiary },
                ]}
              >
                {option.label}
              </Text>
              {!option.available ? (
                <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary, marginLeft: 'auto' }]}>
                  Coming soon
                </Text>
              ) : null}
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
  unavailable: {
    opacity: 0.55,
  },
});
