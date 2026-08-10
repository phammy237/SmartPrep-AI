import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export type BadgeTone = 'neutral' | 'accent' | 'fresh' | 'useSoon' | 'prioritize' | 'cantTell';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const theme = useTheme();
  const { bg, fg } =
    tone === 'accent'
      ? { bg: theme.colors.accentMuted, fg: theme.colors.accent }
      : tone === 'fresh'
        ? { bg: theme.colors.freshness.freshMuted, fg: theme.colors.freshness.fresh }
        : tone === 'useSoon'
          ? { bg: theme.colors.freshness.useSoonMuted, fg: theme.colors.freshness.useSoon }
          : tone === 'prioritize'
            ? { bg: theme.colors.freshness.prioritizeMuted, fg: theme.colors.freshness.prioritize }
            : tone === 'cantTell'
              ? { bg: theme.colors.freshness.cantTellMuted, fg: theme.colors.freshness.cantTell }
              : { bg: theme.colors.surfaceMuted, fg: theme.colors.textSecondary };

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[theme.typography.caption, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
});
