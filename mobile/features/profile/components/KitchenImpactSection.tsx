import React from 'react';
import { Text, View } from 'react-native';

import { Card, SectionHeader } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { KitchenImpact } from '@/types';
import { formatCurrency, formatPercent } from '@/utils/format';

interface KitchenImpactSectionProps {
  impact: KitchenImpact;
}

export function KitchenImpactSection({ impact }: KitchenImpactSectionProps) {
  const theme = useTheme();

  const stats = [
    { value: String(impact.ingredientsUsedBeforeFreshnessWindow), label: 'ingredients used before their estimated freshness window' },
    { value: formatPercent(impact.pantryUtilizationPercent), label: 'pantry utilization' },
    { value: String(impact.itemsDiscarded), label: 'items discarded' },
    { value: formatCurrency(impact.estimatedFoodValueUtilized), label: 'estimated food value utilized' },
  ];

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader title="Kitchen Impact" subtitle={impact.month} />
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {stats.map((stat, index) => (
            <View
              key={stat.label}
              style={{
                width: '50%',
                paddingVertical: theme.spacing.sm,
                paddingRight: index % 2 === 0 ? theme.spacing.sm : 0,
                gap: 2,
              }}
            >
              <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>{stat.value}</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
