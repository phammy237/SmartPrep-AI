import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { useScanSessionStore } from '@/store';
import { ScanSection } from '@/types';
import { GUIDED_SECTIONS, SECTION_LABELS } from '../constants';

export function GuidedSectionsScreen() {
  const theme = useTheme();
  const scan = useScanSessionStore((s) => s.scan);
  const markSectionSkipped = useScanSessionStore((s) => s.markSectionSkipped);

  const sectionsById = new Map((scan?.sections ?? []).map((s) => [s.section, s]));
  const allResolved = GUIDED_SECTIONS.every((s) => sectionsById.has(s));
  const anyCaptured = GUIDED_SECTIONS.some((s) => sectionsById.get(s) && !sectionsById.get(s)?.skipped);

  const startCapture = (section: ScanSection) => {
    router.push({ pathname: '/scan/capture', params: { mode: 'guided', section } });
  };

  return (
    <Screen scroll contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Full Kitchen Scan</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
        </Pressable>
      </View>
      <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
        Scan each area of your kitchen. You can skip any section and come back later.
      </Text>

      <View style={{ gap: theme.spacing.md }}>
        {GUIDED_SECTIONS.map((section) => {
          const result = sectionsById.get(section);
          const status = !result ? 'pending' : result.skipped ? 'skipped' : 'captured';

          return (
            <View
              key={section}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                backgroundColor: theme.colors.backgroundElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.lg,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
                  {SECTION_LABELS[section]}
                </Text>
                <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
                  {status === 'captured'
                    ? `${result?.detections.length ?? 0} items found`
                    : status === 'skipped'
                      ? 'Skipped'
                      : 'Not scanned yet'}
                </Text>
              </View>
              {status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <Pressable
                    onPress={() => markSectionSkipped(section)}
                    accessibilityRole="button"
                    accessibilityLabel={`Skip ${SECTION_LABELS[section]}`}
                    hitSlop={8}
                  >
                    <Text style={[theme.typography.subhead, { color: theme.colors.textTertiary }]}>Skip</Text>
                  </Pressable>
                  <Button label="Scan" size="md" onPress={() => startCapture(section)} />
                </View>
              ) : (
                <Pressable onPress={() => startCapture(section)} accessibilityRole="button" accessibilityLabel={`Rescan ${SECTION_LABELS[section]}`}>
                  <Ionicons name="refresh" size={20} color={theme.colors.textTertiary} />
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />
      <Button
        label="Continue to Review"
        onPress={() => router.push('/scan/review')}
        disabled={!allResolved || !anyCaptured}
        fullWidth
      />
    </Screen>
  );
}
