import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, LoadingState, Screen } from '@/components';
import { useGroceryTrip } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { GroceryItemSource, GroceryListItem } from '@/types';
import { formatQuantity, formatRelativeDay } from '@/utils/format';

const SOURCE_LABEL: Record<GroceryItemSource, string> = {
  manual: 'Manual',
  recipe: 'Recipe',
  meal_plan: 'Meal Plan',
  pantry_shortage: 'Pantry',
};

function TripItemRow({ item }: { item: GroceryListItem }) {
  const theme = useTheme();
  const tags: { label: string; tone: 'muted' | 'accent' }[] = [];
  if (item.isChecked) tags.push({ label: 'Acquired', tone: 'muted' });
  if (item.pantryTransferStatus === 'transferred') tags.push({ label: 'Added to pantry', tone: 'accent' });
  if (item.source && item.source !== 'manual') tags.push({ label: SOURCE_LABEL[item.source], tone: 'muted' });

  return (
    <View
      style={[
        styles.itemRow,
        {
          backgroundColor: theme.colors.backgroundElevated,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.xs,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          style={[
            theme.typography.headline,
            {
              color: item.isChecked ? theme.colors.textSecondary : theme.colors.textPrimary,
              flex: 1,
            },
          ]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text style={[theme.typography.callout, { color: theme.colors.textSecondary }]}>
          {formatQuantity(item.quantity, item.unit)}
        </Text>
      </View>
      {tags.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {tags.map((tag) => (
            <Text
              key={tag.label}
              style={[
                theme.typography.caption,
                { color: tag.tone === 'accent' ? theme.colors.accent : theme.colors.textTertiary },
              ]}
            >
              {tag.label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function GroceryHistoryDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripQuery = useGroceryTrip(id ?? '');
  const trip = tripQuery.data;

  const subtitle = trip
    ? [
        `${trip.itemCount} ${trip.itemCount === 1 ? 'item' : 'items'}`,
        `${trip.acquiredCount} acquired`,
        trip.transferredCount > 0 ? `${trip.transferredCount} to pantry` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Shopping Trip</Text>
        <View style={{ width: 24 }} />
      </View>

      {tripQuery.isLoading ? (
        <LoadingState fullscreen message="Loading trip..." />
      ) : tripQuery.isError ? (
        <EmptyState
          title="Couldn't load this trip"
          message="Something went wrong. Please try again."
          actionLabel="Retry"
          onActionPress={() => tripQuery.refetch()}
        />
      ) : !trip ? (
        <EmptyState title="Trip not found" message="It may have been removed." />
      ) : (
        <FlatList
          data={trip.items}
          keyExtractor={(i) => i.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: 4, marginBottom: theme.spacing.sm }}>
              <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
                {formatRelativeDay(trip.completedAt)}
              </Text>
              <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, marginTop: 2 }]}>
                This shopping trip is complete and can&apos;t be changed.
              </Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]}>
              This trip had no items.
            </Text>
          }
          renderItem={({ item }) => <TripItemRow item={item} />}
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
  itemRow: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
