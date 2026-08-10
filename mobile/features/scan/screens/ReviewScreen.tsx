import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, FilterBar, Screen } from '@/components';
import { useConfirmScan } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { useScanSessionStore } from '@/store';
import { ScanDetection, ScanSection } from '@/types';
import { generateId } from '@/utils/id';
import { haptics } from '@/utils/haptics';
import { AddIngredientPanel } from '../components/AddIngredientPanel';
import { SECTION_LABELS } from '../constants';
import { DetectionBoundingBox } from '../components/DetectionBoundingBox';
import { DetectionCard } from '../components/DetectionCard';

export function ReviewScreen() {
  const theme = useTheme();
  const scan = useScanSessionStore((s) => s.scan);
  const activeDetectionId = useScanSessionStore((s) => s.activeDetectionId);
  const setActiveDetectionId = useScanSessionStore((s) => s.setActiveDetectionId);
  const addManualDetection = useScanSessionStore((s) => s.addManualDetection);
  const reset = useScanSessionStore((s) => s.reset);
  const confirmScan = useConfirmScan();
  const listRef = useRef<FlatList<ScanDetection>>(null);
  const [activeSection, setActiveSection] = useState<ScanSection | null>(null);

  const capturedSections = (scan?.sections ?? []).filter((s) => !s.skipped && s.imageUri);
  const section = capturedSections.find((s) => s.section === activeSection) ?? capturedSections[0];

  useEffect(() => {
    if (!activeSection && capturedSections[0]) {
      setActiveSection(capturedSections[0].section);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedSections.length]);

  if (!scan || capturedSections.length === 0) {
    return (
      <Screen contentContainerStyle={{ padding: theme.spacing.xl, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}>
        <Text style={[theme.typography.title2, { color: theme.colors.textPrimary, textAlign: 'center' }]}>
          Nothing to review
        </Text>
        <Button label="Back to Scan" onPress={() => router.replace('/scan')} />
      </Screen>
    );
  }

  const detections = section?.detections ?? [];
  const allDetectedIds = (scan.sections ?? []).flatMap((s) => s.detections.map((d) => d.ingredientId));

  const handleConfirm = () => {
    confirmScan.mutate(scan, {
      onSuccess: ({ summary }) => {
        haptics.success();
        reset();
        router.replace({
          pathname: '/scan/summary',
          params: {
            ingredientsAdded: String(summary.ingredientsAdded),
            needsAttentionCount: String(summary.needsAttentionCount),
            quantityCorrectedCount: String(summary.quantityCorrectedCount),
            mealsPossibleEstimate: String(summary.mealsPossibleEstimate),
          },
        });
      },
    });
  };

  const focusDetection = (detectionId: string) => {
    setActiveDetectionId(detectionId);
    const index = detections.findIndex((d) => d.id === detectionId);
    if (index >= 0) {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: true });
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/scan')} accessibilityRole="button" accessibilityLabel="Cancel scan" hitSlop={8}>
          <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Review Scan</Text>
        <View style={{ width: 24 }} />
      </View>

      {capturedSections.length > 1 ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
          <FilterBar
            options={capturedSections.map((s) => ({ value: s.section, label: SECTION_LABELS[s.section] }))}
            selected={section?.section ?? capturedSections[0].section}
            onSelect={(value) => {
              setActiveSection(value);
              setActiveDetectionId(null);
            }}
          />
        </View>
      ) : null}

      <View
        style={[
          styles.imageWrap,
          { margin: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted },
        ]}
      >
        {section?.imageUri ? (
          <Image source={{ uri: section.imageUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : null}
        {detections
          .filter((d) => !d.isRemoved)
          .map((d) => (
            <DetectionBoundingBox
              key={d.id}
              box={d.boundingBox}
              label={d.name}
              isActive={activeDetectionId === d.id}
              onPress={() => focusDetection(d.id)}
            />
          ))}
      </View>

      <FlatList
        ref={listRef}
        data={detections}
        keyExtractor={(d) => d.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm, paddingBottom: 160 }}
        renderItem={({ item }) => (
          <DetectionCard detection={item} isActive={activeDetectionId === item.id} onPress={() => focusDetection(item.id)} />
        )}
        ListFooterComponent={
          <View style={{ marginTop: theme.spacing.sm }}>
            <AddIngredientPanel
              excludeIngredientIds={allDetectedIds}
              onAdd={(ingredient) => {
                if (!section) return;
                addManualDetection(section.section, {
                  id: generateId('det-manual'),
                  ingredientId: ingredient.id,
                  name: ingredient.name,
                  imageUri: ingredient.imageUri,
                  category: ingredient.category,
                  boundingBox: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
                  detectionConfidence: 1,
                  quantity: { value: 1, unit: ingredient.defaultUnit, confidence: 1, isLowConfidence: false },
                  freshness: { score: 85, confidence: 0.95, label: 'fresh' },
                  isUserAdded: true,
                });
              }}
            />
          </View>
        }
        onScrollToIndexFailed={() => {}}
      />

      <View style={[styles.footer, { backgroundColor: theme.colors.background, borderTopColor: theme.colors.border }]}>
        <Button label="Confirm Ingredients" onPress={handleConfirm} loading={confirmScan.isPending} fullWidth />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  imageWrap: {
    aspectRatio: 0.8,
    overflow: 'hidden',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
