import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Theme, useTheme } from '@/hooks/useTheme';
import { FreshnessLabel } from '@/types';
import { FRESHNESS_META } from '@/utils/freshness';

interface FreshnessTagProps {
  label: FreshnessLabel;
  size?: 'sm' | 'md';
}

function toneColors(theme: Theme, label: FreshnessLabel) {
  switch (label) {
    case 'fresh':
      return { fg: theme.colors.freshness.fresh, bg: theme.colors.freshness.freshMuted };
    case 'use_soon':
      return { fg: theme.colors.freshness.useSoon, bg: theme.colors.freshness.useSoonMuted };
    case 'prioritize':
      return { fg: theme.colors.freshness.prioritize, bg: theme.colors.freshness.prioritizeMuted };
    case 'cant_tell':
      return { fg: theme.colors.freshness.cantTell, bg: theme.colors.freshness.cantTellMuted };
  }
}

/**
 * Freshness is always shown as icon + text together - never color alone -
 * so the status reads correctly for colorblind users and in screen readers.
 */
export function FreshnessTag({ label, size = 'md' }: FreshnessTagProps) {
  const theme = useTheme();
  const meta = FRESHNESS_META[label];
  const { fg, bg } = toneColors(theme, label);

  return (
    <View
      style={[styles.tag, { backgroundColor: bg }, size === 'sm' && styles.sm]}
      accessibilityLabel={`Freshness: ${meta.label}`}
    >
      <Ionicons name={meta.icon} size={size === 'sm' ? 12 : 14} color={fg} />
      <Text style={[size === 'sm' ? theme.typography.caption : theme.typography.footnote, { color: fg }]}>
        {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    alignSelf: 'flex-start',
  },
  sm: {
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
});
