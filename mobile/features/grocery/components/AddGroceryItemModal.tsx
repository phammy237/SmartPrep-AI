import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, Chip, Screen, Stepper } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { IngredientCategory, QuantityUnit } from '@/types';
import { ManualGroceryItemInput } from '@/services';

const CATEGORY_OPTIONS: { value: IngredientCategory; label: string }[] = [
  { value: 'produce', label: 'Produce' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'protein', label: 'Protein' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'other', label: 'Other' },
];

const UNIT_OPTIONS: QuantityUnit[] = ['item', 'bag', 'container', 'bottle', 'can', 'package', 'lb', 'oz', 'kg', 'g', 'L', 'ml'];

interface AddGroceryItemModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (input: ManualGroceryItemInput) => void;
}

export function AddGroceryItemModal({ visible, onClose, onAdd }: AddGroceryItemModalProps) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<IngredientCategory>('other');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<QuantityUnit>('item');

  const reset = () => {
    setName('');
    setCategory('other');
    setQuantity(1);
    setUnit('item');
  };

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({ name: trimmed, category, quantity, unit });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>Add Item</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Item name"
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel="Item name"
          style={[
            theme.typography.body,
            {
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              paddingHorizontal: 14,
              minHeight: 48,
              color: theme.colors.textPrimary,
              backgroundColor: theme.colors.backgroundElevated,
            },
          ]}
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORY_OPTIONS.map((option) => (
              <Chip key={option.value} label={option.label} selected={category === option.value} onPress={() => setCategory(option.value)} />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Quantity</Text>
          <Stepper value={quantity} onChange={setQuantity} min={1} accessibilityLabel="quantity" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {UNIT_OPTIONS.map((option) => (
              <Chip key={option} label={option} selected={unit === option} onPress={() => setUnit(option)} />
            ))}
          </ScrollView>
        </View>

        <View style={{ flex: 1 }} />
        <Button label="Add to List" onPress={handleAdd} disabled={!name.trim()} fullWidth />
      </Screen>
    </Modal>
  );
}
