import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
}

export function Chip({ label, selected, onPress, icon }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceMuted,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text
        style={[
          theme.typography.subhead,
          { color: selected ? theme.colors.textOnAccent : theme.colors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: 40,
  },
  icon: {
    fontSize: 14,
  },
});
