import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Chip, EmptyState, FreshnessTag, IngredientAvatar, LoadingState, NutritionFactsRow, Screen, Stepper, TextField } from '@/components';
import {
  useAdjustPantryQuantity,
  useConfirmPantryItem,
  useDepletePantryItem,
  usePantryItem,
  usePantryItemNutrition,
  useRecipes,
  useRestorePantryItem,
  useUpdatePantryItemMetadata,
} from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { toUserSafeAuthMessage } from '@/lib/errors';
import { IngredientCategory, QuantityUnit, StorageLocation, UserProvidedDateType } from '@/types';
import { EXPIRATION_CONFIDENCE_META } from '@/utils/expiration';
import { INGREDIENTS_BY_ID } from '@/data';
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

const STORAGE_OPTIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'counter', label: 'Counter' },
  { value: 'other', label: 'Other' },
];

const DATE_TYPE_OPTIONS: { value: UserProvidedDateType; label: string }[] = [
  { value: 'best_by', label: 'Best by' },
  { value: 'use_by', label: 'Use by' },
  { value: 'sell_by', label: 'Sell by' },
];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function PantryItemDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemQuery = usePantryItem(id);
  const nutritionQuery = usePantryItemNutrition(itemQuery.data);
  const recipesQuery = useRecipes();
  const updateMetadata = useUpdatePantryItemMetadata();
  const adjustQuantity = useAdjustPantryQuantity();
  const depleteItem = useDepletePantryItem();
  const restoreItem = useRestorePantryItem();
  const confirmItem = useConfirmPantryItem();

  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [openedDate, setOpenedDate] = useState<string | null>(null);
  const [userProvidedDate, setUserProvidedDate] = useState<string | null>(null);
  const [userProvidedDateType, setUserProvidedDateType] = useState<UserProvidedDateType | undefined>(undefined);

  const recipesUsingIngredient = useMemo(
    () =>
      (recipesQuery.data ?? []).filter((recipe) =>
        recipe.ingredients.some((i) => i.ingredientId === itemQuery.data?.ingredientId),
      ),
    [recipesQuery.data, itemQuery.data?.ingredientId],
  );

  if (itemQuery.isLoading) {
    return (
      <Screen>
        <LoadingState fullscreen message="Loading item..." />
      </Screen>
    );
  }

  if (itemQuery.isError) {
    return (
      <Screen>
        <EmptyState title="Couldn't load item" actionLabel="Retry" onActionPress={() => itemQuery.refetch()} />
      </Screen>
    );
  }

  if (!itemQuery.data) {
    return (
      <Screen>
        <EmptyState title="Item not found" message="This item may have already been removed." />
      </Screen>
    );
  }

  const item = itemQuery.data;
  const isDepleted = item.status === 'depleted';
  /** Manually-added items don't have a catalog entry, so nutrition facts are unavailable for them. */
  const catalogIngredient = INGREDIENTS_BY_ID[item.ingredientId];

  const dateDraft = {
    purchaseDate: purchaseDate ?? item.purchaseDate ?? '',
    openedDate: openedDate ?? item.openedDate ?? '',
    userProvidedDate: userProvidedDate ?? item.userProvidedDate ?? '',
    userProvidedDateType: userProvidedDateType ?? item.userProvidedDateType,
  };

  const validateDate = (value: string) => value === '' || ISO_DATE_PATTERN.test(value);
  const datesValid =
    validateDate(dateDraft.purchaseDate) && validateDate(dateDraft.openedDate) && validateDate(dateDraft.userProvidedDate);

  const saveDates = () => {
    if (!datesValid) {
      Alert.alert('Check your dates', 'Dates should be in YYYY-MM-DD format.');
      return;
    }
    if (dateDraft.userProvidedDate && !dateDraft.userProvidedDateType) {
      Alert.alert('Choose a date type', 'Let us know if that date is a best-by, use-by, or sell-by date.');
      return;
    }
    updateMetadata.mutate(
      {
        id: item.id,
        patch: {
          purchaseDate: dateDraft.purchaseDate || undefined,
          openedDate: dateDraft.openedDate || undefined,
          userProvidedDate: dateDraft.userProvidedDate || undefined,
          userProvidedDateType: dateDraft.userProvidedDate ? dateDraft.userProvidedDateType : undefined,
        },
      },
      {
        onSuccess: () => {
          setPurchaseDate(null);
          setOpenedDate(null);
          setUserProvidedDate(null);
          setUserProvidedDateType(undefined);
        },
        onError: (error) => Alert.alert("Couldn't save dates", toUserSafeAuthMessage(error)),
      },
    );
  };

  const runDepleteAction = (
    title: string,
    message: string,
    eventType: 'depleted' | 'discarded' | 'corrected',
  ) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: title,
        style: eventType === 'discarded' || eventType === 'corrected' ? 'destructive' : 'default',
        onPress: () =>
          depleteItem.mutate(
            { itemId: item.id, eventType },
            { onError: (error) => Alert.alert('Something went wrong', toUserSafeAuthMessage(error)) },
          ),
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
        {isDepleted ? (
          <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]}>Marked as depleted</Text>
        ) : null}
      </View>

      <Pressable
        onPress={() =>
          confirmItem.mutate(item.id, {
            onError: (error) => Alert.alert('Something went wrong', toUserSafeAuthMessage(error)),
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Still have this?"
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            padding: theme.spacing.md,
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.backgroundElevated,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="checkmark-circle-outline" size={20} color={theme.colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>Still have this?</Text>
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            {item.lastConfirmedAt
              ? `Last confirmed ${new Date(item.lastConfirmedAt).toLocaleDateString()}`
              : 'Tap to confirm you still have it on hand.'}
          </Text>
        </View>
      </Pressable>

      <FreshnessTimeline item={item} />

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Quantity</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stepper
            value={item.quantity}
            onChange={(value) => {
              const delta = value - item.quantity;
              if (delta === 0) return;
              adjustQuantity.mutate(
                { itemId: item.id, delta, eventType: 'adjusted' },
                { onError: (error) => Alert.alert('Something went wrong', toUserSafeAuthMessage(error)) },
              );
            }}
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
              onPress={() => updateMetadata.mutate({ id: item.id, patch: { unit } })}
            />
          ))}
        </ScrollView>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Expiration</Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
          {EXPIRATION_CONFIDENCE_META[item.expirationConfidence ?? 'unknown'].description}
        </Text>
        <TextField
          label="Purchase date"
          value={dateDraft.purchaseDate}
          onChangeText={setPurchaseDate}
          placeholder="YYYY-MM-DD"
          error={!validateDate(dateDraft.purchaseDate) ? 'Use YYYY-MM-DD format' : undefined}
        />
        <TextField
          label="Opened date"
          value={dateDraft.openedDate}
          onChangeText={setOpenedDate}
          placeholder="YYYY-MM-DD"
          error={!validateDate(dateDraft.openedDate) ? 'Use YYYY-MM-DD format' : undefined}
        />
        <TextField
          label="Best by / use by / sell by date (from package)"
          value={dateDraft.userProvidedDate}
          onChangeText={setUserProvidedDate}
          placeholder="YYYY-MM-DD"
          error={!validateDate(dateDraft.userProvidedDate) ? 'Use YYYY-MM-DD format' : undefined}
        />
        {dateDraft.userProvidedDate ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DATE_TYPE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={dateDraft.userProvidedDateType === option.value}
                onPress={() => setUserProvidedDateType(option.value)}
              />
            ))}
          </View>
        ) : null}
        <Button label="Save Dates" variant="secondary" onPress={saveDates} loading={updateMetadata.isPending} />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Storage location</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {STORAGE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={item.storageLocation === option.value}
              onPress={() => updateMetadata.mutate({ id: item.id, patch: { storageLocation: option.value } })}
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
              onPress={() => updateMetadata.mutate({ id: item.id, patch: { category: option.value } })}
            />
          ))}
        </View>
      </View>

      {catalogIngredient ? (
        <NutritionFactsRow facts={catalogIngredient.nutritionPerServing} servingLabel={catalogIngredient.servingDescription} />
      ) : null}

      <View style={{ gap: 2 }}>
        <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>
          Nutrition for {item.quantity} {item.unit}
        </Text>
        {nutritionQuery.isError ? (
          <Text style={[theme.typography.caption, { color: theme.colors.freshness.prioritize }]}>
            Couldn&apos;t load nutrition just now. Your item is saved.
          </Text>
        ) : nutritionQuery.data && nutritionQuery.data.status !== 'unresolved' ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
            {[
              nutritionQuery.data.snapshot.calories != null ? `${Math.round(nutritionQuery.data.snapshot.calories)} kcal` : null,
              nutritionQuery.data.snapshot.proteinG != null ? `${Math.round(nutritionQuery.data.snapshot.proteinG)}g protein` : null,
              nutritionQuery.data.snapshot.carbsG != null ? `${Math.round(nutritionQuery.data.snapshot.carbsG)}g carbs` : null,
              nutritionQuery.data.snapshot.fatG != null ? `${Math.round(nutritionQuery.data.snapshot.fatG)}g fat` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {'  '}
            {nutritionQuery.data.status === 'verified'
              ? '(USDA-verified)'
              : nutritionQuery.data.status === 'candidate'
                ? '(USDA candidate, unconfirmed)'
                : '(estimated)'}
          </Text>
        ) : (
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            Not available for this quantity/unit yet.
          </Text>
        )}
      </View>

      <StorageTipCard category={item.category} />

      <RecipesUsingIngredient
        recipes={recipesUsingIngredient}
        onPressRecipe={(recipeId) => router.push(`/recipes/${recipeId}`)}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Actions</Text>
        {isDepleted ? (
          <Button
            label="Restore to Pantry"
            onPress={() =>
              restoreItem.mutate(
                { itemId: item.id },
                { onError: (error) => Alert.alert('Something went wrong', toUserSafeAuthMessage(error)) },
              )
            }
            loading={restoreItem.isPending}
            fullWidth
          />
        ) : (
          <>
            <Button
              label="Used Some"
              variant="secondary"
              onPress={() =>
                adjustQuantity.mutate(
                  { itemId: item.id, delta: -1, eventType: 'consumed' },
                  { onError: (error) => Alert.alert('Something went wrong', toUserSafeAuthMessage(error)) },
                )
              }
              fullWidth
            />
            <Button
              label="Finished"
              variant="secondary"
              onPress={() => runDepleteAction('Finished', `Mark ${item.name} as fully used?`, 'depleted')}
              fullWidth
            />
            <Button
              label="Discarded"
              variant="secondary"
              onPress={() => runDepleteAction('Discarded', `Remove ${item.name} as discarded?`, 'discarded')}
              fullWidth
            />
            <Button
              label="Remove"
              variant="danger"
              onPress={() => runDepleteAction('Remove', `Remove ${item.name} from your pantry? Use this if it was added by mistake.`, 'corrected')}
              fullWidth
            />
          </>
        )}
      </View>
    </Screen>
  );
}
