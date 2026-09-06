import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState, LoadingState, Screen } from '@/components';
import { useScanHistory } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { ScanRecord } from '@/types';
import { formatRelativeDay } from '@/utils/format';
import { SECTION_LABELS } from '../constants';

function formatTimestamp(iso: string): string {
  const time = new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${formatRelativeDay(iso)} · ${time}`;
}

function modeLabel(record: ScanRecord): string {
  if (record.mode === 'quick') return 'Quick Scan';
  const engaged = record.sections.filter((s) => !s.skipped).map((s) => SECTION_LABELS[s.section]);
  return engaged.length > 0 ? `Kitchen Scan · ${engaged.join(', ')}` : 'Kitchen Scan';
}

function ScanHistoryRow({ record }: { record: ScanRecord }) {
  const theme = useTheme();
  const preview = record.ingredientPreview.join(', ');
  const extra = record.confirmedItemCount - record.ingredientPreview.length;

  return (
    <Pressable
      onPress={() => router.push(`/scan/history/${record.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Scan from ${formatTimestamp(record.confirmedAt ?? record.createdAt)}`}
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
      {/* Scans store structured results, never the source photo - so this is a
          neutral glyph, not an image thumbnail. */}
      <View
        style={[
          styles.glyph,
          { backgroundColor: theme.colors.accentMuted, borderRadius: theme.radius.md },
        ]}
      >
        <Ionicons name="scan-outline" size={22} color={theme.colors.accent} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
          {record.confirmedItemCount} {record.confirmedItemCount === 1 ? 'item' : 'items'} added
        </Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
          {formatTimestamp(record.confirmedAt ?? record.createdAt)} · {modeLabel(record)}
        </Text>
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

export function ScanHistoryScreen() {
  const theme = useTheme();
  const historyQuery = useScanHistory();
  const scans = historyQuery.data ?? [];

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Scan History</Text>
        <View style={{ width: 24 }} />
      </View>

      {historyQuery.isLoading ? (
        <LoadingState fullscreen message="Loading your scans..." />
      ) : historyQuery.isError ? (
        <EmptyState
          title="Couldn't load scan history"
          message="Something went wrong. Please try again."
          actionLabel="Retry"
          onActionPress={() => historyQuery.refetch()}
        />
      ) : scans.length === 0 ? (
        <EmptyState
          title="No scans yet"
          message="Scan your kitchen and confirm the results to see them here."
        />
      ) : (
        <FlatList
          data={scans}
          keyExtractor={(s) => s.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          renderItem={({ item }) => <ScanHistoryRow record={item} />}
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
