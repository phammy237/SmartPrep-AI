import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { Button, Screen } from '@/components';
import { useProcessReceipt } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { useReceiptSessionStore } from '@/store';

function messageFor(status: string): string {
  switch (status) {
    case 'invalid_image':
      return "That photo didn't read as a receipt. Retake it with the whole receipt flat and in frame.";
    case 'image_too_large':
      return 'That photo is too large. Move back so the full receipt fits and try again.';
    case 'rate_limited':
      return 'Too many scans just now. Wait a moment and try again.';
    case 'config_error':
    case 'auth_error':
      return 'Receipt scanning is unavailable right now. Try again later.';
    case 'malformed_upstream':
      return "Couldn't read the receipt data. Retake the photo or add items manually.";
    default:
      return 'Something went wrong reading that receipt. Try again or add items manually.';
  }
}

export function ReceiptProcessingScreen() {
  const theme = useTheme();
  const image = useReceiptSessionStore((s) => s.image);
  const setResult = useReceiptSessionStore((s) => s.setResult);
  const process = useProcessReceipt();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  const run = () => {
    if (!image) {
      router.replace('/scan/receipt/capture');
      return;
    }
    setError(null);
    setEmpty(false);
    process.mutate(
      { base64: image.base64, mimeType: image.mimeType },
      {
        onSuccess: (res) => {
          if (res.status === 'ok') {
            setResult(res.ocr, res.candidates);
            router.replace('/scan/receipt/review');
          } else if (res.status === 'no_line_items') {
            setResult(res.ocr, []);
            setEmpty(true);
          } else {
            setError(messageFor(res.status));
          }
        },
        onError: (e) => setError(e instanceof Error && e.message === 'Not signed in' ? 'Please sign in again.' : messageFor('unknown')),
      },
    );
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.lg }}>
      {process.isPending && !error && !empty ? (
        <>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Reading receipt…</Text>
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary, textAlign: 'center' }]}>
            This can take a few seconds.
          </Text>
        </>
      ) : empty ? (
        <>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>No grocery items found</Text>
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary, textAlign: 'center' }]}>
            We couldn't pick out any items from that receipt.
          </Text>
          <Button label="Retake photo" onPress={() => router.replace('/scan/receipt/capture')} fullWidth />
          <Button label="Add items manually" variant="secondary" onPress={() => router.replace('/pantry/add')} fullWidth />
        </>
      ) : error ? (
        <>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Couldn't read that receipt</Text>
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary, textAlign: 'center' }]}>{error}</Text>
          <Button label="Retake photo" onPress={() => router.replace('/scan/receipt/capture')} fullWidth />
          <Button label="Add items manually" variant="secondary" onPress={() => router.replace('/pantry/add')} fullWidth />
        </>
      ) : null}
    </Screen>
  );
}
