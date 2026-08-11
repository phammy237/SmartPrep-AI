import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, EmptyState, LoadingState, Screen } from '@/components';
import { useAddGroceryItem, useGroceryList, useRemoveGroceryItem, useToggleGroceryItem, useUser } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { GroceryListItem, IngredientCategory } from '@/types';
import { AddGroceryItemModal } from '../components/AddGroceryItemModal';
import { GroceryBudgetTiles } from '../components/GroceryBudgetTiles';
import { GroceryItemRow } from '../components/GroceryItemRow';

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
  const userQuery = useUser();
  const toggle = useToggleGroceryItem();
  const remove = useRemoveGroceryItem();
  const add = useAddGroceryItem();
  const [showAdd, setShowAdd] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<IngredientCategory>>(new Set());

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

  const estimatedTotal = useMemo(
    () => (listQuery.data?.items ?? []).reduce((sum, item) => sum + (item.estimatedPrice ?? 0), 0),
    [listQuery.data],
  );

  const lowWasteItems = useMemo(
    () => (listQuery.data?.items ?? []).filter((item) => item.swapSuggestion || item.wasteNote),
    [listQuery.data],
  );

  const toggleCategoryCollapsed = (category: IngredientCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

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
          <GroceryBudgetTiles
            itemCount={listQuery.data.items.length}
            estimatedTotal={estimatedTotal}
            budget={userQuery.data?.preferences.weeklyGroceryBudget ?? estimatedTotal}
          />
          {CATEGORY_ORDER.map((category) => {
            const items = itemsByCategory[category];
            if (items.length === 0) return null;
            const collapsed = collapsedCategories.has(category);
            return (
              <View key={category} style={{ gap: theme.spacing.sm }}>
                <Pressable
                  onPress={() => toggleCategoryCollapsed(category)}
                  accessibilityRole="button"
                  accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${CATEGORY_LABELS[category]}`}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, letterSpacing: 0.5 }]}>
                    {CATEGORY_LABELS[category].toUpperCase()} ({items.length})
                  </Text>
                  <Ionicons
                    name={collapsed ? 'chevron-down' : 'chevron-up'}
                    size={16}
                    color={theme.colors.textTertiary}
                  />
                </Pressable>
                {collapsed ? null : (
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
                )}
              </View>
            );
          })}

          {lowWasteItems.length > 0 ? (
            <Button
              label={`View Low-Waste Swaps (${lowWasteItems.length})`}
              variant="secondary"
              onPress={() =>
                Alert.alert(
                  'Low-Waste Swaps',
                  lowWasteItems.map((item) => `${item.name}: ${item.wasteNote ?? item.swapSuggestion}`).join('\n\n'),
                )
              }
              fullWidth
            />
          ) : null}
        </>
      )}

      <Button label="+ Add Item" variant="ghost" onPress={() => setShowAdd(true)} />

      <AddGroceryItemModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={(input) => add.mutate(input)} />
    </Screen>
  );
}
