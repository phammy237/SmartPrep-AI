import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Chip, Screen, Stepper, TextField } from '@/components';
import { useAddManualPantryItem } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { toUserSafeAuthMessage } from '@/lib/errors';
import { CreatePantryItemInput, createPantryItemSchema } from '@/lib/validation/pantrySchemas';
import { IngredientCategory, QuantityUnit, StorageLocation, UserProvidedDateType } from '@/types';

const CATEGORY_OPTIONS: { value: IngredientCategory; label: string }[] = [
  { value: 'produce', label: 'Produce' },
  { value: 'protein', label: 'Protein' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'other', label: 'Other' },
];

const UNIT_OPTIONS: QuantityUnit[] = ['item', 'container', 'bag', 'bottle', 'can', 'package', 'serving', 'g', 'kg', 'oz', 'lb', 'ml', 'L'];

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

export function AddPantryItemScreen() {
  const theme = useTheme();
  const addItem = useAddManualPantryItem();

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreatePantryItemInput>({
    resolver: zodResolver(createPantryItemSchema),
    defaultValues: { displayName: '', category: 'other', quantity: 1, unit: 'item' },
  });

  const userProvidedDate = watch('userProvidedDate');

  const onSubmit = handleSubmit(async (values) => {
    try {
      await addItem.mutateAsync(values);
      router.back();
    } catch (error) {
      Alert.alert("Couldn't add item", toUserSafeAuthMessage(error));
    }
  });

  return (
    <Screen scroll contentContainerStyle={{ flex: 1 }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      </View>
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Add to pantry</Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            Dates are optional but help us estimate when to use this first.
          </Text>
        </View>

        <Controller
          control={control}
          name="displayName"
          render={({ field }) => (
            <TextField
              label="Name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="e.g. Milk"
              autoCapitalize="words"
              error={errors.displayName?.message}
            />
          )}
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Category</Text>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORY_OPTIONS.map((option) => (
                  <Chip key={option.value} label={option.label} selected={field.value === option.value} onPress={() => field.onChange(option.value)} />
                ))}
              </View>
            )}
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Quantity</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Controller
              control={control}
              name="quantity"
              render={({ field }) => (
                <Stepper value={field.value} onChange={field.onChange} min={0} step={1} accessibilityLabel="quantity" />
              )}
            />
            <Controller
              control={control}
              name="unit"
              render={({ field }) => <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{field.value}</Text>}
            />
          </View>
          {errors.quantity ? (
            <Text style={[theme.typography.footnote, { color: theme.colors.freshness.prioritize }]}>{errors.quantity.message}</Text>
          ) : null}
          <Controller
            control={control}
            name="unit"
            render={({ field }) => (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {UNIT_OPTIONS.map((unit) => (
                  <Chip key={unit} label={unit} selected={field.value === unit} onPress={() => field.onChange(unit)} />
                ))}
              </View>
            )}
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Storage location</Text>
          <Controller
            control={control}
            name="storageLocation"
            render={({ field }) => (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {STORAGE_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={field.value === option.value}
                    onPress={() => field.onChange(field.value === option.value ? undefined : option.value)}
                  />
                ))}
              </View>
            )}
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Dates (optional)</Text>
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            A printed package date is guidance, not a safety guarantee. Without one, we'll estimate from the purchase date and food type instead.
          </Text>
          <Controller
            control={control}
            name="purchaseDate"
            render={({ field }) => (
              <TextField
                label="Purchase date"
                value={field.value ?? ''}
                onChangeText={field.onChange}
                placeholder="YYYY-MM-DD"
                error={errors.purchaseDate?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="openedDate"
            render={({ field }) => (
              <TextField
                label="Opened date"
                value={field.value ?? ''}
                onChangeText={field.onChange}
                placeholder="YYYY-MM-DD"
                error={errors.openedDate?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="userProvidedDate"
            render={({ field }) => (
              <TextField
                label="Best by / use by / sell by date (from package)"
                value={field.value ?? ''}
                onChangeText={field.onChange}
                placeholder="YYYY-MM-DD"
                error={errors.userProvidedDate?.message}
              />
            )}
          />
          {userProvidedDate ? (
            <Controller
              control={control}
              name="userProvidedDateType"
              render={({ field }) => (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {DATE_TYPE_OPTIONS.map((option) => (
                    <Chip key={option.value} label={option.label} selected={field.value === option.value} onPress={() => field.onChange(option.value)} />
                  ))}
                </View>
              )}
            />
          ) : null}
          {errors.userProvidedDateType ? (
            <Text style={[theme.typography.footnote, { color: theme.colors.freshness.prioritize }]}>
              {errors.userProvidedDateType.message}
            </Text>
          ) : null}
        </View>

        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <TextField
              label="Notes"
              value={field.value ?? ''}
              onChangeText={field.onChange}
              placeholder="Optional"
              error={errors.notes?.message}
            />
          )}
        />

        <Button label="Add to pantry" onPress={onSubmit} loading={addItem.isPending} fullWidth />
      </View>
    </Screen>
  );
}
