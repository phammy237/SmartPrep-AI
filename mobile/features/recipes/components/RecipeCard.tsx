import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSaveRecipe, useSavedRecipes, useUnsaveRecipe } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { Recipe } from '@/types';
import { formatMinutes } from '@/utils/format';

interface RecipeCardProps {
  recipe: Recipe;
  onPress: () => void;
  subtitle?: string;
  width?: number;
}

export function RecipeCard({ recipe, onPress, subtitle, width = 190 }: RecipeCardProps) {
  const theme = useTheme();
  const recipeVersionId = recipe.recipeVersionId ?? recipe.id;
  const savedQuery = useSavedRecipes();
  const saveMutation = useSaveRecipe();
  const unsaveMutation = useUnsaveRecipe();
  const saved = savedQuery.data?.some((s) => s.recipeVersionId === recipeVersionId) ?? false;
  const toggling = saveMutation.isPending || unsaveMutation.isPending;

  const handleToggleSave = () => {
    if (toggling) return;
    if (saved) {
      unsaveMutation.mutate(recipeVersionId);
    } else {
      saveMutation.mutate({ recipeVersionId });
    }
  };

  const defaultSubtitle = subtitle
    ? undefined
    : `${formatMinutes(recipe.prepTimeMinutes + recipe.cookTimeMinutes)} · ${Math.round(recipe.nutritionPerServing.calories)} kcal`;

  return (
    // The save-heart below is a sibling, not a descendant, of this Pressable: nesting two
    // interactive elements renders as a `<button>` inside a `<button>` on web, which is invalid
    // HTML and breaks click handling. Stacking them as absolutely-positioned siblings keeps the
    // whole card tappable while letting the heart remain an independent, correctly nested control.
    <View style={{ width }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={recipe.title}
        style={({ pressed }) => [
          styles.imageWrap,
          { height: width * 1.05, backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.lg },
          pressed && styles.pressed,
        ]}
      >
        <Image source={{ uri: recipe.imageUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={150} />
        <View style={[styles.matchBadge, { backgroundColor: 'rgba(255,255,255,0.92)' }]}>
          <Text style={[theme.typography.caption, { color: theme.colors.accent }]}>{recipe.smartMatchScore}% match</Text>
        </View>
        <View style={[styles.labelPanel, { backgroundColor: theme.colors.backgroundElevated, borderRadius: theme.radius.md }]}>
          <Text numberOfLines={1} style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>
            {recipe.title}
          </Text>
          <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 1 }]}>
            {subtitle ?? defaultSubtitle}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={handleToggleSave}
        disabled={toggling}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remove from saved' : 'Save recipe'}
        hitSlop={8}
        style={[styles.saveButton, { backgroundColor: 'rgba(255,255,255,0.92)', opacity: toggling ? 0.6 : 1 }]}
      >
        <Ionicons name={saved ? 'heart' : 'heart-outline'} size={15} color={saved ? theme.colors.freshness.prioritize : theme.colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.92,
  },
  matchBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  saveButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelPanel: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
});
