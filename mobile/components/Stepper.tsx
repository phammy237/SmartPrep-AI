import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { formatNumber } from '@/utils/format';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  accessibilityLabel?: string;
}

export function Stepper({ value, onChange, min = 0, max = 999, step = 1, accessibilityLabel }: StepperProps) {
  const theme = useTheme();
  const round = (n: number) => Math.round(n * 100) / 100;
  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(Math.max(min, round(value - step)))}
        disabled={!canDecrease}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${accessibilityLabel ?? 'quantity'}`}
        style={({ pressed }) => [
          styles.btn,
          { borderColor: theme.colors.border },
          !canDecrease && styles.disabled,
          pressed && canDecrease && styles.pressed,
        ]}
      >
        <Ionicons name="remove" size={18} color={theme.colors.textPrimary} />
      </Pressable>
      <Text style={[theme.typography.headline, styles.value, { color: theme.colors.textPrimary }]}>
        {formatNumber(value)}
      </Text>
      <Pressable
        onPress={() => onChange(Math.min(max, round(value + step)))}
        disabled={!canIncrease}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${accessibilityLabel ?? 'quantity'}`}
        style={({ pressed }) => [
          styles.btn,
          { borderColor: theme.colors.border },
          !canIncrease && styles.disabled,
          pressed && canIncrease && styles.pressed,
        ]}
      >
        <Ionicons name="add" size={18} color={theme.colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 40,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
  },
});
