import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export type IngredientAvatarVariant = 'compact' | 'row' | 'hero';

const VARIANT_SIZE: Record<IngredientAvatarVariant, number> = {
  compact: 32,
  row: 44,
  hero: 96,
};

interface IngredientAvatarProps {
  imageUri: string;
  variant?: IngredientAvatarVariant;
}

/** Real photo thumbnail, used everywhere an ingredient/recipe needs a small visual. */
export function IngredientAvatar({ imageUri, variant = 'row' }: IngredientAvatarProps) {
  const theme = useTheme();
  const size = VARIANT_SIZE[variant];

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceMuted }]}>
      <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={150} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
