import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { Recipe } from '@/types';
import { formatMinutes } from '@/utils/format';

interface TonightCardProps {
  recipe: Recipe;
  ownedCount: number;
  needsAttentionCount: number;
  onPress: () => void;
}

export function TonightCard({ recipe, ownedCount, needsAttentionCount, onPress }: TonightCardProps) {
  const theme = useTheme();

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <View style={{ height: 190 }}>
        <Image
          source={{ uri: recipe.imageUri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={150}
        />
        <View
          style={[
            styles.matchPill,
            { backgroundColor: 'rgba(255,255,255,0.94)' },
          ]}
        >
          <Ionicons name="sparkles" size={12} color={theme.colors.accent} />
          <Text style={[theme.typography.caption, { color: theme.colors.textPrimary }]}>
            {recipe.smartMatchScore}% match
          </Text>
        </View>
      </View>
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
        <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>{recipe.title}</Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
          {formatMinutes(recipe.prepTimeMinutes + recipe.cookTimeMinutes)}
        </Text>
        <Text style={[theme.typography.callout, { color: theme.colors.textSecondary }]}>
          Uses {ownedCount} ingredients you already have.
          {needsAttentionCount > 0 ? ` Uses ${needsAttentionCount} ingredients that need attention.` : ''}
        </Text>
        <Button label="Cook This" onPress={onPress} fullWidth />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  matchPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
});
