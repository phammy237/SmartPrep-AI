import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBarcodeLookup } from '@/hooks';
import { BarcodeLookupErrorReason, BarcodeLookupResult, createScanGate } from '@/lib/barcode';
import { useBarcodeSessionStore } from '@/store';
import { haptics } from '@/utils/haptics';

const BARCODE_TYPES = ['upc_a', 'upc_e', 'ean13', 'ean8'] as const;

function messageForError(reason: BarcodeLookupErrorReason): string {
  switch (reason) {
    case 'invalid_barcode':
      return "That doesn't look like a valid grocery barcode. Try again or type it in.";
    case 'offline':
      return "You're offline. Reconnect and try again.";
    case 'rate_limited':
      return 'Too many lookups just now. Wait a moment and try again.';
    case 'provider_unavailable':
      return 'The product database is unavailable right now. Try again shortly.';
    case 'auth':
      return 'Please sign in again to look up products.';
    case 'malformed_response':
      return "Couldn't read the product data. Try again or add it manually.";
    default:
      return "Something went wrong looking that up. Try again or add it manually.";
  }
}

export function BarcodeScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const lookup = useBarcodeLookup();
  const setPending = useBarcodeSessionStore((s) => s.setPending);
  const gate = useRef(createScanGate());

  const [phase, setPhase] = useState<'scanning' | 'looking_up' | 'error'>('scanning');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const handleResult = (result: BarcodeLookupResult) => {
    if (result.status === 'found') {
      haptics.success();
      setPending({ barcode: result.product.barcode, candidate: result.product, status: 'found' });
      router.replace('/scan/barcode/review');
      return;
    }
    if (result.status === 'not_found') {
      setPending({ barcode: result.barcode, candidate: null, status: 'not_found' });
      router.replace('/scan/barcode/review');
      return;
    }
    setPhase('error');
    setErrorText(messageForError(result.reason));
  };

  const runLookup = (barcode: string, upcE: boolean) => {
    setPhase('looking_up');
    setErrorText(null);
    lookup.mutate(
      { barcode, upcE },
      {
        onSuccess: handleResult,
        onError: () => {
          setPhase('error');
          setErrorText("Something went wrong looking that up. Try again or add it manually.");
        },
      },
    );
  };

  const onBarcodeScanned = ({ data, type }: { data: string; type: string }) => {
    if (phase !== 'scanning') return;
    if (!gate.current.claim(data)) return;
    haptics.tap();
    runLookup(data, type === 'upc_e');
  };

  const scanAgain = () => {
    gate.current.reset();
    setErrorText(null);
    setPhase('scanning');
  };

  const submitManual = () => {
    const value = manual.trim();
    if (!value || lookup.isPending) return;
    // Manual entry goes through the EXACT same normalize -> lookup pipeline.
    runLookup(value, false);
  };

  const cameraReady = permission?.granted && phase !== 'error';

  return (
    <View style={styles.container}>
      {cameraReady ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={phase === 'scanning' ? onBarcodeScanned : undefined}
        />
      ) : null}

      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={10} style={styles.iconButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.topLabel}>Scan a barcode</Text>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.middle}>
          {!permission ? (
            <ActivityIndicator color="#fff" />
          ) : !permission.granted ? (
            <View style={styles.centered}>
              <Ionicons name="barcode-outline" size={40} color="#fff" />
              <Text style={styles.permissionText}>
                Camera access lets you scan a package barcode. You can also type a barcode below.
              </Text>
              {permission.canAskAgain ? (
                <Pressable onPress={requestPermission} style={styles.permissionButton} accessibilityRole="button">
                  <Text style={styles.permissionButtonText}>Enable camera</Text>
                </Pressable>
              ) : (
                <Text style={styles.permissionHint}>Turn it on for SmartPrep in your device Settings.</Text>
              )}
            </View>
          ) : phase === 'looking_up' ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.permissionText}>Looking up that product…</Text>
            </View>
          ) : phase === 'error' ? (
            <View style={styles.centered}>
              <Ionicons name="alert-circle-outline" size={40} color="#ffb4a2" />
              <Text style={styles.permissionText}>{errorText}</Text>
              <Pressable onPress={scanAgain} style={styles.permissionButton} accessibilityRole="button">
                <Text style={styles.permissionButtonText}>Scan again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.viewfinder}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <Text style={styles.hint}>Line up the barcode</Text>
            </View>
          )}
        </View>

        <View style={styles.manualCard}>
          <Text style={styles.manualLabel}>Or enter the barcode</Text>
          <View style={styles.manualRow}>
            <TextInput
              value={manual}
              onChangeText={setManual}
              placeholder="e.g. 0123456789012"
              placeholderTextColor="rgba(255,255,255,0.4)"
              keyboardType="number-pad"
              style={styles.manualInput}
              accessibilityLabel="Barcode"
              onSubmitEditing={submitManual}
              returnKeyType="search"
            />
            <Pressable
              onPress={submitManual}
              disabled={!manual.trim() || lookup.isPending}
              accessibilityRole="button"
              accessibilityLabel="Look up barcode"
              style={[styles.manualButton, (!manual.trim() || lookup.isPending) && { opacity: 0.5 }]}
            >
              {lookup.isPending ? <ActivityIndicator color="#111" /> : <Text style={styles.manualButtonText}>Look up</Text>}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const CORNER_SIZE = 28;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  safe: { flex: 1, justifyContent: 'space-between' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permissionText: { color: '#fff', fontSize: 16, textAlign: 'center' },
  permissionHint: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' },
  permissionButton: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  permissionButtonText: { color: '#111', fontSize: 15, fontWeight: '600' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  viewfinder: { width: 260, height: 170, alignItems: 'center', justifyContent: 'center' },
  hint: {
    color: '#fff',
    fontSize: 15,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: '#fff' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  manualCard: { padding: 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  manualLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  manualRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  manualInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  manualButton: { backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, minWidth: 92, alignItems: 'center' },
  manualButtonText: { color: '#111', fontSize: 15, fontWeight: '600' },
});
