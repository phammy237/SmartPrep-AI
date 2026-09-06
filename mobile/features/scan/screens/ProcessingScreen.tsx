import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Screen } from '@/components';
import { useProcessCapture } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { ScanInferenceError } from '@/services';
import { useScanSessionStore } from '@/store';
import { ProcessingAnimation } from '../components/ProcessingAnimation';

function messageFor(err: unknown): string {
  const code = err instanceof ScanInferenceError ? err.code : 'unknown';
  switch (code) {
    case 'unauthenticated':
      return 'Your session expired. Sign in again and retry.';
    case 'network':
      return "You're offline. Reconnect and try again.";
    case 'rate_limited':
      return 'The scanner is busy right now. Wait a moment and try again.';
    case 'upstream_timeout':
      return 'That took too long. Try again in good light with the items in frame.';
    case 'image_too_large':
      return 'That photo was too large. Retake it a bit further back.';
    default:
      return "We couldn't read that photo. Try again, or add items by hand.";
  }
}

export function ProcessingScreen() {
  const theme = useTheme();
  const processCapture = useProcessCapture();
  const pendingCapture = useScanSessionStore((s) => s.pendingCapture);
  const clearPendingCapture = useScanSessionStore((s) => s.clearPendingCapture);
  const setSectionResult = useScanSessionStore((s) => s.setSectionResult);
  const markSectionSkipped = useScanSessionStore((s) => s.markSectionSkipped);
  const [failed, setFailed] = useState<unknown>(null);
  const started = useRef(false);

  const run = useCallback(() => {
    if (!pendingCapture) return;
    setFailed(null);
    processCapture.mutate(
      {
        mode: pendingCapture.mode,
        section: pendingCapture.section,
        image: pendingCapture.image,
        previewUri: pendingCapture.previewUri,
      },
      {
        onSuccess: () => {
          clearPendingCapture();
          router.replace(pendingCapture.mode === 'guided' ? '/scan/sections' : '/scan/review');
        },
        onError: (err) => setFailed(err),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCapture]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  if (!pendingCapture) {
    return (
      <Screen contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl }}>
        <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>No photo to process</Text>
        <Button label="Back to Scan" onPress={() => router.replace('/scan')} />
      </Screen>
    );
  }

  if (failed) {
    const { mode, section, previewUri } = pendingCapture;
    return (
      <Screen contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg, padding: theme.spacing.xl }}>
        <Ionicons name="cloud-offline-outline" size={40} color={theme.colors.textTertiary} />
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary, textAlign: 'center' }]}>{messageFor(failed)}</Text>
        <View style={{ gap: theme.spacing.sm, alignSelf: 'stretch' }}>
          <Button label="Try again" onPress={run} loading={processCapture.isPending} fullWidth />
          <Button
            label="Add items by hand"
            variant="secondary"
            onPress={() => {
              // Flow to Review with the photo but no detections - the user adds items manually.
              setSectionResult({ section, imageUri: previewUri, detections: [], skipped: false });
              clearPendingCapture();
              router.replace(mode === 'guided' ? '/scan/sections' : '/scan/review');
            }}
            fullWidth
          />
          {mode === 'guided' ? (
            <Button
              label="Skip this section"
              variant="ghost"
              onPress={() => {
                markSectionSkipped(section);
                clearPendingCapture();
                router.replace('/scan/sections');
              }}
              fullWidth
            />
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <ProcessingAnimation />
      </View>
    </Screen>
  );
}
