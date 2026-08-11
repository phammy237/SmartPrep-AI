import React from 'react';
import { DimensionValue, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { PantryItem } from '@/types';

function toneColor(theme: ReturnType<typeof useTheme>, label: PantryItem['freshness']['label']): string {
  switch (label) {
    case 'fresh':
      return theme.colors.freshness.fresh;
    case 'use_soon':
      return theme.colors.freshness.useSoon;
    case 'prioritize':
      return theme.colors.freshness.prioritize;
    case 'cant_tell':
      return theme.colors.freshness.cantTell;
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface FreshnessTimelineProps {
  item: PantryItem;
}

/**
 * Illustrative freshness timeline: position along the bar reflects the
 * 0-100 freshness score, not a lab-measured expiration date.
 */
export function FreshnessTimeline({ item }: FreshnessTimelineProps) {
  const theme = useTheme();
  const opened = new Date(item.addedAt);
  const bestBy = new Date(opened);
  bestBy.setDate(bestBy.getDate() + 10);
  const position = Math.max(4, Math.min(96, 100 - item.freshness.score));
  const dotColor = toneColor(theme, item.freshness.label);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Freshness timeline</Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceMuted }}>
        <View
          style={{
            position: 'absolute',
            left: `${position}%` as DimensionValue,
            marginLeft: -8,
            top: -5,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: dotColor,
            borderWidth: 2,
            borderColor: theme.colors.backgroundElevated,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Opened {formatDate(opened)}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Best by {formatDate(bestBy)}</Text>
      </View>
    </View>
  );
}
