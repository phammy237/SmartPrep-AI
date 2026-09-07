import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Chip, EmptyState, IngredientAvatar, LoadingState, Screen, Stepper, TextField } from '@/components';
import {
  useCancelCookingEvent,
  useCompleteCookingEvent,
  useConversionMeta,
  usePantry,
  useRecipe,
  useStartCookingEvent,
  useUser,
} from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import {
  IngredientDeductionPlan,
  applyPartialConfirmation,
  applySkip,
  buildCookingPantryIndex,
  cookingLotsForIngredient,
  proposeIngredientDeduction,
  rescaleForServings,
} from '@/lib/cooking';
import { ExpiryState } from '@/lib/freshness';
import { IngredientConversionMeta } from '@/lib/nutrition/conversion';
import { DeductionInput } from '@/lib/validation/cookingSchemas';
import { CookingEvent, MealType, PantryItem } from '@/types';
import { haptics } from '@/utils/haptics';
import { generateId } from '@/utils/id';
import { scaleRequestedQuantity, validateDeduction } from '@/utils/nutritionSnapshot';
import { PantryItemPickerModal } from '../components/PantryItemPickerModal';

type ScreenState = 'intro' | 'steps' | 'review';

interface DeductionRow {
  imageUri: string;
  plan: IngredientDeductionPlan;
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

export function CookingModeScreen() {
  const theme = useTheme();
  const { id, planItemId } = useLocalSearchParams<{ id: string; planItemId?: string }>();
  const recipeQuery = useRecipe(id);
  const pantryQuery = usePantry();
  const timeZone = useUser().data?.timezone ?? 'UTC';
  const conversionMetaQuery = useConversionMeta(recipeQuery.data?.ingredients.map((i) => i.ingredientId) ?? []);
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
  // dropped response after "Start Cooking" never creates a duplicate event,
  // and gives the FEFO expiry math one fixed "now".
  const [idempotencyKey] = useState(() => generateId('cooking-event'));
  const [now] = useState(() => new Date());

  if (recipeQuery.isLoading || pantryQuery.isLoading || conversionMetaQuery.isLoading) {
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
  const conversionMeta: Map<string, IngredientConversionMeta> = conversionMetaQuery.data ?? new Map();
  const steps = recipe.steps;
  const recipeVersionId = recipe.recipeVersionId ?? recipe.id;
  const nonStapleIngredients = recipe.ingredients.filter((ingredient) => !ingredient.isPantryStaple);

  const buildIndex = () => buildCookingPantryIndex(pantry, timeZone, now);

  // FEFO proposal, one plan per non-staple recipe ingredient. The pantry index
  // + conversion metadata are built ONCE here, never per ingredient.
  function buildPlans(servingsPrepared: number): DeductionRow[] {
    const index = buildIndex();
    return nonStapleIngredients.map((ingredient) => {
      const requiredQuantity = scaleRequestedQuantity(ingredient.quantity, recipe.servings, servingsPrepared);
      const lots = cookingLotsForIngredient(ingredient, index);
      return {
        imageUri: ingredient.imageUri,
        plan: proposeIngredientDeduction({
          recipeIngredientId: ingredient.recipeIngredientId ?? ingredient.ingredientId,
          ingredientId: ingredient.ingredientId,
          ingredientName: ingredient.name,
          requiredQuantity,
          requiredUnit: ingredient.unit,
          lots,
          conversionMeta: conversionMeta.get(ingredient.ingredientId),
        }),
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
          setDeductionRows(buildPlans(recipe.servings));
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

  // Recomputes every plan for the new batch size. A deliberate skip survives; a
  // manual lot choice is re-run against THAT lot only (never reverted to the
  // FEFO auto-pick); every other plan is recomputed fresh, so a stale partial
  // confirmation drops back to a decision if it no longer covers the amount.
  const updateServingsPrepared = (value: number) => {
    setActualServingsPrepared(value);
    const index = buildIndex();
    setDeductionRows((rows) =>
      rows.map((row, i) => {
        const ingredient = nonStapleIngredients[i];
        const requiredQuantity = scaleRequestedQuantity(ingredient.quantity, recipe.servings, value);
        const lots = cookingLotsForIngredient(ingredient, index);
        return { ...row, plan: rescaleForServings(row.plan, requiredQuantity, lots, conversionMeta.get(ingredient.ingredientId)) };
      }),
    );
    setServingsConsumedNow((current) => Math.min(current, value));
  };

  const skipRow = (rowIndex: number) => {
    setDeductionRows((rows) => rows.map((row, i) => (i === rowIndex ? { ...row, plan: applySkip(row.plan) } : row)));
  };

  const confirmPartialForRow = (rowIndex: number) => {
    const row = deductionRows[rowIndex];
    if (!row || row.plan.status !== 'needs_decision') return;
    Alert.alert(
      'Use a partial amount?',
      `Only ${round2(row.plan.coveredQuantity)} ${row.plan.coveredUnit} of ${row.plan.ingredientName} is available (need ${round2(row.plan.requiredQuantity)} ${row.plan.requiredUnit ?? ''}). ` +
        `The ${round2(row.plan.uncoveredQuantity)} ${row.plan.coveredUnit} shortfall will be recorded as sourced from elsewhere, not deducted from your pantry.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Partial Amount',
          onPress: () =>
            setDeductionRows((rows) =>
              rows.map((r, i) => (i === rowIndex ? { ...r, plan: applyPartialConfirmation(r.plan) } : r)),
            ),
        },
      ],
    );
  };

  // User hand-picks a replacement pantry lot. We re-run the FEFO proposal
  // restricted to that lot (deterministic, still respects unit rules) and flag
  // it as a manual override so a later servings change won't silently revert it.
  const remapRow = (rowIndex: number, item: PantryItem | null) => {
    const ingredient = nonStapleIngredients[rowIndex];
    if (!ingredient) return;
    const index = buildIndex();
    const lots = cookingLotsForIngredient(ingredient, index);
    setDeductionRows((rows) =>
      rows.map((row, i) => {
        if (i !== rowIndex) return row;
        if (!item) return { ...row, plan: applySkip({ ...row.plan, manualOverride: true }) };
        return {
          ...row,
          plan: proposeIngredientDeduction({
            recipeIngredientId: row.plan.recipeIngredientId,
            ingredientId: ingredient.ingredientId,
            ingredientName: ingredient.name,
            requiredQuantity: row.plan.requiredQuantity,
            requiredUnit: ingredient.unit,
            lots,
            conversionMeta: conversionMeta.get(ingredient.ingredientId),
            restrictToLotIds: [item.id],
            manualOverride: true,
          }),
        };
      }),
    );
  };

  const handleFinishCooking = () => {
    if (!cookingEvent) return;

    const unresolved = deductionRows.filter(
      (row) => row.plan.status === 'needs_decision' || row.plan.status === 'unresolved_unit',
    );
    if (unresolved.length > 0) {
      Alert.alert(
        'Pantry amounts need a decision',
        `${unresolved.map((r) => r.plan.ingredientName).join(', ')}: choose a different pantry item, use the available partial amount, skip it, or reduce servings prepared above before finishing.`,
      );
      return;
    }

    // One deduction row per pantry lot actually used - complete_cooking_event
    // accepts multiple rows for the same recipe ingredient and applies them all
    // inside one transaction.
    const deductions: DeductionInput[] = deductionRows.flatMap((row): DeductionInput[] => {
      const plan = row.plan;
      if (plan.status === 'skipped' || plan.status === 'unmatched') {
        return [
          {
            recipeIngredientId: plan.recipeIngredientId,
            pantryItemId: undefined,
            requestedQuantity: plan.requiredQuantity,
            requestedUnit: plan.requiredUnit,
            deductedQuantity: 0,
            deductedUnit: undefined,
            userConfirmed: false,
            wasSkipped: true,
          },
        ];
      }
      return plan.allocations.map((alloc, i) => ({
        recipeIngredientId: plan.recipeIngredientId,
        pantryItemId: alloc.pantryItemId,
        // Attribute the recipe's ask to the first row only, so the ledger never
        // double-counts the requirement across a multi-lot deduction.
        requestedQuantity: i === 0 ? plan.requiredQuantity : 0,
        requestedUnit: plan.requiredUnit,
        deductedQuantity: alloc.proposedDeduction,
        deductedUnit: alloc.unit,
        matchConfidence: alloc.matchConfidence,
        userConfirmed: true,
        wasSkipped: false,
      }));
    });

    for (const row of deductionRows) {
      const plan = row.plan;
      if (plan.status === 'skipped' || plan.status === 'unmatched') continue;
      for (const alloc of plan.allocations) {
        const result = validateDeduction({
          wasSkipped: false,
          notSourcedFromPantry: false,
          pantryItemId: alloc.pantryItemId,
          availableQuantity: alloc.availableQuantity,
          pantryUnit: alloc.unit,
          deductedQuantity: alloc.proposedDeduction,
          deductedUnit: alloc.unit,
          userConfirmed: true,
        });
        if (!result.ok) {
          Alert.alert('Check pantry amounts', `${plan.ingredientName}: ${result.reason}`);
          return;
        }
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
          // The server independently re-validates live stock at completion time
          // and rejects the WHOLE transaction if any single lot (including a
          // remapped or partially-confirmed one) now exceeds what's actually on
          // hand - e.g. another session changed it after this screen loaded.
          // Surface that plainly rather than pretending it partially succeeded.
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
  const freshnessColor = (state: ExpiryState): string => {
    if (state === 'expired' || state === 'critical') return theme.colors.freshness.prioritize;
    if (state === 'use_soon') return theme.colors.freshness.useSoon;
    return theme.colors.textTertiary;
  };

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
          SmartPrep proposes the items that should be used first. Review before finishing - only confirmed amounts are deducted.
        </Text>
        {deductionRows.length === 0 ? (
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Nothing from your pantry to update.</Text>
        ) : (
          deductionRows.map((row, index) => {
            const plan = row.plan;
            const dimmed = plan.status === 'skipped' || plan.status === 'unmatched';
            return (
              <View
                key={plan.recipeIngredientId}
                style={{
                  gap: 8,
                  paddingVertical: theme.spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  opacity: dimmed ? 0.55 : 1,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <IngredientAvatar imageUri={row.imageUri} variant="row" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{plan.ingredientName}</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                      Needs {round2(plan.requiredQuantity)} {plan.requiredUnit}
                    </Text>
                  </View>
                </View>

                {plan.allocations.map((alloc) => (
                  <View key={alloc.pantryItemId} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <Text style={[theme.typography.caption, { color: theme.colors.textPrimary }]}>
                      {round2(alloc.proposedDeduction)} {alloc.unit}
                    </Text>
                    <Text style={[theme.typography.caption, { color: freshnessColor(alloc.freshnessState) }]}>
                      · {alloc.freshnessPhrase}
                    </Text>
                  </View>
                ))}

                {plan.allocations.length > 1 || (plan.fefoApplied && plan.status === 'ready') ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                    SmartPrep selected the items that should be used first.
                  </Text>
                ) : null}

                {plan.status === 'partial' ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.freshness.useSoon }]}>
                    {round2(plan.uncoveredQuantity)} {plan.coveredUnit} will come from elsewhere - not deducted from your pantry.
                  </Text>
                ) : null}
                {plan.status === 'needs_decision' ? (
                  <Text style={[theme.typography.footnote, { color: theme.colors.freshness.prioritize }]}>
                    Short by {round2(plan.uncoveredQuantity)} {plan.coveredUnit}. Choose an option below.
                  </Text>
                ) : null}
                {plan.status === 'unresolved_unit' ? (
                  <Text style={[theme.typography.footnote, { color: theme.colors.freshness.prioritize }]}>
                    Can't compare {plan.requiredUnit} to what's in your pantry confidently - pick a lot or skip it.
                  </Text>
                ) : null}
                {plan.status === 'unmatched' ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Not in your pantry - nothing to deduct.</Text>
                ) : null}
                {plan.status === 'skipped' ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Skipped - not deducted.</Text>
                ) : null}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <Pressable onPress={() => setRemapRowIndex(index)} accessibilityRole="button" accessibilityLabel={`Change pantry match for ${plan.ingredientName}`}>
                    <Text style={[theme.typography.caption, { color: theme.colors.accent }]}>Change Item</Text>
                  </Pressable>
                  {plan.status === 'needs_decision' ? (
                    <Pressable onPress={() => confirmPartialForRow(index)} accessibilityRole="button" accessibilityLabel={`Use available partial amount for ${plan.ingredientName}`}>
                      <Text style={[theme.typography.caption, { color: theme.colors.accent }]}>Use Partial Amount</Text>
                    </Pressable>
                  ) : null}
                  {plan.status !== 'skipped' ? (
                    <Pressable onPress={() => skipRow(index)} accessibilityRole="button" accessibilityLabel={`Skip ${plan.ingredientName}`}>
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
        ingredientName={remapTarget?.plan.ingredientName ?? ''}
        requestedQuantity={remapTarget?.plan.requiredQuantity ?? 0}
        requestedUnit={remapTarget?.plan.requiredUnit}
        pantryItems={pantry}
        onClose={() => setRemapRowIndex(null)}
        onSelect={(item) => {
          if (remapRowIndex != null) remapRow(remapRowIndex, item);
        }}
      />
    </Screen>
  );
}
