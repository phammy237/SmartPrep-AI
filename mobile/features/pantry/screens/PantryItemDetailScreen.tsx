import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Button, Chip, EmptyState, FreshnessTag, IngredientAvatar, LoadingState, NutritionFactsRow, Screen, Stepper } from '@/components';
import { INGREDIENTS_BY_ID } from '@/data';
import { usePantryItem, useRecipes, useRemovePantryItem, useUpdatePantryItem, useUpdatePantryItemFreshness, useUseSomePantryItem } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { IngredientCategory, QuantityUnit } from '@/types';
import { FRESHNESS_LABELS, FRESHNESS_META, FRESHNESS_OVERRIDE_VALUES } from '@/utils/freshness';
import { FreshnessTimeline } from '../components/FreshnessTimeline';
import { RecipesUsingIngredient } from '../components/RecipesUsingIngredient';
import { StorageTipCard } from '../components/StorageTipCard';

const CATEGORY_OPTIONS: { value: IngredientCategory; label: string }[] = [
  { value: 'produce', label: 'Produce' },
  { value: 'protein', label: 'Protein' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'other', label: 'Other' },
];

const UNIT_OPTIONS: QuantityUnit[] = [
  'item', 'container', 'bag', 'bottle', 'can', 'package', 'serving', 'g', 'kg', 'oz', 'lb', 'ml', 'L',
];

export function PantryItemDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemQuery = usePantryItem(id);
  const recipesQuery = useRecipes();
  const updateItem = useUpdatePantryItem();
  const updateFreshness = useUpdatePantryItemFreshness();
  const useSome = useUseSomePantryItem();
  const removeItem = useRemovePantryItem();

  if (itemQuery.isLoading) {
    return (
      <Screen>
        <LoadingState fullscreen message="Loading item..." />
      </Screen>
    );
  }

  if (!itemQuery.data) {
    return (
      <Screen>
        <EmptyState icon="🔍" title="Item not found" message="This item may have already been removed." />
      </Screen>
    );
  }

  const item = itemQuery.data;
  /** Manually-added items don't have a catalog entry, so nutrition facts are unavailable for them. */
  const catalogIngredient = INGREDIENTS_BY_ID[item.ingredientId];
  const recipesUsingIngredient = (recipesQuery.data ?? []).filter((recipe) =>
    recipe.ingredients.some((i) => i.ingredientId === item.ingredientId),
  );

  const confirmAndRemove = (title: string, message: string, reason: 'finished' | 'discarded' | 'removed') => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: title,
        style: reason === 'removed' ? 'destructive' : 'default',
        onPress: () => removeItem.mutate({ id: item.id, reason }, { onSuccess: () => router.back() }),
      },
    ]);
  };

  return (
    <Screen scroll contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <IngredientAvatar imageUri={item.imageUri} variant="hero" />
        <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>{item.name}</Text>
        <FreshnessTag label={item.freshness.label} />
        {item.freshness.estimatedUseBy ? (
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            {item.freshness.estimatedUseBy}
          </Text>
        ) : null}
      </View>

      <FreshnessTimeline item={item} />

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Quantity</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stepper
            value={item.quantity}
            onChange={(value) => updateItem.mutate({ id: item.id, patch: { quantity: value } })}
            min={0}
            step={item.unit === 'g' || item.unit === 'ml' ? 25 : item.unit === 'kg' || item.unit === 'L' ? 0.25 : 1}
            accessibilityLabel={`${item.name} quantity`}
          />
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{item.unit}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {UNIT_OPTIONS.map((unit) => (
            <Chip
              key={unit}
              label={unit}
              selected={item.unit === unit}
              onPress={() => updateItem.mutate({ id: item.id, patch: { unit } })}
            />
          ))}
        </ScrollView>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Freshness</Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
          {FRESHNESS_META[item.freshness.label].description}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FRESHNESS_LABELS.map((label) => (
            <Chip
              key={label}
              label={FRESHNESS_META[label].label}
              selected={item.freshness.label === label}
              onPress={() =>
                updateFreshness.mutate({
                  id: item.id,
                  patch: { label, ...FRESHNESS_OVERRIDE_VALUES[label] },
                })
              }
            />
          ))}
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORY_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={item.category === option.value}
              onPress={() => updateItem.mutate({ id: item.id, patch: { category: option.value } })}
            />
          ))}
        </View>
      </View>

      {catalogIngredient ? (
        <NutritionFactsRow facts={catalogIngredient.nutritionPerServing} servingLabel={catalogIngredient.servingDescription} />
      ) : null}

      <StorageTipCard category={item.category} />

      <RecipesUsingIngredient
        recipes={recipesUsingIngredient}
        onPressRecipe={(recipeId) => router.push(`/recipes/${recipeId}`)}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Actions</Text>
        <Button
          label="Used Some"
          variant="secondary"
          onPress={() =>
            useSome.mutate(
              { id: item.id, amountUsed: 1 },
              { onSuccess: (result) => (!result ? router.back() : undefined) },
            )
          }
          fullWidth
        />
        <Button
          label="Finished"
          variant="secondary"
          onPress={() => confirmAndRemove('Finished', `Mark ${item.name} as fully used?`, 'finished')}
          fullWidth
        />
        <Button
          label="Discarded"
          variant="secondary"
          onPress={() => confirmAndRemove('Discarded', `Remove ${item.name} as discarded?`, 'discarded')}
          fullWidth
        />
        <Button
          label="Remove"
          variant="danger"
          onPress={() => confirmAndRemove('Remove', `Remove ${item.name} from your pantry?`, 'removed')}
          fullWidth
        />
      </View>
    </Screen>
  );
}
