import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { Button, Chip, EmptyState, Screen, Stepper, TextField } from '@/components';
import { useCreateBarcodeItem, useEnrichBarcodeProductNutrition } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { toUserSafeAuthMessage } from '@/lib/errors';
import { CreateBarcodeItemInput, createBarcodeItemSchema } from '@/lib/validation/barcodeSchemas';
import { useBarcodeSessionStore } from '@/store';
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

function n1(value: number | null): string {
  return value == null ? '—' : String(Math.round(value * 10) / 10);
}

export function BarcodeReviewScreen() {
  const theme = useTheme();
  const pending = useBarcodeSessionStore((s) => s.pending);
  const clear = useBarcodeSessionStore((s) => s.clear);
  const createItem = useCreateBarcodeItem();

  const candidate = pending?.candidate ?? null;
  const notFound = pending?.status === 'not_found';

  // One-shot enrichment: persist the OFF candidate + attempt an exact USDA
  // branded-GTIN verification. Fires once per review, never blocks the screen.
  const enrich = useEnrichBarcodeProductNutrition();
  const enrichStarted = useRef(false);
  useEffect(() => {
    if (enrichStarted.current) return;
    if (pending?.status !== 'found' || !pending.barcode) return;
    enrichStarted.current = true;
    enrich.mutate({
      barcode: pending.barcode,
      offPer100g: candidate?.nutrition?.per100g ?? null,
      sourceProductId: candidate?.sourceProductId,
      description: candidate?.productName || undefined,
      brand: candidate?.brand,
    });
  }, [pending?.status, pending?.barcode, candidate, enrich]);

  const resolved = enrich.data;

  const { control, handleSubmit, watch, formState: { errors } } = useForm<CreateBarcodeItemInput>({
    resolver: zodResolver(createBarcodeItemSchema),
    defaultValues: {
      barcode: pending?.barcode ?? '',
      displayName: candidate?.productName ?? '',
      brand: candidate?.brand,
      category: candidate?.categoryGuess ?? 'other',
      // Provider package size is a STARTING POINT, clearly editable - never a
      // silent "exact" quantity.
      quantity: candidate?.packageQuantity && candidate.packageUnit ? candidate.packageQuantity : 1,
      unit: candidate?.packageUnit ?? 'package',
      imageUrl: candidate?.imageUrl,
      sourceProductId: candidate?.sourceProductId,
    },
  });

  const userProvidedDate = watch('userProvidedDate');

  if (!pending) {
    return (
      <Screen>
        <EmptyState title="Nothing to review" message="Scan a barcode to get started." />
      </Screen>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createItem.mutateAsync({
        ...values,
        // Persist the real fdc_id only when review resolved an exact USDA match.
        fdcId: resolved?.status === 'verified' && resolved.fdcId != null ? String(resolved.fdcId) : undefined,
      });
      clear();
      router.replace('/(tabs)/pantry');
    } catch (error) {
      Alert.alert("Couldn't add item", toUserSafeAuthMessage(error));
    }
  });

  // Prefer the enrichment result once it lands; fall back to the raw OFF numbers.
  const shownPer100g = resolved?.per100g ?? candidate?.nutrition?.per100g ?? null;
  const nutritionLabel =
    enrich.isPending && !resolved
      ? 'checking'
      : resolved?.status === 'verified'
        ? 'verified'
        : shownPer100g
          ? 'candidate'
          : 'none';

  return (
    <Screen scroll contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>
          {notFound ? 'Add manually' : 'Review product'}
        </Text>
      </View>

      {notFound ? (
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          We couldn't find barcode {pending.barcode} in the product database. Fill in the details and it'll still be
          added to your pantry, with the barcode kept for later.
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
          {candidate?.imageUrl ? (
            <Image
              source={{ uri: candidate.imageUrl }}
              style={{ width: 64, height: 64, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted }}
              contentFit="contain"
            />
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
              {candidate?.productName || 'Unnamed product'}
            </Text>
            {candidate?.brand ? (
              <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{candidate.brand}</Text>
            ) : null}
            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Powered by Open Food Facts</Text>
          </View>
        </View>
      )}

      <Controller
        control={control}
        name="displayName"
        render={({ field }) => (
          <TextField
            label="Name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="e.g. Greek Yogurt"
            autoCapitalize="words"
            error={errors.displayName?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="brand"
        render={({ field }) => (
          <TextField
            label="Brand (optional)"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            placeholder="e.g. Chobani"
            autoCapitalize="words"
            error={errors.brand?.message}
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
        {candidate?.packageRawText ? (
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            Open Food Facts lists this package as “{candidate.packageRawText}”.
            {candidate.packageUnit
              ? ' Adjust if you have more than one, or measured a different amount.'
              : " We couldn't match that unit — set the amount and unit yourself."}
          </Text>
        ) : (
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            No package size from the lookup — enter what you have.
          </Text>
        )}
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
          Barcodes don't carry a date. Add the printed best-by if you like, or a purchase date and we'll estimate.
        </Text>
        <Controller
          control={control}
          name="purchaseDate"
          render={({ field }) => (
            <TextField label="Purchase date" value={field.value ?? ''} onChangeText={field.onChange} placeholder="YYYY-MM-DD" error={errors.purchaseDate?.message} />
          )}
        />
        <Controller
          control={control}
          name="userProvidedDate"
          render={({ field }) => (
            <TextField
              label="Best by / use by / sell by (from package)"
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
          <Text style={[theme.typography.footnote, { color: theme.colors.freshness.prioritize }]}>{errors.userProvidedDateType.message}</Text>
        ) : null}
      </View>

      <View style={{ gap: 4 }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Nutrition</Text>
        {nutritionLabel === 'checking' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={theme.colors.textTertiary} />
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>Checking USDA for an exact match…</Text>
          </View>
        ) : nutritionLabel === 'verified' ? (
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            Nutrition verified with USDA (exact barcode match). Saved with your item.
          </Text>
        ) : nutritionLabel === 'candidate' ? (
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            Nutrition from Open Food Facts — not USDA-verified. Saved with your item.
          </Text>
        ) : (
          <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]}>
            No product nutrition found. SmartPrep will estimate it when it recognises the ingredient.
          </Text>
        )}
        {shownPer100g ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            Per 100 g: {n1(shownPer100g.calories ?? null)} kcal · {n1(shownPer100g.proteinG ?? null)} g protein ·{' '}
            {n1(shownPer100g.carbsG ?? null)} g carbs · {n1(shownPer100g.fatG ?? null)} g fat
          </Text>
        ) : null}
      </View>

      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <TextField label="Notes" value={field.value ?? ''} onChangeText={field.onChange} placeholder="Optional" error={errors.notes?.message} />
        )}
      />

      <Button label="Add to pantry" onPress={onSubmit} loading={createItem.isPending} fullWidth />
    </Screen>
  );
}
