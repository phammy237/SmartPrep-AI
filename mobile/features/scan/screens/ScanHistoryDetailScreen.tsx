import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, LoadingState, Screen } from '@/components';
import { useScanDetail } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { ScanRecordDetection } from '@/types';
import { formatQuantity } from '@/utils/format';
import { formatRelativeDay } from '@/utils/format';
import { SECTION_LABELS } from '../constants';

function DetectionRow({ detection }: { detection: ScanRecordDetection }) {
  const theme = useTheme();
  const pending = detection.pantryItemId === null;

  return (
    <View
      style={[
        styles.row,
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
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary, flex: 1 }]} numberOfLines={1}>
          {detection.name}
        </Text>
        <Text style={[theme.typography.callout, { color: theme.colors.textSecondary }]}>
          {formatQuantity(detection.quantity, detection.unit)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {detection.section ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            {SECTION_LABELS[detection.section]}
          </Text>
        ) : null}
        {detection.quantityEdited ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>· quantity edited</Text>
        ) : null}
        {pending ? (
          <Text style={[theme.typography.caption, { color: theme.colors.freshness.useSoon }]}>· not yet saved</Text>
        ) : null}
      </View>
    </View>
  );
}

export function ScanHistoryDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detailQuery = useScanDetail(id ?? '');
  const scan = detailQuery.data;

  const engaged = scan?.sections.filter((s) => !s.skipped).map((s) => SECTION_LABELS[s.section]) ?? [];
  const subtitle = scan
    ? [
        scan.mode === 'quick' ? 'Quick Scan' : 'Kitchen Scan',
        engaged.length > 0 ? engaged.join(', ') : null,
        `${formatRelativeDay(scan.confirmedAt ?? scan.createdAt)}`,
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
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Scan Detail</Text>
        <View style={{ width: 24 }} />
      </View>

      {detailQuery.isLoading ? (
        <LoadingState fullscreen message="Loading scan..." />
      ) : detailQuery.isError ? (
        <EmptyState
          title="Couldn't load this scan"
          message="Something went wrong. Please try again."
          actionLabel="Retry"
          onActionPress={() => detailQuery.refetch()}
        />
      ) : !scan ? (
        <EmptyState title="Scan not found" message="It may have been removed." />
      ) : (
        <FlatList
          data={scan.detections}
          keyExtractor={(d) => d.detectionId}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: 4, marginBottom: theme.spacing.sm }}>
              <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
                {scan.confirmedItemCount} {scan.confirmedItemCount === 1 ? 'item' : 'items'} added
              </Text>
              <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, marginTop: 2 }]}>
                Scan history stores the confirmed results only — the photo isn't kept.
              </Text>
            </View>
          }
          renderItem={({ item }) => <DetectionRow detection={item} />}
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
    borderWidth: StyleSheet.hairlineWidth,
  },
});
