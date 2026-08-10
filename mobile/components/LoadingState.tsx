import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface LoadingStateProps {
  message?: string;
  fullscreen?: boolean;
}

export function LoadingState({ message, fullscreen }: LoadingStateProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        { gap: theme.spacing.sm, padding: theme.spacing.xl },
        fullscreen && styles.fullscreen,
      ]}
    >
      <ActivityIndicator color={theme.colors.accent} />
      {message ? <Text style={[theme.typography.callout, { color: theme.colors.textSecondary }]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreen: {
    flex: 1,
  },
});
