import React from 'react';
import { Text, View } from 'react-native';

import { Card, SectionHeader } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { KitchenImpact } from '@/types';

interface ImpactSummaryCardProps {
  impact: KitchenImpact;
}

/**
 * Home's compact impact strip - two honest counts derived from the pantry
 * event ledger for the current month. No money / weight / "waste avoided"
 * figures (the ledger can't support them).
 */
export function ImpactSummaryCard({ impact }: ImpactSummaryCardProps) {
  const theme = useTheme();

  return (
    <>
      <SectionHeader title="Kitchen Activity" subtitle={impact.rangeLabel} />
      <Card>
        {impact.hasActivity ? (
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>{impact.itemsUsedCount}</Text>
              <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
                pantry items used
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: theme.colors.border, marginHorizontal: theme.spacing.lg }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>
                {impact.cookingSessionsCount}
              </Text>
              <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
                meals cooked
              </Text>
            </View>
          </View>
        ) : (
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            No pantry activity logged this month yet. Cooking or using items will show up here.
          </Text>
        )}
      </Card>
    </>
  );
}
