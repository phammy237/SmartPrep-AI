import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { IngredientAvatar, Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { PantryItem } from '@/types';

interface PantryItemPickerModalProps {
  visible: boolean;
  ingredientName: string;
  requestedQuantity: number;
  requestedUnit?: string;
  /** The user's own pantry items only (from usePantry, already RLS-scoped) - never another user's. */
  pantryItems: PantryItem[];
  onClose: () => void;
  /** null selects "don't deduct from pantry" (skip). */
  onSelect: (item: PantryItem | null) => void;
}

/**
 * Lets the user inspect and change which pantry item is mapped to a recipe
 * ingredient. Only active, in-stock, unit-compatible items are selectable -
 * an incompatible-unit or depleted item is shown but disabled, so the user
 * can never silently select one (Phase 3 has no unit-conversion table).
 */
export function PantryItemPickerModal({
  visible,
  ingredientName,
  requestedQuantity,
  requestedUnit,
  pantryItems,
  onClose,
  onSelect,
}: PantryItemPickerModalProps) {
  const theme = useTheme();
  const activeItems = pantryItems.filter((item) => item.status === 'active');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen edges={['top', 'left', 'right']}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.lg }}>
          <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
            <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>Match "{ingredientName}"</Text>
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
              Needs {requestedQuantity}
              {requestedUnit ? ` ${requestedUnit}` : ''}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, gap: 4 }}>
          <Pressable
            onPress={() => {
              onSelect(null);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Don't deduct from pantry"
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', gap: 12, padding: theme.spacing.sm, borderRadius: theme.radius.md },
              pressed && { backgroundColor: theme.colors.surfaceMuted },
            ]}
          >
            <Ionicons name="close-circle-outline" size={32} color={theme.colors.textTertiary} />
            <Text style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1 }]}>
              Don't deduct from pantry (skip)
            </Text>
          </Pressable>

          {activeItems.length === 0 ? (
            <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary, padding: theme.spacing.sm }]}>
              No active pantry items to choose from.
            </Text>
          ) : (
            activeItems.map((item) => {
              // Same rule as utils/nutritionSnapshot.ts#findCompatiblePantryCandidates -
              // never let the user select an incompatible unit.
              const compatible = !!requestedUnit && item.unit === requestedUnit && item.quantity > 0;
              return (
                <Pressable
                  key={item.id}
                  disabled={!compatible}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  accessibilityState={{ disabled: !compatible }}
                  style={({ pressed }) => [
                    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: theme.spacing.sm, borderRadius: theme.radius.md, opacity: compatible ? 1 : 0.4 },
                    pressed && compatible && { backgroundColor: theme.colors.surfaceMuted },
                  ]}
                >
                  <IngredientAvatar imageUri={item.imageUri} variant="row" />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{item.name}</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                      {item.quantity} {item.unit}
                      {!compatible ? ` - needs ${requestedUnit ?? 'a matching unit'}` : ' available'}
                    </Text>
                  </View>
                  {compatible ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} /> : null}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </Screen>
    </Modal>
  );
}
