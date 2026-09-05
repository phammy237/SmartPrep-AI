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
import {
  autoResolvePantryMatch,
  confirmPartialDeduction,
  PantryDeductionRowState,
  PantryMatchCandidate,
  rescalePantryMatch,
  scaleRequestedQuantity,
  skipPantryDeduction,
  validateDeduction,
} from '@/utils/nutritionSnapshot';
import { PantryItemPickerModal } from '../components/PantryItemPickerModal';

type ScreenState = 'intro' | 'steps' | 'review';

interface DeductionRow {
  recipeIngredientId: string;
  ingredientId: string;
  ingredientName: string;
  imageUri: string;
  requiredUnit?: string;
  match: PantryDeductionRowState;
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
      const requiredQuantity = scaleRequestedQuantity(ingredient.quantity, recipe.servings, servingsPrepared);
      const autoMatch = pantry.find((p) => p.status === 'active' && p.ingredientId === ingredient.ingredientId);
      return {
        recipeIngredientId: ingredient.recipeIngredientId ?? ingredient.ingredientId,
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.name,
        imageUri: ingredient.imageUri,
        requiredUnit: ingredient.unit,
        match: autoResolvePantryMatch(requiredQuantity, ingredient.unit, ingredient.ingredientId, autoMatch ? toCandidate(autoMatch) : null),
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

  // Recalculates the required quantity for every row and re-resolves each
  // against the SAME pantry item it currently has (an intentional manual
  // remap is preserved, never silently reverted) - but a previous 'partial'
  // confirmation is never carried forward as-is: rescalePantryMatch always
  // recomputes fresh, so if the new amount is still short, the row drops
  // back to 'needs_decision' and must be explicitly reconfirmed.
  const updateServingsPrepared = (value: number) => {
    setActualServingsPrepared(value);
    setDeductionRows((rows) =>
      rows.map((row, i) => {
        const ingredient = nonStapleIngredients[i];
        const requiredQuantity = scaleRequestedQuantity(ingredient.quantity, recipe.servings, value);
        const selected = row.match.pantryItemId ? pantry.find((p) => p.id === row.match.pantryItemId) : undefined;
        return { ...row, match: rescalePantryMatch(row.match, requiredQuantity, row.requiredUnit, row.ingredientId, selected ? toCandidate(selected) : null) };
      }),
    );
    setServingsConsumedNow((current) => Math.min(current, value));
  };

  const skipRow = (index: number) => {
    setDeductionRows((rows) => rows.map((row, i) => (i === index ? { ...row, match: skipPantryDeduction(row.match) } : row)));
  };

  const confirmPartialForRow = (index: number) => {
    const row = deductionRows[index];
    if (!row || row.match.resolution !== 'needs_decision') return;
    Alert.alert(
      'Use a partial amount?',
      `Only ${row.match.availableQuantity} ${row.match.pantryUnit} of ${row.ingredientName} is available (need ${row.match.requiredQuantity} ${row.requiredUnit}). ` +
        `The ${round2(row.match.requiredQuantity - (row.match.availableQuantity ?? 0))} ${row.requiredUnit} shortfall will be recorded as sourced from elsewhere, not deducted from your pantry.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Partial Amount',
          onPress: () =>
            setDeductionRows((rows) => rows.map((r, i) => (i === index ? { ...r, match: confirmPartialDeduction(r.match) } : r))),
        },
      ],
    );
  };

  // Revalidates compatibility and live stock against the newly-selected item
  // from scratch - never trusts the previous row's state.
  const remapRow = (index: number, item: PantryItem | null) => {
    setDeductionRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, match: autoResolvePantryMatch(row.match.requiredQuantity, row.requiredUnit, row.ingredientId, item ? toCandidate(item) : null) } : row)),
    );
  };

  const handleFinishCooking = () => {
    if (!cookingEvent) return;

    const unresolved = deductionRows.filter((row) => row.match.resolution === 'needs_decision');
    if (unresolved.length > 0) {
      Alert.alert(
        'Pantry amounts need a decision',
        `${unresolved.map((r) => r.ingredientName).join(', ')}: choose a different pantry item, use the available partial amount, skip it, or reduce servings prepared above before finishing.`,
      );
      return;
    }

    // Only the final, user-confirmed resolution for each row is sent.
    const deductions: DeductionInput[] = deductionRows.map((row) => {
      const m = row.match;
      const wasSkipped = m.resolution === 'skipped' || m.resolution === 'unmatched' || m.resolution === 'incompatible';
      return {
        recipeIngredientId: row.recipeIngredientId,
        pantryItemId: m.pantryItemId,
        requestedQuantity: m.requiredQuantity,
        requestedUnit: row.requiredUnit,
        deductedQuantity: wasSkipped ? 0 : m.deductedQuantity,
        deductedUnit: wasSkipped ? undefined : m.pantryUnit,
        matchConfidence: m.matchConfidence,
        userConfirmed: !wasSkipped,
        wasSkipped,
      };
    });

    for (const row of deductionRows) {
      const m = row.match;
      const wasSkipped = m.resolution === 'skipped' || m.resolution === 'unmatched' || m.resolution === 'incompatible';
      const result = validateDeduction({
        wasSkipped,
        notSourcedFromPantry: m.resolution === 'unmatched',
        pantryItemId: m.pantryItemId,
        availableQuantity: m.availableQuantity,
        pantryUnit: m.pantryUnit,
        deductedQuantity: m.deductedQuantity,
        deductedUnit: wasSkipped ? undefined : m.pantryUnit,
        userConfirmed: !wasSkipped,
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
          // The server independently re-validates live stock at completion
          // time and rejects the WHOLE transaction if anything (including a
          // remapped/partially-confirmed row) now exceeds what's actually on
          // hand - e.g. it changed after this screen loaded. Surface that
          // plainly rather than pretending it partially succeeded.
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
          Review before finishing - only confirmed amounts are deducted from your pantry.
        </Text>
        {deductionRows.length === 0 ? (
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Nothing from your pantry to update.</Text>
        ) : (
          deductionRows.map((row, index) => {
            const m = row.match;
            const isProblem = m.resolution === 'needs_decision';
            return (
              <View
                key={row.recipeIngredientId}
                style={{
                  gap: 8,
                  paddingVertical: theme.spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  opacity: m.resolution === 'skipped' || m.resolution === 'unmatched' || m.resolution === 'incompatible' ? 0.55 : 1,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <IngredientAvatar imageUri={row.imageUri} variant="row" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{row.ingredientName}</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                      Needs {m.requiredQuantity} {row.requiredUnit}
                    </Text>
                  </View>
                </View>

                {m.resolution === 'unmatched' ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Not in your pantry - skipped</Text>
                ) : null}
                {m.resolution === 'incompatible' ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                    Unit mismatch (have {m.pantryUnit}) - skipped
                  </Text>
                ) : null}
                {m.resolution === 'skipped' ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Skipped - not deducted</Text>
                ) : null}
                {m.resolution === 'full' ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.accent }]}>
                    Deducting {m.deductedQuantity} {m.pantryUnit} · {m.availableQuantity} {m.pantryUnit} available
                  </Text>
                ) : null}
                {m.resolution === 'partial' ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.freshness.useSoon }]}>
                    Partial: deducting {m.deductedQuantity} of {m.requiredQuantity} {row.requiredUnit} · {m.uncoveredQuantity} {row.requiredUnit} from elsewhere
                  </Text>
                ) : null}
                {isProblem ? (
                  <Text style={[theme.typography.footnote, { color: theme.colors.freshness.prioritize }]}>
                    Only {m.availableQuantity} {m.pantryUnit} available - short by {m.shortfall} {row.requiredUnit}. Choose an option below.
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <Pressable onPress={() => setRemapRowIndex(index)} accessibilityRole="button" accessibilityLabel={`Change pantry match for ${row.ingredientName}`}>
                    <Text style={[theme.typography.caption, { color: theme.colors.accent }]}>Change Item</Text>
                  </Pressable>
                  {isProblem ? (
                    <Pressable onPress={() => confirmPartialForRow(index)} accessibilityRole="button" accessibilityLabel={`Use available partial amount for ${row.ingredientName}`}>
                      <Text style={[theme.typography.caption, { color: theme.colors.accent }]}>Use Partial Amount</Text>
                    </Pressable>
                  ) : null}
                  {m.resolution !== 'skipped' ? (
                    <Pressable onPress={() => skipRow(index)} accessibilityRole="button" accessibilityLabel={`Skip ${row.ingredientName}`}>
                      <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Skip</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
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
        requestedQuantity={remapTarget?.match.requiredQuantity ?? 0}
        requestedUnit={remapTarget?.requiredUnit}
        pantryItems={pantry}
        onClose={() => setRemapRowIndex(null)}
        onSelect={(item) => {
          if (remapRowIndex != null) remapRow(remapRowIndex, item);
        }}
      />
    </Screen>
  );
}
