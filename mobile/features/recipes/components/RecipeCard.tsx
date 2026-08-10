import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { Recipe } from '@/types';

interface RecipeCardProps {
  recipe: Recipe;
  onPress: () => void;
  subtitle?: string;
  width?: number;
}

export function RecipeCard({ recipe, onPress, subtitle, width = 190 }: RecipeCardProps) {
  const theme = useTheme();
  const [saved, setSaved] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={recipe.title}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.imageWrap,
          { height: width * 1.05, backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.lg },
        ]}
      >
        <Image source={{ uri: recipe.imageUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={150} />
        <Pressable
          onPress={() => setSaved((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Remove from saved' : 'Save recipe'}
          hitSlop={8}
          style={[styles.saveButton, { backgroundColor: 'rgba(255,255,255,0.92)' }]}
        >
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={15} color={saved ? theme.colors.freshness.prioritize : theme.colors.textPrimary} />
        </Pressable>
        <View style={[styles.labelPanel, { backgroundColor: theme.colors.backgroundElevated, borderRadius: theme.radius.md }]}>
          <Text numberOfLines={1} style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>
            {recipe.title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 1 }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.92,
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
