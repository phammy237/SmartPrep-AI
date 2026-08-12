import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, EmptyState, IngredientAvatar, LoadingState, Screen, Stepper } from '@/components';
import { usePantry, useRecipe, useUseSomeManyPantryItems } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { QuantityUnit } from '@/types';
import { haptics } from '@/utils/haptics';

interface EstimatedUse {
  ingredientId: string;
  name: string;
  imageUri: string;
  quantity: number;
  unit: QuantityUnit;
}

export function CookingModeScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipeQuery = useRecipe(id);
  const pantryQuery = usePantry();
  const useSomeMany = useUseSomeManyPantryItems();

  const [stepIndex, setStepIndex] = useState(0);
  const [estimates, setEstimates] = useState<EstimatedUse[] | null>(null);

  if (recipeQuery.isLoading) {
    return (
      <Screen>
        <LoadingState fullscreen message="Loading recipe..." />
      </Screen>
    );
  }

  if (!recipeQuery.data) {
    return (
      <Screen>
        <EmptyState title="Recipe not found" />
      </Screen>
    );
  }

  const recipe = recipeQuery.data;
  const steps = recipe.steps;

  const handleFinishCooking = () => {
    setEstimates(
      recipe.ingredients
        .filter((i) => i.isOwned && !i.isPantryStaple)
        .map((i) => ({ ingredientId: i.ingredientId, name: i.name, imageUri: i.imageUri, quantity: i.quantity, unit: i.unit })),
    );
  };

  const updateEstimateQuantity = (ingredientId: string, value: number) => {
    setEstimates((prev) => prev?.map((e) => (e.ingredientId === ingredientId ? { ...e, quantity: value } : e)) ?? null);
  };

  const handleUpdatePantry = async () => {
    if (!estimates || !pantryQuery.data) return;
    const items = estimates
      .filter((estimate) => estimate.quantity > 0)
      .map((estimate) => pantryQuery.data!.find((p) => p.ingredientId === estimate.ingredientId))
      .filter((pantryItem): pantryItem is NonNullable<typeof pantryItem> => !!pantryItem)
      .map((pantryItem) => ({ id: pantryItem.id, amountUsed: 1 }));

    await useSomeMany.mutateAsync(items);
    haptics.success();
    router.replace('/(tabs)/home');
  };

  if (estimates) {
    return (
      <Screen scroll contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Finished cooking?</Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>We estimate you used:</Text>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          {estimates.length === 0 ? (
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
              Nothing from your pantry to update.
            </Text>
          ) : (
            estimates.map((estimate) => (
              <View key={estimate.ingredientId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IngredientAvatar imageUri={estimate.imageUri} variant="row" />
                <Text style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1 }]}>{estimate.name}</Text>
                <Stepper
                  value={estimate.quantity}
                  onChange={(value) => updateEstimateQuantity(estimate.ingredientId, value)}
                  accessibilityLabel={estimate.name}
                />
                <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary, minWidth: 36 }]}>
                  {estimate.unit}
                </Text>
              </View>
            ))
          )}
        </View>

        <Button label="Update Pantry" onPress={handleUpdatePantry} loading={useSomeMany.isPending} fullWidth />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'space-between' }}>
      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}>
          Step {stepIndex + 1} of {steps.length}
        </Text>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
          <View
            style={{
              height: '100%',
              width: `${((stepIndex + 1) / steps.length) * 100}%`,
              backgroundColor: theme.colors.accent,
            }}
          />
        </View>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[theme.typography.title1, { color: theme.colors.textPrimary, textAlign: 'center' }]}>
          {steps[stepIndex]}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button label="Back" variant="secondary" disabled={stepIndex === 0} onPress={() => setStepIndex((i) => i - 1)} fullWidth />
        </View>
        <View style={{ flex: 1 }}>
          {stepIndex < steps.length - 1 ? (
            <Button label="Next" onPress={() => setStepIndex((i) => i + 1)} fullWidth />
          ) : (
            <Button label="Finished Cooking?" onPress={handleFinishCooking} fullWidth />
          )}
        </View>
      </View>
    </Screen>
  );
}
