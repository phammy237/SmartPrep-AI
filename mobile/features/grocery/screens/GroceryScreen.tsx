import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, EmptyState, LoadingState, Screen } from '@/components';
import { useAddGroceryItem, useGroceryList, useRemoveGroceryItem, useToggleGroceryItem } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { GroceryListItem, IngredientCategory } from '@/types';
import { AddGroceryItemModal } from '../components/AddGroceryItemModal';
import { GroceryItemRow } from '../components/GroceryItemRow';
import { GroceryStatTile } from '../components/GroceryStatTile';

const CATEGORY_ORDER: IngredientCategory[] = ['produce', 'dairy', 'protein', 'pantry', 'frozen', 'other'];
const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  produce: 'Produce',
  dairy: 'Dairy',
  protein: 'Protein',
  pantry: 'Pantry',
  frozen: 'Frozen',
  other: 'Other',
};

export function GroceryScreen() {
  const theme = useTheme();
  const listQuery = useGroceryList();
  const toggle = useToggleGroceryItem();
  const remove = useRemoveGroceryItem();
  const add = useAddGroceryItem();
  const [showAdd, setShowAdd] = useState(false);

  const itemsByCategory = useMemo(() => {
    const buckets: Record<IngredientCategory, GroceryListItem[]> = {
      produce: [],
      dairy: [],
      protein: [],
      pantry: [],
      frozen: [],
      other: [],
    };
    for (const item of listQuery.data?.items ?? []) {
      buckets[item.category].push(item);
    }
    return buckets;
  }, [listQuery.data]);

  const checkedCount = useMemo(
    () => (listQuery.data?.items ?? []).filter((i) => i.isChecked).length,
    [listQuery.data],
  );
  const uncheckedCount = (listQuery.data?.items.length ?? 0) - checkedCount;

  return (
    <Screen scroll header edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: theme.spacing.xs, gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>Grocery List</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {listQuery.isLoading ? (
        <LoadingState message="Loading your list..." />
      ) : listQuery.isError ? (
        <EmptyState icon="⚠️" title="Couldn't load your list" actionLabel="Retry" onActionPress={() => listQuery.refetch()} />
      ) : !listQuery.data || listQuery.data.items.length === 0 ? (
        <EmptyState
          icon="🛒"
          title="Your list is empty"
          message="Add items from a recipe or manually below."
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <GroceryStatTile label="Already at home" value={checkedCount} tint={theme.colors.accentMuted} />
            <GroceryStatTile label="Still to buy" value={uncheckedCount} tint={theme.colors.secondaryMuted} />
          </View>
          {CATEGORY_ORDER.map((category) => {
            const items = itemsByCategory[category];
            if (items.length === 0) return null;
            return (
              <View key={category} style={{ gap: theme.spacing.sm }}>
                <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, letterSpacing: 0.5 }]}>
                  {CATEGORY_LABELS[category].toUpperCase()}
                </Text>
                <Card>
                  {items.map((item, index) => (
                    <GroceryItemRow
                      key={item.id}
                      item={item}
                      isLast={index === items.length - 1}
                      onToggle={() => toggle.mutate(item.id)}
                      onDelete={() => remove.mutate(item.id)}
                    />
                  ))}
                </Card>
              </View>
            );
          })}
        </>
      )}

      <Button label="+ Add Item" variant="ghost" onPress={() => setShowAdd(true)} />

      <AddGroceryItemModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={(input) => add.mutate(input)} />
    </Screen>
  );
}
