import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export function Card({ children, style, padded = true }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.backgroundElevated,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: padded ? theme.spacing.lg : 0,
        },
        theme.shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}
