import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { CookingConfidence } from '@/types';

const LEVELS: CookingConfidence[] = [1, 2, 3, 4, 5];

interface ConfidenceSelectorProps {
  value: CookingConfidence;
  onChange: (value: CookingConfidence) => void;
}

export function ConfidenceSelector({ value, onChange }: ConfidenceSelectorProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        {LEVELS.map((level) => {
          const selected = value === level;
          return (
            <Pressable
              key={level}
              onPress={() => onChange(level)}
              accessibilityRole="button"
              accessibilityLabel={`Confidence level ${level} of 5`}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.dot,
                {
                  backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceMuted,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[theme.typography.headline, { color: selected ? theme.colors.textOnAccent : theme.colors.textPrimary }]}>
                {level}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]}>Beginner</Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]}>Experienced</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
