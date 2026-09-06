import React from 'react';
import { Text, View } from 'react-native';

import { Card, SectionHeader } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { ImpactUnitTotal, KitchenImpact } from '@/types';
import { formatNumber, formatPercent } from '@/utils/format';

interface KitchenImpactSectionProps {
  impact: KitchenImpact;
}

function unitTotalsLabel(totals: ImpactUnitTotal[]): string {
  return totals.map((t) => `${formatNumber(t.totalQuantity)} ${t.unit}`).join(' · ');
}

/**
 * Profile's Kitchen Impact block. Every figure is a real count from the
 * pantry event ledger for the current month. `utilizationRate` is shown only
 * when there was outflow to rate it against; unit totals are grouped by unit
 * (never summed across units - there is no conversion table).
 */
export function KitchenImpactSection({ impact }: KitchenImpactSectionProps) {
  const theme = useTheme();

  const stats: { value: string; label: string }[] = [
    { value: String(impact.useEventCount), label: 'pantry-use events' },
    { value: String(impact.itemsDiscardedCount), label: 'items discarded' },
    { value: String(impact.cookingSessionsCount), label: 'meals cooked' },
  ];
  if (impact.utilizationRate !== null) {
    stats.push({
      value: formatPercent(impact.utilizationRate * 100),
      label: 'of tracked food was used, not discarded',
    });
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader title="Kitchen Impact" subtitle={impact.rangeLabel} />
      <Card>
        {impact.hasActivity ? (
          <>
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
            {impact.usedQuantitiesByUnit.length > 0 ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, marginTop: theme.spacing.xs }]}>
                Used: {unitTotalsLabel(impact.usedQuantitiesByUnit)}
              </Text>
            ) : null}
            {impact.discardedQuantitiesByUnit.length > 0 ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                Discarded: {unitTotalsLabel(impact.discardedQuantitiesByUnit)}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
            No pantry activity this month yet.
          </Text>
        )}
      </Card>
    </View>
  );
}
