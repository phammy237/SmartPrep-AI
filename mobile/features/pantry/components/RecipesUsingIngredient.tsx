import React from 'react';
import { View } from 'react-native';

import { SectionHeader } from '@/components';
import { RecipeCarousel } from '@/features/recipes/components/RecipeCarousel';
import { Recipe } from '@/types';

interface RecipesUsingIngredientProps {
  recipes: Recipe[];
  onPressRecipe: (recipeId: string) => void;
}

export function RecipesUsingIngredient({ recipes, onPressRecipe }: RecipesUsingIngredientProps) {
  if (recipes.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <SectionHeader title="Recipes using this" />
      <RecipeCarousel recipes={recipes} onPressRecipe={onPressRecipe} />
    </View>
  );
}
