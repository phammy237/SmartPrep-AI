import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge, Chip, FreshnessTag, IngredientAvatar } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { useScanSessionStore } from '@/store';
import { ScanDetection } from '@/types';
import { formatConfidence } from '@/utils/format';
import { FRESHNESS_LABELS, FRESHNESS_META, FRESHNESS_OVERRIDE_VALUES } from '@/utils/freshness';
import { QuantityVerifier } from './QuantityVerifier';

interface DetectionCardProps {
  detection: ScanDetection;
  isActive: boolean;
  onPress: () => void;
}

export function DetectionCard({ detection, isActive, onPress }: DetectionCardProps) {
  const theme = useTheme();
  const updateDetection = useScanSessionStore((s) => s.updateDetection);
  const removeDetection = useScanSessionStore((s) => s.removeDetection);
  const restoreDetection = useScanSessionStore((s) => s.restoreDetection);
  const [editingFreshness, setEditingFreshness] = useState(false);

  if (detection.isRemoved) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          opacity: 0.6,
        }}
      >
        <Text style={[theme.typography.subhead, { color: theme.colors.textTertiary, textDecorationLine: 'line-through' }]}>
          {detection.name}
        </Text>
        <Pressable onPress={() => restoreDetection(detection.id)} accessibilityRole="button" accessibilityLabel={`Restore ${detection.name}`}>
          <Text style={[theme.typography.subhead, { color: theme.colors.accent }]}>Undo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${detection.name} detection card`}
      style={{
        borderWidth: isActive ? 2 : 1,
        borderColor: isActive ? theme.colors.accent : theme.colors.border,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.backgroundElevated,
        gap: theme.spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <IngredientAvatar imageUri={detection.imageUri} variant="row" />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>{detection.name}</Text>
            <Pressable
              onPress={() => removeDetection(detection.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${detection.name}`}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={22} color={theme.colors.textTertiary} />
            </Pressable>
          </View>
          <Badge label={`${formatConfidence(detection.detectionConfidence)} detection confidence`} tone="neutral" />

          <QuantityVerifier
            quantity={detection.quantity}
            onChange={(value) =>
              updateDetection(detection.id, { quantity: { ...detection.quantity, value }, isQuantityEdited: true })
            }
          />

          <View style={{ gap: 6 }}>
            <Pressable
              onPress={() => setEditingFreshness((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Edit freshness"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <FreshnessTag label={detection.freshness.label} size="sm" />
              <Text style={[theme.typography.caption, { color: theme.colors.accent }]}>
                {editingFreshness ? 'Done' : 'Edit'}
              </Text>
            </Pressable>
            {editingFreshness ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {FRESHNESS_LABELS.map((label) => (
                  <Chip
                    key={label}
                    label={FRESHNESS_META[label].label}
                    selected={detection.freshness.label === label}
                    onPress={() =>
                      updateDetection(detection.id, {
                        freshness: { ...detection.freshness, label, ...FRESHNESS_OVERRIDE_VALUES[label], isManualOverride: true },
                        isFreshnessEdited: true,
                      })
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
