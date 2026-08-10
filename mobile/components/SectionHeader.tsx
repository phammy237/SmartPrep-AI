import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onActionPress }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { marginBottom: theme.spacing.sm }]}>
      <View style={styles.titles}>
        <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary, marginTop: 2 }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={8}>
          <Text style={[theme.typography.subhead, { color: theme.colors.accent }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  titles: {
    flex: 1,
  },
});
