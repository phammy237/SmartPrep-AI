import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, Chip, Screen, Stepper } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { groceryTransferService } from '@/services';
import { GroceryListItem, QuantityUnit } from '@/types';
import { GroceryTransferItemInput } from '@/lib/validation/grocerySchemas';

const UNIT_OPTIONS: QuantityUnit[] = ['item', 'bag', 'container', 'bottle', 'can', 'package', 'serving', 'lb', 'oz', 'kg', 'g', 'L', 'ml'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface RowState {
  selected: boolean;
  displayName: string;
  quantity: number;
  unit: QuantityUnit;
}

interface TransferToPantryModalProps {
  visible: boolean;
  /** Acquired, not-yet-transferred grocery lines. */
  candidates: GroceryListItem[];
  onClose: () => void;
  /** Resolves to the ids that failed (empty = all succeeded). */
  onConfirm: (inputs: GroceryTransferItemInput[]) => Promise<string[]>;
  isPending: boolean;
}

export function TransferToPantryModal({ visible, candidates, onClose, onConfirm, isPending }: TransferToPantryModalProps) {
  const theme = useTheme();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [purchaseDate, setPurchaseDate] = useState('');
  const [failedIds, setFailedIds] = useState<string[]>([]);

  // Re-seed local state whenever the modal opens with a fresh candidate set.
  const seedKey = candidates.map((c) => c.id).join(',');
  useEffect(() => {
    if (!visible) return;
    setRows(
      Object.fromEntries(
        candidates.map((c) => [
          c.id,
          { selected: true, displayName: c.name, quantity: c.quantity, unit: c.unit } as RowState,
        ]),
      ),
    );
    setFailedIds([]);
    setPurchaseDate('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, seedKey]);

  const dateValid = purchaseDate === '' || ISO_DATE.test(purchaseDate.trim());
  const selectedIds = candidates.filter((c) => rows[c.id]?.selected).map((c) => c.id);
  const retryMode = failedIds.length > 0;

  const buildInputs = (ids: string[]): GroceryTransferItemInput[] =>
    ids.map((id) => {
      const line = candidates.find((c) => c.id === id)!;
      const row = rows[id];
      return {
        ...groceryTransferService.groceryLineToTransferInput(line),
        displayName: row.displayName.trim() || line.name,
        quantity: row.quantity,
        unit: row.unit,
        ...(purchaseDate.trim() && ISO_DATE.test(purchaseDate.trim()) ? { purchaseDate: purchaseDate.trim() } : {}),
      };
    });

  const handleConfirm = async () => {
    const ids = retryMode ? failedIds : selectedIds;
    if (ids.length === 0 || !dateValid) return;
    const failed = await onConfirm(buildInputs(ids));
    setFailedIds(failed);
    if (failed.length === 0) onClose();
  };

  const patchRow = (id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen edges={['top', 'left', 'right']} scroll contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>Add to Pantry</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
          A grocery line is what you needed - adjust to what you actually bought before adding it to your pantry.
        </Text>

        {candidates.map((line) => {
          const row = rows[line.id];
          if (!row) return null;
          const didFail = failedIds.includes(line.id);
          return (
            <View
              key={line.id}
              style={{
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: didFail ? theme.colors.freshness.prioritize : theme.colors.border,
                backgroundColor: theme.colors.backgroundElevated,
                opacity: row.selected ? 1 : 0.5,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Pressable
                  onPress={() => patchRow(line.id, { selected: !row.selected })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: row.selected }}
                  accessibilityLabel={`Include ${line.name}`}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    borderWidth: 2,
                    borderColor: row.selected ? theme.colors.accent : theme.colors.border,
                    backgroundColor: row.selected ? theme.colors.accent : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {row.selected ? <Ionicons name="checkmark" size={16} color={theme.colors.textOnAccent} /> : null}
                </Pressable>
                <TextInput
                  value={row.displayName}
                  onChangeText={(t) => patchRow(line.id, { displayName: t })}
                  accessibilityLabel={`Name for ${line.name}`}
                  editable={row.selected}
                  style={[
                    theme.typography.body,
                    {
                      flex: 1,
                      color: theme.colors.textPrimary,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                      paddingVertical: 4,
                    },
                  ]}
                />
              </View>

              {row.selected ? (
                <>
                  <Stepper
                    value={row.quantity}
                    onChange={(q) => patchRow(line.id, { quantity: q })}
                    min={1}
                    accessibilityLabel={`Quantity for ${line.name}`}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {UNIT_OPTIONS.map((unit) => (
                      <Chip key={unit} label={unit} selected={row.unit === unit} onPress={() => patchRow(line.id, { unit })} />
                    ))}
                  </ScrollView>
                  {didFail ? (
                    <Text style={[theme.typography.caption, { color: theme.colors.freshness.prioritize }]}>
                      Couldn&apos;t add this one - try again.
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          );
        })}

        <View style={{ gap: 4 }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Purchase date (optional)</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            Applied to every item. Leave blank to keep the freshness estimate unknown - we never guess a date.
          </Text>
          <TextInput
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.textTertiary}
            accessibilityLabel="Purchase date"
            style={[
              theme.typography.body,
              {
                borderWidth: 1,
                borderColor: dateValid ? theme.colors.border : theme.colors.freshness.prioritize,
                borderRadius: theme.radius.md,
                paddingHorizontal: 14,
                minHeight: 44,
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.backgroundElevated,
              },
            ]}
          />
        </View>

        <Button
          label={
            retryMode
              ? `Retry ${failedIds.length} item${failedIds.length === 1 ? '' : 's'}`
              : `Add ${selectedIds.length} to Pantry`
          }
          onPress={handleConfirm}
          loading={isPending}
          disabled={(retryMode ? failedIds.length === 0 : selectedIds.length === 0) || !dateValid}
          fullWidth
        />
      </Screen>
    </Modal>
  );
}
