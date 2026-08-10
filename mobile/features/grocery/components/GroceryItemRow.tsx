import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { IngredientAvatar } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { GroceryListItem, QuantityUnit } from '@/types';
import { formatNumber, formatQuantity } from '@/utils/format';

const COUNTABLE_UNITS: QuantityUnit[] = ['item', 'container', 'bag', 'bottle', 'can', 'package', 'serving'];

function quantityLabel(item: GroceryListItem): string | null {
  if (COUNTABLE_UNITS.includes(item.unit)) {
    return item.quantity > 1 ? `×${formatNumber(item.quantity)}` : null;
  }
  return formatQuantity(item.quantity, item.unit);
}

interface GroceryItemRowProps {
  item: GroceryListItem;
  isLast?: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

export function GroceryItemRow({ item, isLast, onToggle, onDelete }: GroceryItemRowProps) {
  const theme = useTheme();
  const label = quantityLabel(item);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.isChecked }}
        accessibilityLabel={item.name}
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: item.isChecked ? theme.colors.accent : theme.colors.border,
          backgroundColor: item.isChecked ? theme.colors.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.isChecked ? <Ionicons name="checkmark" size={16} color={theme.colors.textOnAccent} /> : null}
      </Pressable>
      <IngredientAvatar imageUri={item.imageUri} variant="compact" />
      <Text
        style={[
          theme.typography.body,
          {
            color: item.isChecked ? theme.colors.textTertiary : theme.colors.textPrimary,
            flex: 1,
            textDecorationLine: item.isChecked ? 'line-through' : 'none',
          },
        ]}
      >
        {item.name}
        {label ? ` ${label}` : ''}
      </Text>
      <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} hitSlop={8}>
        <Ionicons name="trash-outline" size={18} color={theme.colors.textTertiary} />
      </Pressable>
    </View>
  );
}
