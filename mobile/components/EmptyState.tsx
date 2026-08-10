import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function EmptyState({ icon = '🍽️', title, message, actionLabel, onActionPress }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { paddingVertical: theme.spacing.xxl, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[theme.typography.title3, { color: theme.colors.textPrimary, textAlign: 'center' }]}>{title}</Text>
      {message ? (
        <Text style={[theme.typography.callout, { color: theme.colors.textSecondary, textAlign: 'center' }]}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onActionPress ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Button label={actionLabel} onPress={onActionPress} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 40,
  },
});
