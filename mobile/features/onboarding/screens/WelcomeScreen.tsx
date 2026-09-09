import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Button, Screen, SmartPrepLogo } from '@/components';
import { useTheme } from '@/hooks/useTheme';

export function WelcomeScreen() {
  const theme = useTheme();

  return (
    <Screen contentContainerStyle={{ padding: theme.spacing.xl, justifyContent: 'space-between' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg }}>
        <SmartPrepLogo size={80} />
        <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>SmartPrep AI</Text>
        <Text
          style={[
            theme.typography.largeTitle,
            { color: theme.colors.textPrimary, textAlign: 'center' },
          ]}
        >
          Know what you have.{'\n'}Cook what makes sense.
        </Text>
        <Text
          style={[
            theme.typography.body,
            { color: theme.colors.textSecondary, textAlign: 'center', maxWidth: 300 },
          ]}
        >
          SmartPrep keeps a living inventory of your fridge, freezer, and pantry - so you know what
          you have, use food before it goes bad, plan meals, and build smarter grocery lists.
        </Text>
      </View>
      <Button label="Get Started" onPress={() => router.push('/onboarding/signin')} fullWidth />
    </Screen>
  );
}
