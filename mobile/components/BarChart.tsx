import React from 'react';
import { DimensionValue, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export interface BarChartDatum {
  label: string;
  value: number;
  highlighted?: boolean;
}

interface BarChartProps {
  data: BarChartDatum[];
  goal?: number;
  height?: number;
}

/** Simple flexbox weekly bar chart with an optional dashed goal line - no chart library needed. */
export function BarChart({ data, goal, height = 120 }: BarChartProps) {
  const theme = useTheme();
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value), 1);
  const goalPercent = goal ? Math.min(100, (goal / max) * 100) : null;

  return (
    <View>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {goalPercent !== null ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${goalPercent}%` as DimensionValue,
              borderTopWidth: 1,
              borderColor: theme.colors.borderStrong,
              borderStyle: 'dashed',
            }}
          />
        ) : null}
        {data.map((d) => (
          <View
            key={d.label}
            style={{
              flex: 1,
              height: `${Math.max(4, (d.value / max) * 100)}%` as DimensionValue,
              borderRadius: 4,
              backgroundColor: d.highlighted ? theme.colors.accent : theme.colors.surfaceMuted,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {data.map((d) => (
          <Text key={d.label} style={[theme.typography.caption, { flex: 1, textAlign: 'center', color: theme.colors.textTertiary }]}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
