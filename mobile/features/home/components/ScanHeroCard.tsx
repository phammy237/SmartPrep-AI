import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export function ScanHeroCard() {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.push('/scan')}
      accessibilityRole="button"
      accessibilityLabel="Scan ingredients"
      style={({ pressed }) => [
        {
          backgroundColor: theme.colors.accentMuted,
          borderRadius: theme.radius.xl,
          paddingVertical: theme.spacing.xl,
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.sm,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View
        style={{
          width: 68,
          height: 68,
          borderRadius: 34,
          backgroundColor: theme.colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="camera" size={28} color={theme.colors.textOnAccent} />
      </View>
      <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Scan Ingredients</Text>
    </Pressable>
  );
}
