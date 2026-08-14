import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Chip, Screen, TextField } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { MealLog, MealType, NutritionSnapshot } from '@/types';

const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export interface CorrectMealLogSubmission {
  reason: string;
  newMealType: MealType;
  newNutrition: NutritionSnapshot;
  newServingsConsumed?: number;
  newNotes?: string;
  newConsumedAt?: string;
}

interface CorrectMealLogModalProps {
  visible: boolean;
  log: MealLog | null;
  onClose: () => void;
  onSubmit: (input: CorrectMealLogSubmission) => void;
  submitting?: boolean;
}

function numberToText(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

function parseOptionalNonNegative(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** "YYYY-MM-DDTHH:MM" local-ish text -> a real Date, or null if unparseable. No native date-picker dependency, matching the existing plain-text-date pattern used for pantry dates. */
function parseConsumedAtInput(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Correction flow for a historical meal log: voids the original and creates
 * a typed replacement atomically (correct_meal_log) - the original's
 * nutrition snapshot is never mutated in place. Requires a reason and an
 * explicit confirmation step before submitting.
 */
export function CorrectMealLogModal({ visible, log, onClose, onSubmit, submitting }: CorrectMealLogModalProps) {
  const theme = useTheme();
  const [mealType, setMealType] = useState<MealType>('snack');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [servings, setServings] = useState('');
  const [notes, setNotes] = useState('');
  const [consumedAt, setConsumedAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible || !log) return;
    setMealType(log.mealType);
    setCalories(numberToText(log.nutritionSnapshot.calories));
    setProtein(numberToText(log.nutritionSnapshot.proteinG));
    setCarbs(numberToText(log.nutritionSnapshot.carbsG));
    setFat(numberToText(log.nutritionSnapshot.fatG));
    setServings(numberToText(log.servingsConsumed));
    setNotes(log.notes ?? '');
    setConsumedAt('');
    setReason('');
    setError(undefined);
  }, [visible, log]);

  if (!log) return null;

  const handleSave = () => {
    const caloriesValue = parseOptionalNonNegative(calories);
    const proteinValue = parseOptionalNonNegative(protein);
    const carbsValue = parseOptionalNonNegative(carbs);
    const fatValue = parseOptionalNonNegative(fat);
    const servingsValue = parseOptionalNonNegative(servings);

    if (!reason.trim()) {
      setError('Enter a reason for this correction');
      return;
    }
    if (caloriesValue === null && proteinValue === null && carbsValue === null && fatValue === null) {
      setError('Enter at least one nutrition value');
      return;
    }
    if (
      (calories.trim() && caloriesValue === null) ||
      (protein.trim() && proteinValue === null) ||
      (carbs.trim() && carbsValue === null) ||
      (fat.trim() && fatValue === null) ||
      (servings.trim() && servingsValue === null)
    ) {
      setError('Enter valid, non-negative numbers');
      return;
    }
    if (servingsValue === 0) {
      setError('Servings must be greater than zero');
      return;
    }

    let consumedAtIso: string | undefined;
    if (consumedAt.trim()) {
      const parsed = parseConsumedAtInput(consumedAt);
      if (!parsed) {
        setError('Enter a valid date/time, e.g. 2026-08-13T18:30');
        return;
      }
      consumedAtIso = parsed.toISOString();
    }

    setError(undefined);
    const isComplete = caloriesValue !== null && proteinValue !== null && carbsValue !== null && fatValue !== null;

    const submission: CorrectMealLogSubmission = {
      reason: reason.trim(),
      newMealType: mealType,
      newNutrition: {
        calories: caloriesValue,
        proteinG: proteinValue,
        carbsG: carbsValue,
        fatG: fatValue,
        fiberG: null,
        sugarG: null,
        sodiumMg: null,
        status: isComplete ? 'estimated' : 'incomplete',
        calculationBasis: 'manual_entry',
      },
      newServingsConsumed: servingsValue ?? undefined,
      newNotes: notes.trim() || undefined,
      newConsumedAt: consumedAtIso,
    };

    Alert.alert(
      'Save this correction?',
      'The original entry is kept as voided history and excluded from your totals - only the corrected replacement counts.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save Correction', onPress: () => onSubmit(submission) },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>Correct Entry</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
          This keeps the original entry as immutable history and creates a corrected replacement - it never edits the original in place.
        </Text>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Meal</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MEAL_TYPE_OPTIONS.map((option) => (
              <Chip key={option.value} label={option.label} selected={mealType === option.value} onPress={() => setMealType(option.value)} />
            ))}
          </ScrollView>
        </View>

        <TextField label="Calories" value={calories} onChangeText={setCalories} keyboardType="numeric" placeholder="e.g. 250" />
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="numeric" placeholder="Optional" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="numeric" placeholder="Optional" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="numeric" placeholder="Optional" />
          </View>
        </View>

        <TextField label="Servings consumed (optional)" value={servings} onChangeText={setServings} keyboardType="numeric" placeholder="Optional" />
        <TextField
          label="Consumed at (optional)"
          value={consumedAt}
          onChangeText={setConsumedAt}
          placeholder="e.g. 2026-08-13T18:30 (leave blank to keep original time)"
        />
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" autoCapitalize="sentences" />
        <TextField label="Reason for correction (required)" value={reason} onChangeText={setReason} placeholder="e.g. Entered the wrong calories" autoCapitalize="sentences" />

        {error ? <Text style={[theme.typography.footnote, { color: theme.colors.freshness.prioritize }]}>{error}</Text> : null}

        <View style={{ flex: 1 }} />
        <Button label="Save Correction" onPress={handleSave} loading={submitting} fullWidth />
      </Screen>
    </Modal>
  );
}
