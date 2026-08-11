import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { IngredientCategory } from '@/types';
import { STORAGE_TIPS } from '@/utils/nutrition';

interface StorageTipCardProps {
  category: IngredientCategory;
}

export function StorageTipCard({ category }: StorageTipCardProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.accentMuted,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
      }}
    >
      <Ionicons name="bulb-outline" size={20} color={theme.colors.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>Storage tip</Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{STORAGE_TIPS[category]}</Text>
      </View>
    </View>
  );
}
