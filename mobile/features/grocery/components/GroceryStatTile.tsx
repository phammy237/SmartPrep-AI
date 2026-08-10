import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface GroceryStatTileProps {
  label: string;
  value: number;
  tint: string;
}

export function GroceryStatTile({ label, value, tint }: GroceryStatTileProps) {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: tint, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 2 }}>
      <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>{value}</Text>
      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>item{value === 1 ? '' : 's'}</Text>
    </View>
  );
}
