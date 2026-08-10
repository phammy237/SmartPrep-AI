import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button, Chip, Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { DayOfWeek, MealPlanItem, MealType } from '@/types';
import { DAY_LABELS, DAY_ORDER, MEAL_TYPE_LABELS, MEAL_TYPES } from '../constants';

interface MoveMealModalProps {
  item: MealPlanItem | null;
  onClose: () => void;
  onMove: (day: DayOfWeek, mealType: MealType) => void;
}

export function MoveMealModal({ item, onClose, onMove }: MoveMealModalProps) {
  const theme = useTheme();
  const [day, setDay] = useState<DayOfWeek>(item?.day ?? 'mon');
  const [mealType, setMealType] = useState<MealType>(item?.mealType ?? 'dinner');

  React.useEffect(() => {
    if (item) {
      setDay(item.day);
      setMealType(item.mealType);
    }
  }, [item]);

  return (
    <Modal visible={!!item} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
            {DAY_ORDER.map((d) => (
              <Chip key={d} label={DAY_LABELS[d]} selected={day === d} onPress={() => setDay(d)} />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Meal</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {MEAL_TYPES.map((m) => (
              <Chip key={m} label={MEAL_TYPE_LABELS[m]} selected={mealType === m} onPress={() => setMealType(m)} />
            ))}
          </View>
        </View>

        <View style={{ flex: 1 }} />
        <Button
          label="Move Meal"
          onPress={() => {
            onMove(day, mealType);
            onClose();
          }}
          fullWidth
        />
      </Screen>
    </Modal>
  );
}
