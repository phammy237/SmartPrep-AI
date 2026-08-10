import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface OnboardingProgressProps {
  step: number;
  total: number;
  onBack?: () => void;
}

export function OnboardingProgress({ step, total, onBack }: OnboardingProgressProps) {
  const theme = useTheme();
  const pct = Math.round((step / total) * 100);

  return (
    <View style={[styles.row, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }]}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={[styles.track, { backgroundColor: theme.colors.surfaceMuted }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.colors.accent }]} />
      </View>
      <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, minWidth: 32, textAlign: 'right' }]}>
        {step}/{total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  spacer: {
    width: 22,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
});
