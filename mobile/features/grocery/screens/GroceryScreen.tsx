import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, EmptyState, LoadingState, Screen } from '@/components';
import {
  useAddGroceryItem,
  useClearCheckedGroceryItems,
  useCompleteShoppingTrip,
  useGroceryList,
  useRemoveGroceryItem,
  useToggleGroceryItem,
  useTransferGroceryItemsToPantry,
  useUser,
} from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { groceryTransferService } from '@/services';
import { GroceryListItem, IngredientCategory } from '@/types';
import { AddGroceryItemModal } from '../components/AddGroceryItemModal';
import { GroceryBudgetTiles } from '../components/GroceryBudgetTiles';
import { GroceryItemRow } from '../components/GroceryItemRow';
import { TransferToPantryModal } from '../components/TransferToPantryModal';

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
  const clearChecked = useClearCheckedGroceryItems();
  const transferToPantry = useTransferGroceryItemsToPantry();
  const completeTrip = useCompleteShoppingTrip();
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
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

  const checkedCount = useMemo(
    () => (listQuery.data?.items ?? []).filter((item) => item.isChecked).length,
    [listQuery.data],
  );

  const transferCandidates = useMemo(
    () => groceryTransferService.getTransferableGroceryItems(listQuery.data?.items ?? []),
    [listQuery.data],
  );

  // Checked items the user hasn't put in the pantry (and might not want to).
  const untransferredCheckedCount = transferCandidates.length;
  const itemCount = listQuery.data?.items.length ?? 0;

  const runComplete = () => {
    completeTrip.mutate(undefined, {
      onSuccess: (result) => {
        Alert.alert(
          'Shopping trip completed',
          `Saved ${result.completed.itemCount} item${result.completed.itemCount === 1 ? '' : 's'} to your history. Started a fresh grocery list.`,
        );
      },
      onError: () => Alert.alert("Couldn't complete trip", 'Something went wrong. Please try again.'),
    });
  };

  const handleCompleteTrip = () => {
    if (untransferredCheckedCount > 0) {
      Alert.alert(
        'Complete this trip?',
        `${untransferredCheckedCount} purchased item${untransferredCheckedCount === 1 ? " hasn't" : "s haven't"} been added to Pantry. They'll stay in this completed trip's history.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Review', onPress: () => setShowTransfer(true) },
          { text: 'Complete Anyway', style: 'destructive', onPress: runComplete },
        ],
      );
      return;
    }
    Alert.alert('Complete this trip?', 'Your current list becomes history and a fresh list is started.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: runComplete },
    ]);
  };

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <Pressable
            onPress={() => router.push('/grocery/history')}
            accessibilityRole="button"
            accessibilityLabel="Shopping history"
            hitSlop={8}
          >
            <Ionicons name="time-outline" size={22} color={theme.colors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {listQuery.isLoading ? (
        <LoadingState message="Loading your list..." />
      ) : listQuery.isError ? (
        <EmptyState title="Couldn't load your list" actionLabel="Retry" onActionPress={() => listQuery.refetch()} />
      ) : !listQuery.data || listQuery.data.items.length === 0 ? (
        <EmptyState
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

          {transferCandidates.length > 0 ? (
            <Button
              label={`Add Purchased Items to Pantry (${transferCandidates.length})`}
              variant="secondary"
              onPress={() => setShowTransfer(true)}
              fullWidth
            />
          ) : null}

          {itemCount > 0 ? (
            <Button
              label="Complete Shopping Trip"
              variant="primary"
              loading={completeTrip.isPending}
              onPress={handleCompleteTrip}
              fullWidth
            />
          ) : null}

          {checkedCount > 0 ? (
            <Button
              label={`Clear Checked (${checkedCount})`}
              variant="ghost"
              loading={clearChecked.isPending}
              onPress={() =>
                Alert.alert(
                  'Clear checked items?',
                  untransferredCheckedCount > 0
                    ? `This removes ${checkedCount} acquired item(s) from your list. ${untransferredCheckedCount} of them ${untransferredCheckedCount === 1 ? "hasn't" : "haven't"} been added to your pantry yet.`
                    : `This removes ${checkedCount} acquired item(s) from your list.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', style: 'destructive', onPress: () => clearChecked.mutate() },
                  ],
                )
              }
              fullWidth
            />
          ) : null}
        </>
      )}

      <Button label="+ Add Item" variant="ghost" onPress={() => setShowAdd(true)} />

      <AddGroceryItemModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={(input) => add.mutate(input)} />

      <TransferToPantryModal
        visible={showTransfer}
        candidates={transferCandidates}
        isPending={transferToPantry.isPending}
        onClose={() => setShowTransfer(false)}
        onConfirm={async (inputs) => {
          try {
            const result = await transferToPantry.mutateAsync(inputs);
            if (result.failed.length === 0) {
              Alert.alert(
                'Added to pantry',
                `${result.transferred.length} item${result.transferred.length === 1 ? '' : 's'} added. They stay checked on your list, marked "Added to pantry".`,
              );
            }
            return result.failed.map((f) => f.groceryItemId);
          } catch {
            Alert.alert("Couldn't add items", 'Something went wrong. Please try again.');
            return inputs.map((i) => i.groceryItemId);
          }
        }}
      />
    </Screen>
  );
}
