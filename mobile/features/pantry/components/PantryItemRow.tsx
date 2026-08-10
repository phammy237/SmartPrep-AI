import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FreshnessTag, IngredientAvatar } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { PantryItem } from '@/types';
import { FRESHNESS_META } from '@/utils/freshness';
import { formatQuantity } from '@/utils/format';

interface PantryItemRowProps {
  item: PantryItem;
  onPress: () => void;
}

export function PantryItemRow({ item, onPress }: PantryItemRowProps) {
  const theme = useTheme();
  const subtitle = item.freshness.estimatedUseBy
    ? `${formatQuantity(item.quantity, item.unit)} · ${item.freshness.estimatedUseBy}`
    : formatQuantity(item.quantity, item.unit);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatQuantity(item.quantity, item.unit)}, ${FRESHNESS_META[item.freshness.label].label}`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.colors.border },
        pressed && { backgroundColor: theme.colors.surfaceMuted },
      ]}
    >
      <IngredientAvatar imageUri={item.imageUri} variant="row" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{item.name}</Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <FreshnessTag label={item.freshness.label} size="sm" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
