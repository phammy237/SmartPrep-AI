import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';

interface GroceryBudgetTilesProps {
  itemCount: number;
  estimatedTotal: number;
  budget: number;
}

export function GroceryBudgetTiles({ itemCount, estimatedTotal, budget }: GroceryBudgetTilesProps) {
  const theme = useTheme();
  const diff = budget - estimatedTotal;
  const isUnder = diff >= 0;
  const diffColor = isUnder ? theme.colors.accent : theme.colors.freshness.prioritize;
  const diffTint = isUnder ? theme.colors.accentMuted : theme.colors.freshness.prioritizeMuted;

  const tiles = [
    { value: String(itemCount), label: 'Items', tint: theme.colors.surfaceMuted, valueColor: theme.colors.textPrimary },
    { value: formatCurrency(estimatedTotal), label: 'Est. total', tint: theme.colors.secondaryMuted, valueColor: theme.colors.textPrimary },
    { value: formatCurrency(Math.abs(diff)), label: isUnder ? 'Under budget' : 'Over budget', tint: diffTint, valueColor: diffColor },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      {tiles.map((tile) => (
        <View
          key={tile.label}
          style={{
            flex: 1,
            backgroundColor: tile.tint,
            borderRadius: theme.radius.lg,
            padding: theme.spacing.md,
            gap: 2,
          }}
        >
          <Text style={[theme.typography.title3, { color: tile.valueColor }]}>{tile.value}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{tile.label}</Text>
        </View>
      ))}
    </View>
  );
}
