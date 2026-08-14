import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button, Chip, Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { DayOfWeek, MealType } from '@/types';
import { DAY_LABELS, MEAL_TYPE_LABELS, MEAL_TYPES } from '../constants';

interface MoveMealModalProps {
  visible: boolean;
  currentDate?: string;
  currentMealSlot?: MealType;
  /** The currently-displayed week's dates, in day order - real dates, not the mock week-relative model. */
  weekDates: { day: DayOfWeek; date: string }[];
  onClose: () => void;
  onMove: (scheduledDate: string, mealSlot: MealType) => void;
}

export function MoveMealModal({ visible, currentDate, currentMealSlot, weekDates, onClose, onMove }: MoveMealModalProps) {
  const theme = useTheme();
  const [date, setDate] = useState(currentDate ?? weekDates[0]?.date ?? '');
  const [mealSlot, setMealSlot] = useState<MealType>(currentMealSlot ?? 'dinner');

  useEffect(() => {
    if (visible) {
      setDate(currentDate ?? weekDates[0]?.date ?? '');
      setMealSlot(currentMealSlot ?? 'dinner');
    }
  }, [visible, currentDate, currentMealSlot, weekDates]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>Move Meal</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Day</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {weekDates.map(({ day, date: d }) => (
              <Chip key={d} label={DAY_LABELS[day]} selected={date === d} onPress={() => setDate(d)} />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Meal</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MEAL_TYPES.map((m) => (
              <Chip key={m} label={MEAL_TYPE_LABELS[m]} selected={mealSlot === m} onPress={() => setMealSlot(m)} />
            ))}
          </View>
        </View>

        <View style={{ flex: 1 }} />
        <Button
          label="Move Meal"
          onPress={() => {
            if (!date) return;
            onMove(date, mealSlot);
            onClose();
          }}
          fullWidth
        />
      </Screen>
    </Modal>
  );
}
