import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { FreshnessTag, IngredientAvatar, SectionHeader } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { PantryItem } from '@/types';

interface UseFirstSectionProps {
  items: PantryItem[];
}

export function UseFirstSection({ items }: UseFirstSectionProps) {
  const theme = useTheme();

  if (items.length === 0) return null;

  return (
    <>
      <SectionHeader
        title="Use First"
        subtitle="Ingredients that need attention"
        actionLabel="View Pantry"
        onActionPress={() => router.push('/pantry')}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.lg }}
      >
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => router.push(`/pantry/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.freshness.label}`}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: theme.colors.backgroundElevated, borderColor: theme.colors.border },
              pressed && { opacity: 0.9 },
            ]}
          >
            <IngredientAvatar imageUri={item.imageUri} variant="row" />
            <Text
              numberOfLines={1}
              style={[theme.typography.subhead, { color: theme.colors.textPrimary, marginTop: 8 }]}
            >
              {item.name}
            </Text>
            <FreshnessTag label={item.freshness.label} size="sm" />
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 112,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
});
