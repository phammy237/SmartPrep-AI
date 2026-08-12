import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, LoadingState, NutritionFactsRow, ProgressRing, Screen } from '@/components';
import { useAddMissingIngredientsForRecipe, useRecipe } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { getMissingIngredients, getRecipeAvailability } from '@/services';
import { formatCurrency, formatMinutes } from '@/utils/format';

export function RecipeDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipeQuery = useRecipe(id);
  const addMissing = useAddMissingIngredientsForRecipe();

  if (recipeQuery.isLoading) {
    return (
      <Screen>
        <LoadingState fullscreen message="Loading recipe..." />
      </Screen>
    );
  }

  if (!recipeQuery.data) {
    return (
      <Screen>
        <EmptyState title="Recipe not found" />
      </Screen>
    );
  }

  const recipe = recipeQuery.data;
  const { owned, total } = getRecipeAvailability(recipe);
  const missing = getMissingIngredients(recipe);
  const ownedIngredients = recipe.ingredients.filter((i) => i.isOwned);

  return (
    <Screen scroll edges={['top', 'left', 'right']}>
      <View style={styles.imageWrap}>
        <Image source={{ uri: recipe.imageUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={150} />
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.backButton, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: theme.spacing.md, gap: 4 }}>
            <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>{recipe.title}</Text>
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
              {formatMinutes(recipe.prepTimeMinutes + recipe.cookTimeMinutes)} · {capitalize(recipe.difficulty)}
              {recipe.additionalCostEstimate > 0 ? ` · ~${formatCurrency(recipe.additionalCostEstimate)} to shop` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <ProgressRing progress={recipe.smartMatchScore} size={56} strokeWidth={6}>
              <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>{recipe.smartMatchScore}</Text>
            </ProgressRing>
            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>SmartPrep Match</Text>
          </View>
        </View>

        <NutritionFactsRow facts={recipe.nutritionPerServing} servingLabel="per serving" />

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>Pantry match</Text>
            <Text style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}>
              {owned} of {total} ingredients
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
            <View
              style={{
                height: '100%',
                width: `${total > 0 ? (owned / total) * 100 : 0}%`,
                backgroundColor: theme.colors.accent,
                borderRadius: 3,
              }}
            />
          </View>
        </View>

        {recipe.reasons.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Why this works</Text>
            <View style={{ gap: 6 }}>
              {recipe.reasons.map((reason) => (
                <View key={reason.id} style={{ flexDirection: 'row', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.colors.accent} />
                  <Text style={[theme.typography.callout, { color: theme.colors.textSecondary, flex: 1 }]}>
                    {reason.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.md }}>
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
              YOU HAVE ({owned}/{total})
            </Text>
            <View style={{ gap: 6 }}>
              {ownedIngredients.map((ingredient) => (
                <View key={ingredient.ingredientId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark" size={16} color={theme.colors.accent} />
                  <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{ingredient.name}</Text>
                </View>
              ))}
            </View>
          </View>

          {missing.length > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>YOU NEED</Text>
              <View style={{ gap: 6 }}>
                {missing.map((ingredient) => (
                  <View key={ingredient.ingredientId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="add-circle-outline" size={16} color={theme.colors.textTertiary} />
                    <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{ingredient.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Button label="Cook This" onPress={() => router.push(`/recipes/${recipe.id}/cook`)} fullWidth />
          {missing.length > 0 ? (
            <Button
              label="Add Missing Items"
              variant="secondary"
              loading={addMissing.isPending}
              onPress={() =>
                addMissing.mutate(recipe.id, {
                  onSuccess: () => Alert.alert('Added to Grocery List', `${missing.length} item(s) added.`),
                })
              }
              fullWidth
            />
          ) : null}
          <Button
            label="Swap Ingredients"
            variant="ghost"
            onPress={() =>
              Alert.alert('Swap Ingredients', 'Ingredient swapping will let you substitute items - coming soon.')
            }
            fullWidth
          />
        </View>

        {recipe.steps.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Steps</Text>
            <View style={{ gap: theme.spacing.sm }}>
              {recipe.steps.map((step, index) => (
                <View key={index} style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={[theme.typography.subhead, { color: theme.colors.accent, width: 20 }]}>{index + 1}.</Text>
                  <Text style={[theme.typography.callout, { color: theme.colors.textSecondary, flex: 1 }]}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  imageWrap: {
    width: '100%',
    height: 260,
  },
  backButton: {
    position: 'absolute',
    top: 12,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
