import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { SelectableLot } from '@/lib/cooking';
import { ExpiryState } from '@/lib/freshness';

interface PantryItemPickerModalProps {
  visible: boolean;
  ingredientName: string;
  requiredQuantity: number;
  requiredUnit?: string;
  /**
   * Every matching active pantry lot for this ingredient, already described by
   * `describeSelectableLots` (FEFO-ordered, conversion + freshness resolved).
   * The modal renders these verbatim - it runs no conversion math itself.
   */
  lots: SelectableLot[];
  onClose: () => void;
  /** Confirm the chosen lot set. An empty array means "don't deduct from pantry" (skip). */
  onConfirm: (selectedLotIds: string[]) => void;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Multi-select pantry-lot picker for one recipe ingredient. The user chooses
 * WHICH lots are allowed; SmartPrep still decides how much to take from each
 * (FEFO, in `proposeIngredientDeduction`). Lots whose unit can't be compared to
 * the recipe's unit are shown honestly but not selectable.
 */
export function PantryItemPickerModal({
  visible,
  ingredientName,
  requiredQuantity,
  requiredUnit,
  lots,
  onClose,
  onConfirm,
}: PantryItemPickerModalProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Seed the selection from the current plan every time the sheet opens.
  useEffect(() => {
    if (visible) setSelected(new Set(lots.filter((l) => l.selected).map((l) => l.pantryItemId)));
  }, [visible, lots]);

  const freshnessColor = (state: ExpiryState): string => {
    if (state === 'expired' || state === 'critical') return theme.colors.freshness.prioritize;
    if (state === 'use_soon') return theme.colors.freshness.useSoon;
    return theme.colors.textTertiary;
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen edges={['top', 'left', 'right']}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.lg }}>
          <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
            <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>Choose lots for "{ingredientName}"</Text>
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
              Needs {round2(requiredQuantity)}
              {requiredUnit ? ` ${requiredUnit}` : ''} · SmartPrep splits it across what you pick, freshest-expiring first
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xl, gap: 4 }}>
          {lots.length === 0 ? (
            <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary, padding: theme.spacing.sm }]}>
              No matching pantry lots.
            </Text>
          ) : (
            lots.map((lot) => {
              const isSelected = selected.has(lot.pantryItemId);
              return (
                <Pressable
                  key={lot.pantryItemId}
                  disabled={!lot.selectable}
                  onPress={() => toggle(lot.pantryItemId)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected, disabled: !lot.selectable }}
                  accessibilityLabel={lot.name}
                  style={({ pressed }) => [
                    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: theme.spacing.sm, borderRadius: theme.radius.md, opacity: lot.selectable ? 1 : 0.45 },
                    pressed && lot.selectable && { backgroundColor: theme.colors.surfaceMuted },
                  ]}
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={isSelected ? theme.colors.accent : theme.colors.textTertiary}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{lot.name}</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                      {round2(lot.availableQuantity)} {lot.unit}
                      {lot.approxInRequiredUnit != null ? ` · ≈ ${round2(lot.approxInRequiredUnit)} ${lot.requiredUnit}` : ''}
                    </Text>
                    <Text style={[theme.typography.caption, { color: freshnessColor(lot.freshnessState) }]}>
                      {lot.freshnessPhrase}
                      {!lot.selectable ? ' · quantity can’t be compared' : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}

          <Pressable
            onPress={() => {
              onConfirm([]);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Don't deduct from pantry"
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', gap: 12, padding: theme.spacing.sm, marginTop: theme.spacing.sm, borderRadius: theme.radius.md },
              pressed && { backgroundColor: theme.colors.surfaceMuted },
            ]}
          >
            <Ionicons name="close-circle-outline" size={22} color={theme.colors.textTertiary} />
            <Text style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1 }]}>Don't deduct from pantry (skip)</Text>
          </Pressable>
        </ScrollView>

        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
          <Button
            label={selected.size === 0 ? 'Select at least one lot' : `Use ${selected.size} selected lot${selected.size === 1 ? '' : 's'}`}
            disabled={selected.size === 0}
            onPress={() => {
              onConfirm([...selected]);
              onClose();
            }}
            fullWidth
          />
        </View>
      </Screen>
    </Modal>
  );
}
