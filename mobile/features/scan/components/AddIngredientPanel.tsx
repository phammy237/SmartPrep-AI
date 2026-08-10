import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Chip } from '@/components';
import { INGREDIENTS } from '@/data';
import { useTheme } from '@/hooks/useTheme';
import { Ingredient } from '@/types';

interface AddIngredientPanelProps {
  excludeIngredientIds: string[];
  onAdd: (ingredient: Ingredient) => void;
}

export function AddIngredientPanel({ excludeIngredientIds, onAdd }: AddIngredientPanelProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button label="+ Add Missing Ingredient" variant="ghost" onPress={() => setOpen(true)} />;
  }

  const available = INGREDIENTS.filter((i) => !excludeIngredientIds.includes(i.id));

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>Tap an ingredient to add it</Text>
      <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {available.map((ingredient) => (
            <Chip
              key={ingredient.id}
              label={ingredient.name}
              onPress={() => {
                onAdd(ingredient);
                setOpen(false);
              }}
            />
          ))}
        </View>
      </ScrollView>
      <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
    </View>
  );
}
