import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_SCAN_IMAGE_BASE64_CHARS, SCAN_CAPTURE_JPEG_QUALITY } from '@/lib/scan/thresholds';
import { useScanSessionStore } from '@/store';
import { ScanMode, ScanSection } from '@/types';
import { haptics } from '@/utils/haptics';
import { SECTION_LABELS } from '../constants';

export function CaptureScreen() {
  const { mode, section } = useLocalSearchParams<{ mode: ScanMode; section: ScanSection }>();
  const [permission, requestPermission] = useCameraPermissions();
  const setPendingCapture = useScanSessionStore((s) => s.setPendingCapture);
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = SECTION_LABELS[section] ?? 'your kitchen';

  const handleCapture = async () => {
    if (capturing || !cameraRef.current) return;
    haptics.tap();
    setCapturing(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: SCAN_CAPTURE_JPEG_QUALITY,
        base64: true,
        skipProcessing: false,
      });
      if (!photo?.base64) {
        setError("Couldn't read that photo. Try again.");
        setCapturing(false);
        return;
      }
      if (photo.base64.length > MAX_SCAN_IMAGE_BASE64_CHARS) {
        setError('That photo is too large. Step back for a wider shot and try again.');
        setCapturing(false);
        return;
      }
      setPendingCapture({
        image: { base64: photo.base64, mimeType: 'image/jpeg', width: photo.width, height: photo.height },
        previewUri: photo.uri,
        mode,
        section,
      });
      router.replace('/scan/processing');
    } catch {
      setError("Couldn't take that photo. Try again.");
      setCapturing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={[styles.safe, styles.centered]}>
          <Ionicons name="camera-outline" size={40} color="#fff" />
          <Text style={styles.permissionText}>
            SmartPrep needs your camera to scan ingredients.
          </Text>
          {permission.canAskAgain ? (
            <Pressable onPress={requestPermission} style={styles.permissionButton} accessibilityRole="button">
              <Text style={styles.permissionButtonText}>Enable camera</Text>
            </Pressable>
          ) : (
            <Text style={styles.permissionHint}>Turn it on for SmartPrep in your device Settings.</Text>
          )}
          <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.permissionHint}>Go back</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={10} style={styles.iconButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.topLabel}>{label}</Text>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <Text style={styles.hint}>Position {label.toLowerCase()} in frame</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.shutterRow}>
          <Pressable
            onPress={handleCapture}
            disabled={capturing}
            accessibilityRole="button"
            accessibilityLabel="Capture photo"
            style={[styles.shutter, capturing && { opacity: 0.6 }]}
          >
            {capturing ? <ActivityIndicator color="#111" /> : null}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const CORNER_SIZE = 28;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  safe: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  permissionText: { color: '#fff', fontSize: 16, textAlign: 'center' },
  permissionHint: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' },
  permissionButton: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  permissionButtonText: { color: '#111', fontSize: 15, fontWeight: '600' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  viewfinder: { flex: 1, margin: 24, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  hint: {
    color: '#fff',
    fontSize: 15,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  error: { color: '#ffb4a2', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: '#fff' },
  cornerTL: { top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: 16, left: 16, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 16, right: 16, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  shutterRow: { alignItems: 'center', paddingVertical: 28 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
