import Slider from '@react-native-community/slider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface PrioritySliderProps {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  /** Fires once when the user releases the thumb - use for network-backed commits. Defaults to onChange. */
  onCommit?: (value: number) => void;
}

export function PrioritySlider({ label, description, value, onChange, onCommit }: PrioritySliderProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>{label}</Text>
        <Text style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}>{Math.round(value)}</Text>
      </View>
      {description ? (
        <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]}>{description}</Text>
      ) : null}
      <Slider
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={value}
        onValueChange={onChange}
        onSlidingComplete={onCommit ?? onChange}
        minimumTrackTintColor={theme.colors.accent}
        maximumTrackTintColor={theme.colors.surfaceMuted}
        thumbTintColor={theme.colors.accent}
        accessibilityLabel={label}
        style={styles.slider}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  slider: {
    height: 40,
    marginTop: 2,
  },
});
