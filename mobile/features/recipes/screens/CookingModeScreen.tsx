import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Chip, EmptyState, IngredientAvatar, LoadingState, Screen, Stepper, TextField } from '@/components';
import { useCancelCookingEvent, useCompleteCookingEvent, usePantry, useRecipe, useStartCookingEvent } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { DeductionInput } from '@/lib/validation/cookingSchemas';
import { CookingEvent, MealType, PantryItem } from '@/types';
import { haptics } from '@/utils/haptics';
import { generateId } from '@/utils/id';
import { PantryMatchCandidate, resolvePantryMatch, scaleRequestedQuantity, validateDeduction } from '@/utils/nutritionSnapshot';
import { PantryItemPickerModal } from '../components/PantryItemPickerModal';

type ScreenState = 'intro' | 'steps' | 'review';

interface DeductionRow {
  recipeIngredientId: string;
  /** Catalog ingredient id (or fallback) - used to tell an auto-suggested exact match apart from a manual remap. */
  ingredientId: string;
  ingredientName: string;
  imageUri: string;
  requestedQuantity: number;
  requestedUnit?: string;
  pantryItemId?: string;
  availableQuantity?: number;
  pantryUnit?: string;
  unitsCompatible: boolean;
  deductedQuantity: number;
  matchConfidence: DeductionInput['matchConfidence'];
  wasSkipped: boolean;
  notSourcedFromPantry: boolean;
}

const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toCandidate(item: PantryItem): PantryMatchCandidate {
  return { id: item.id, ingredientId: item.ingredientId, quantity: item.quantity, unit: item.unit, status: item.status ?? 'active' };
}

