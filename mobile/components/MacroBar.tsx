import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { formatNumber } from '@/utils/format';

interface MacroBarProps {
  label: string;
  value: number;
  goal: number;
  unit?: string;
  color?: string;
}

export function MacroBar({ label, value, goal, unit = 'g', color }: MacroBarProps) {
  const theme = useTheme();
  const percent = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const barColor = color ?? theme.colors.accent;

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>{label}</Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
          {formatNumber(value)}/{formatNumber(goal)}{unit}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${percent}%`, backgroundColor: barColor, borderRadius: 3 }} />
      </View>
    </View>
  );
}
