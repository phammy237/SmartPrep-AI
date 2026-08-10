import React from 'react';
import { Text, View } from 'react-native';

import { Card, SectionHeader } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { KitchenImpact } from '@/types';
import { formatCurrency } from '@/utils/format';

interface ImpactSummaryCardProps {
  impact: KitchenImpact;
}

export function ImpactSummaryCard({ impact }: ImpactSummaryCardProps) {
  const theme = useTheme();

  return (
    <>
      <SectionHeader title="This Month" subtitle={impact.month} />
      <Card>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>
              {impact.ingredientsUsedBeforeFreshnessWindow}
            </Text>
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
              ingredients used before their estimated freshness window
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: theme.colors.border, marginHorizontal: theme.spacing.lg }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>
              {formatCurrency(impact.estimatedFoodValueUtilized)}
            </Text>
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
              estimated food value utilized
            </Text>
          </View>
        </View>
      </Card>
    </>
  );
}
