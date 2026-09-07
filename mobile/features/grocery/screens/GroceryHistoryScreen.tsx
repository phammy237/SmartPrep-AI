import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState, LoadingState, Screen } from '@/components';
import { useGroceryHistory } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { GroceryTripSummary } from '@/types';
import { formatRelativeDay } from '@/utils/format';

function GroceryTripRow({ trip }: { trip: GroceryTripSummary }) {
  const theme = useTheme();
  const preview = trip.itemPreview.join(', ');
  const extra = trip.itemCount - trip.itemPreview.length;
  const parts = [
    `${trip.itemCount} ${trip.itemCount === 1 ? 'item' : 'items'}`,
    `${trip.acquiredCount} acquired`,
  ];
  if (trip.transferredCount > 0) parts.push(`${trip.transferredCount} to pantry`);

  return (
    <Pressable
      onPress={() => router.push(`/grocery/history/${trip.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Shopping trip from ${formatRelativeDay(trip.completedAt)}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.backgroundElevated,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={[styles.glyph, { backgroundColor: theme.colors.accentMuted, borderRadius: theme.radius.md }]}>
        <Ionicons name="cart-outline" size={22} color={theme.colors.accent} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
          {formatRelativeDay(trip.completedAt)}
        </Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{parts.join(' · ')}</Text>
        {preview ? (
          <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {preview}
            {extra > 0 ? ` +${extra} more` : ''}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

export function GroceryHistoryScreen() {
  const theme = useTheme();
  const historyQuery = useGroceryHistory();
  const trips = historyQuery.data ?? [];

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Shopping History</Text>
        <View style={{ width: 24 }} />
      </View>

      {historyQuery.isLoading ? (
        <LoadingState fullscreen message="Loading your trips..." />
      ) : historyQuery.isError ? (
        <EmptyState
          title="Couldn't load shopping history"
          message="Something went wrong. Please try again."
          actionLabel="Retry"
          onActionPress={() => historyQuery.refetch()}
        />
      ) : trips.length === 0 ? (
        <EmptyState
          title="No completed trips yet"
          message="Finish a shopping trip from your grocery list to see it here."
        />
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          renderItem={({ item }) => <GroceryTripRow trip={item} />}
          refreshControl={
            <RefreshControl
              refreshing={historyQuery.isRefetching}
              onRefresh={() => historyQuery.refetch()}
              tintColor={theme.colors.accent}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  glyph: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
