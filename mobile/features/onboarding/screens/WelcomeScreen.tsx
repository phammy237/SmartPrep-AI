import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Button, Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';

export function WelcomeScreen() {
  const theme = useTheme();

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
          <Text style={{ fontSize: 44 }}>🥗</Text>
        </View>
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
          SmartPrep turns your fridge, freezer, and pantry into a living inventory that tells you
          what to cook next.
        </Text>
      </View>
      <Button label="Get Started" onPress={() => router.push('/onboarding/signin')} fullWidth />
    </Screen>
  );
}