export function CookingModeScreen() {
  const theme = useTheme();
  const { id, planItemId } = useLocalSearchParams<{ id: string; planItemId?: string }>();
  const recipeQuery = useRecipe(id);
  const pantryQuery = usePantry();
  const startCooking = useStartCookingEvent();
  const cancelCooking = useCancelCookingEvent();
  const completeCooking = useCompleteCookingEvent();

  const [screenState, setScreenState] = useState<ScreenState>('intro');
  const [stepIndex, setStepIndex] = useState(0);
  const [cookingEvent, setCookingEvent] = useState<CookingEvent | null>(null);
  const [actualServingsPrepared, setActualServingsPrepared] = useState(1);
  const [batchWeightG, setBatchWeightG] = useState('');
  const [servingsConsumedNow, setServingsConsumedNow] = useState(1);
  const [mealType, setMealType] = useState<MealType>('dinner');
  const [deductionRows, setDeductionRows] = useState<DeductionRow[]>([]);
  const [remapRowIndex, setRemapRowIndex] = useState<number | null>(null);

  // Stable for the lifetime of this screen instance - reused on retry so a
  // dropped response after "Start Cooking" never creates a duplicate event.
  const [idempotencyKey] = useState(() => generateId('cooking-event'));

  if (recipeQuery.isLoading || pantryQuery.isLoading) {
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
  const pantry = pantryQuery.data ?? [];
  const steps = recipe.steps;
  const recipeVersionId = recipe.recipeVersionId ?? recipe.id;
  const nonStapleIngredients = recipe.ingredients.filter((ingredient) => !ingredient.isPantryStaple);

  function buildDeductionRows(servingsPrepared: number): DeductionRow[] {
    return nonStapleIngredients.map((ingredient) => {
      const requestedQuantity = scaleRequestedQuantity(ingredient.quantity, recipe.servings, servingsPrepared);
      const autoMatch = pantry.find((p) => p.status === 'active' && p.ingredientId === ingredient.ingredientId);
      const resolved = resolvePantryMatch(requestedQuantity, ingredient.unit, ingredient.ingredientId, autoMatch ? toCandidate(autoMatch) : null);
      return {
        recipeIngredientId: ingredient.recipeIngredientId ?? ingredient.ingredientId,
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.name,
        imageUri: ingredient.imageUri,
        requestedQuantity,
        requestedUnit: ingredient.unit,
        ...resolved,
      };
    });
  }

  const handleStartCooking = () => {
    startCooking.mutate(
      {
        recipeVersionId,
        mealPlanItemId: planItemId,
        plannedServings: recipe.servings,
        idempotencyKey,
      },
      {
        onSuccess: (event) => {
          setCookingEvent(event);
          setActualServingsPrepared(recipe.servings);
          setDeductionRows(buildDeductionRows(recipe.servings));
          setServingsConsumedNow(Math.min(1, recipe.servings));
          setScreenState('steps');
        },
        onError: (error) => Alert.alert('Could not start cooking', error instanceof Error ? error.message : 'Please try again.'),
      },
    );
  };

  const handleCancelCooking = () => {
    if (!cookingEvent) {
      router.back();
      return;
    }
    Alert.alert('Cancel cooking?', 'This discards your progress. Nothing will be deducted from your pantry.', [
      { text: 'Keep Cooking', style: 'cancel' },
      {
        text: 'Cancel Cooking',
        style: 'destructive',
        onPress: () => cancelCooking.mutate({ cookingEventId: cookingEvent.id }, { onSuccess: () => router.back() }),
      },
    ]);
  };

  // Rescaling preserves each row's current pantry-item selection (including
  // an explicit skip) and re-resolves it against that item's LIVE stock -
  // it never rebuilds the whole list from scratch, which would silently
  // discard a manual remap the user already made.
  const updateServingsPrepared = (value: number) => {
    setActualServingsPrepared(value);
    setDeductionRows((rows) =>
      rows.map((row, i) => {
        const ingredient = nonStapleIngredients[i];
        const requestedQuantity = scaleRequestedQuantity(ingredient.quantity, recipe.servings, value);
        const selected = row.pantryItemId ? pantry.find((p) => p.id === row.pantryItemId) : undefined;
        const resolved = resolvePantryMatch(requestedQuantity, row.requestedUnit, row.ingredientId, selected ? toCandidate(selected) : null);
        return { ...row, requestedQuantity, ...resolved };
      }),
    );
    setServingsConsumedNow((current) => Math.min(current, value));
  };

  const toggleRowSkipped = (index: number) => {
    setDeductionRows((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        if (!row.unitsCompatible) return row; // can't include a row with no valid match
        return { ...row, wasSkipped: !row.wasSkipped };
      }),
    );
  };

  const updateRowQuantity = (index: number, value: number) => {
    setDeductionRows((rows) => rows.map((row, i) => (i === index ? { ...row, deductedQuantity: value } : row)));
  };

  // Revalidates compatibility and stock against the newly-selected item -
  // never trusts the previous row's state. Selecting null explicitly skips.
  const remapRow = (index: number, item: PantryItem | null) => {
    setDeductionRows((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const resolved = resolvePantryMatch(row.requestedQuantity, row.requestedUnit, row.ingredientId, item ? toCandidate(item) : null);
        return { ...row, ...resolved };
      }),
    );
  };

  const handleFinishCooking = () => {
    if (!cookingEvent) return;

    // Only the final, user-confirmed mapping for each row is sent -
    // whatever is currently in deductionRows after any remapping.
    const deductions: DeductionInput[] = deductionRows.map((row) => ({
      recipeIngredientId: row.recipeIngredientId,
      pantryItemId: row.pantryItemId,
      requestedQuantity: row.requestedQuantity,
      requestedUnit: row.requestedUnit,
      deductedQuantity: row.wasSkipped ? 0 : row.deductedQuantity,
      deductedUnit: row.wasSkipped ? undefined : row.pantryUnit,
      matchConfidence: row.matchConfidence,
      userConfirmed: !row.wasSkipped,
      wasSkipped: row.wasSkipped,
    }));

    for (const row of deductionRows) {
      const result = validateDeduction({
        wasSkipped: row.wasSkipped,
        notSourcedFromPantry: row.notSourcedFromPantry,
        pantryItemId: row.pantryItemId,
        availableQuantity: row.availableQuantity,
        pantryUnit: row.pantryUnit,
        deductedQuantity: row.deductedQuantity,
        deductedUnit: row.wasSkipped ? undefined : row.pantryUnit,
        userConfirmed: !row.wasSkipped,
      });
      if (!result.ok) {
        Alert.alert('Check pantry amounts', `${row.ingredientName}: ${result.reason}`);
        return;
      }
    }

    completeCooking.mutate(
      {
        cookingEventId: cookingEvent.id,
        actualServingsPrepared,
        deductions,
        finalBatchWeightG: batchWeightG.trim() ? Number(batchWeightG.trim()) : undefined,
        servingsConsumedNow,
        mealType: servingsConsumedNow > 0 ? mealType : undefined,
      },
      {
        onSuccess: () => {
          haptics.success();
          router.replace('/(tabs)/home');
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Please try again.';
          if (message.toLowerCase().includes('already completed')) {
            // The server already applied this completion (e.g. a retry after
            // a dropped response) - treat it as done rather than a failure.
            router.replace('/(tabs)/home');
            return;
          }
          Alert.alert('Could not finish cooking', message);
        },
      },
    );
  };

  if (screenState === 'intro') {
    return (
      <Screen scroll contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>{recipe.title}</Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            Serves {recipe.servings} · {recipe.prepTimeMinutes + recipe.cookTimeMinutes} min
          </Text>
        </View>
        <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]}>
          Starting cooking begins a real cooking session - you'll review pantry amounts and log what you ate at the end.
        </Text>
        <View style={{ gap: 6 }}>
          {recipe.ingredients.map((ingredient) => (
            <Text key={ingredient.ingredientId} style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
              {ingredient.quantity} {ingredient.unit} {ingredient.name}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <Button label="Start Cooking" onPress={handleStartCooking} loading={startCooking.isPending} fullWidth />
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} fullWidth />
      </Screen>
    );
  }

  if (screenState === 'steps') {
    return (
      <Screen contentContainerStyle={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'space-between' }}>
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}>
              Step {stepIndex + 1} of {steps.length}
            </Text>
            <Pressable onPress={handleCancelCooking} accessibilityRole="button" accessibilityLabel="Cancel cooking">
              <Text style={[theme.typography.subhead, { color: theme.colors.textTertiary }]}>Cancel</Text>
            </Pressable>
          </View>
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
              <Button label="Finished Cooking?" onPress={() => setScreenState('review')} fullWidth />
            )}
          </View>
        </View>
      </Screen>
    );
  }

  // screenState === 'review'
  const remapTarget = remapRowIndex != null ? deductionRows[remapRowIndex] : null;

  return (
    <Screen scroll contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
      <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Finish cooking</Text>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>Servings prepared</Text>
        <Stepper value={actualServingsPrepared} onChange={updateServingsPrepared} min={0.5} step={0.5} accessibilityLabel="servings prepared" />
      </View>

      <TextField
        label="Batch weight in grams (optional)"
        value={batchWeightG}
        onChangeText={setBatchWeightG}
        keyboardType="numeric"
        placeholder="e.g. 850"
      />

      {recipe.nutritionStatus === 'incomplete' ? (
        <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]}>
          This recipe's nutrition is incomplete - some values will be shown as unknown, not zero.
        </Text>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Pantry ingredients used</Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
          Review before finishing - only confirmed amounts are deducted from your pantry. Tap "Change" to pick a different pantry item.
        </Text>
        {deductionRows.length === 0 ? (
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Nothing from your pantry to update.</Text>
        ) : (
          deductionRows.map((row, index) => (
            <View
              key={row.recipeIngredientId}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: theme.spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                opacity: row.wasSkipped ? 0.55 : 1,
              }}
            >
              <IngredientAvatar imageUri={row.imageUri} variant="row" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{row.ingredientName}</Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                  {row.notSourcedFromPantry
                    ? 'Not sourced from pantry - skipped'
                    : !row.unitsCompatible
                      ? `Unit mismatch (have ${row.pantryUnit}, need ${row.requestedUnit}) - skipped`
                      : `${row.matchConfidence === 'exact' ? 'Matched' : 'Manually matched'} · ${row.availableQuantity} ${row.pantryUnit} available`}
                </Text>
                {row.unitsCompatible && !row.wasSkipped ? (
                  <Stepper
                    value={row.deductedQuantity}
                    onChange={(value) => updateRowQuantity(index, value)}
                    min={0}
                    max={row.availableQuantity ?? 0}
                    step={row.pantryUnit === 'item' ? 1 : 0.5}
                    accessibilityLabel={row.ingredientName}
                  />
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Pressable onPress={() => setRemapRowIndex(index)} accessibilityRole="button" accessibilityLabel={`Change pantry match for ${row.ingredientName}`}>
                  <Text style={[theme.typography.caption, { color: theme.colors.accent }]}>Change</Text>
                </Pressable>
                {row.unitsCompatible ? (
                  <Pressable onPress={() => toggleRowSkipped(index)} accessibilityRole="button" accessibilityLabel={`${row.wasSkipped ? 'Include' : 'Skip'} ${row.ingredientName}`}>
                    <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{row.wasSkipped ? 'Include' : 'Skip'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>Eating now</Text>
        <Stepper
          value={servingsConsumedNow}
          onChange={setServingsConsumedNow}
          min={0}
          max={actualServingsPrepared}
          step={0.5}
          accessibilityLabel="servings eating now"
        />
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
          {servingsConsumedNow === 0
            ? "You won't log anything yet - the rest is saved as leftovers you can log later."
            : `${round2(actualServingsPrepared - servingsConsumedNow)} serving(s) will be saved as leftovers.`}
        </Text>
      </View>

      {servingsConsumedNow > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {MEAL_TYPE_OPTIONS.map((option) => (
            <Chip key={option.value} label={option.label} selected={mealType === option.value} onPress={() => setMealType(option.value)} />
          ))}
        </ScrollView>
      ) : null}

      <Button
        label={servingsConsumedNow > 0 ? 'Finish and Log' : 'Finish Without Logging'}
        onPress={handleFinishCooking}
        loading={completeCooking.isPending}
        fullWidth
      />

      <PantryItemPickerModal
        visible={remapRowIndex != null}
        ingredientName={remapTarget?.ingredientName ?? ''}
        requestedQuantity={remapTarget?.requestedQuantity ?? 0}
        requestedUnit={remapTarget?.requestedUnit}
        pantryItems={pantry}
        onClose={() => setRemapRowIndex(null)}
        onSelect={(item) => {
          if (remapRowIndex != null) remapRow(remapRowIndex, item);
        }}
      />
    </Screen>
  );
}
