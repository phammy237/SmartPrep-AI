import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Theme, useTheme } from '@/hooks/useTheme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

function variantColors(theme: Theme, variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return { bg: theme.colors.accent, fg: theme.colors.textOnAccent, border: 'transparent' };
    case 'secondary':
      return { bg: theme.colors.surfaceMuted, fg: theme.colors.textPrimary, border: theme.colors.border };
    case 'ghost':
      return { bg: 'transparent', fg: theme.colors.accent, border: 'transparent' };
    case 'danger':
      return { bg: theme.colors.freshness.prioritizeMuted, fg: theme.colors.freshness.prioritize, border: 'transparent' };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  loading,
  icon,
  fullWidth,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();
  const palette = variantColors(theme, variant);
  const isInert = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isInert }}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        { backgroundColor: palette.bg, borderColor: palette.border, borderWidth: palette.border === 'transparent' ? 0 : 1 },
        fullWidth && styles.fullWidth,
        isInert && styles.disabled,
        pressed && !isInert && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[theme.typography.headline, { color: palette.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  md: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  lg: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    minHeight: 52,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
