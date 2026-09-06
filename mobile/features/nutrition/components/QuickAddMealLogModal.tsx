import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Chip, Screen, TextField } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { MealType, NutritionSnapshot } from '@/types';

const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

interface QuickAddMealLogModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (input: { mealType: MealType; nutrition: NutritionSnapshot; notes?: string }) => void;
  submitting?: boolean;
}

function parseOptionalNonNegative(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * A calories-only entry stays calories-only: leaving protein/carbs/fat blank
 * means unknown, never fabricated as 0. status is 'incomplete' whenever any
 * of the four core macros is left blank, 'estimated' when all four are given
 * (still self-reported, never claimed as lab-verified).
 */
export function QuickAddMealLogModal({ visible, onClose, onAdd, submitting }: QuickAddMealLogModalProps) {
  const theme = useTheme();
  const [mealType, setMealType] = useState<MealType>('snack');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | undefined>();

  const reset = () => {
    setMealType('snack');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setNotes('');
    setError(undefined);
  };

  const handleAdd = () => {
    const caloriesValue = parseOptionalNonNegative(calories);
    const proteinValue = parseOptionalNonNegative(protein);
    const carbsValue = parseOptionalNonNegative(carbs);
    const fatValue = parseOptionalNonNegative(fat);

    if (caloriesValue === null && proteinValue === null && carbsValue === null && fatValue === null) {
      setError('Enter at least one value');
      return;
    }
    if (
      (calories.trim() && caloriesValue === null) ||
      (protein.trim() && proteinValue === null) ||
      (carbs.trim() && carbsValue === null) ||
      (fat.trim() && fatValue === null)
    ) {
      setError('Enter valid, non-negative numbers');
      return;
    }

    const isComplete = caloriesValue !== null && proteinValue !== null && carbsValue !== null && fatValue !== null;

    onAdd({
      mealType,
      nutrition: {
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
      notes: notes.trim() || undefined,
    });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>Quick Add</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

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
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" autoCapitalize="sentences" />

        {error ? <Text style={[theme.typography.footnote, { color: theme.colors.freshness.prioritize }]}>{error}</Text> : null}

        <View style={{ flex: 1 }} />
        <Button label="Add" onPress={handleAdd} loading={submitting} fullWidth />
      </Screen>
    </Modal>
  );
}
