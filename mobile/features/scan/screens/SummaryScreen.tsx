import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';

export function SummaryScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    ingredientsAdded: string;
    needsAttentionCount: string;
    quantityCorrectedCount: string;
    mealsPossibleEstimate: string;
  }>();

  const ingredientsAdded = Number(params.ingredientsAdded ?? 0);
  const needsAttentionCount = Number(params.needsAttentionCount ?? 0);
  const quantityCorrectedCount = Number(params.quantityCorrectedCount ?? 0);
  const mealsPossibleEstimate = Number(params.mealsPossibleEstimate ?? 0);

  const stats = [
    { label: `ingredient${ingredientsAdded === 1 ? '' : 's'} added`, value: ingredientsAdded },
    { label: 'should be used soon', value: needsAttentionCount },
    { label: `quantit${quantityCorrectedCount === 1 ? 'y' : 'ies'} corrected`, value: quantityCorrectedCount },
  ];

  return (
    <Screen contentContainerStyle={{ padding: theme.spacing.xl, justifyContent: 'space-between' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl }}>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: theme.colors.accentMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="checkmark" size={44} color={theme.colors.accent} />
        </View>
        <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary, textAlign: 'center' }]}>
          Kitchen updated
        </Text>

        <Card style={{ width: '100%' }}>
          {stats.map((stat, index) => (
            <View
              key={stat.label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: theme.spacing.sm,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{stat.label}</Text>
              <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>{stat.value}</Text>
            </View>
          ))}
        </Card>

        {mealsPossibleEstimate > 0 ? (
          <Text style={[theme.typography.title3, { color: theme.colors.textPrimary, textAlign: 'center' }]}>
            You can make {mealsPossibleEstimate} meal{mealsPossibleEstimate === 1 ? '' : 's'} right now.
          </Text>
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <Button label="Find Something to Cook" onPress={() => router.replace('/(tabs)/home')} fullWidth />
        <Button label="View Pantry" variant="secondary" onPress={() => router.replace('/(tabs)/pantry')} fullWidth />
      </View>
    </Screen>
  );
}
