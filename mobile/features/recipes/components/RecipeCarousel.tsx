import React from 'react';
import { ScrollView } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { Recipe } from '@/types';
import { RecipeCard } from './RecipeCard';

interface RecipeCarouselProps {
  recipes: Recipe[];
  getSubtitle?: (recipe: Recipe) => string;
  onPressRecipe: (recipeId: string) => void;
}

export function RecipeCarousel({ recipes, getSubtitle, onPressRecipe }: RecipeCarouselProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.md, paddingRight: theme.spacing.lg }}
    >
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          subtitle={getSubtitle?.(recipe)}
          onPress={() => onPressRecipe(recipe.id)}
        />
      ))}
    </ScrollView>
  );
}
