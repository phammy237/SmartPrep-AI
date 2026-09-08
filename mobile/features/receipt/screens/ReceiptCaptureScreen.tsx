import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useReceiptSessionStore } from '@/store';
import { haptics } from '@/utils/haptics';

// ~4 MB base64. The Edge Function rejects anything larger; keep the capture small.
const MAX_RECEIPT_BASE64_CHARS = 4_000_000;
const RECEIPT_JPEG_QUALITY = 0.5;

export function ReceiptCaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const setImage = useReceiptSessionStore((s) => s.setImage);
  const beginSession = useReceiptSessionStore((s) => s.begin);
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = async () => {
    if (capturing || !cameraRef.current) return;
    haptics.tap();
    setCapturing(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: RECEIPT_JPEG_QUALITY, base64: true, skipProcessing: false });
      if (!photo?.base64) {
        setError("Couldn't read that photo. Try again.");
        setCapturing(false);
        return;
      }
      if (photo.base64.length > MAX_RECEIPT_BASE64_CHARS) {
        setError('That photo is too large. Move back so the whole receipt fits, then try again.');
        setCapturing(false);
        return;
      }
      beginSession();
      setImage({ base64: photo.base64, mimeType: 'image/jpeg', width: photo.width, height: photo.height });
      router.replace('/scan/receipt/processing');
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
          <Ionicons name="receipt-outline" size={40} color="#fff" />
          <Text style={styles.text}>SmartPrep needs your camera to read a grocery receipt.</Text>
          {permission.canAskAgain ? (
            <Pressable onPress={requestPermission} style={styles.button} accessibilityRole="button">
              <Text style={styles.buttonText}>Enable camera</Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>Turn it on for SmartPrep in your device Settings.</Text>
          )}
          <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.hint}>Go back</Text>
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
          <Text style={styles.topLabel}>Scan a receipt</Text>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <Text style={styles.frameHint}>Fit the full receipt in the frame</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.shutterRow}>
          <Pressable
            onPress={handleCapture}
            disabled={capturing}
            accessibilityRole="button"
            accessibilityLabel="Capture receipt photo"
            style={[styles.shutter, capturing && { opacity: 0.6 }]}
          >
            {capturing ? <ActivityIndicator color="#111" /> : null}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const CORNER = 28;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  safe: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  text: { color: '#fff', fontSize: 16, textAlign: 'center' },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' },
  button: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  buttonText: { color: '#111', fontSize: 15, fontWeight: '600' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  viewfinder: { flex: 1, margin: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 16 },
  frameHint: { color: '#fff', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  error: { color: '#ffb4a2', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff' },
  cornerTL: { top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: 44, left: 16, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 44, right: 16, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  shutterRow: { alignItems: 'center', paddingVertical: 28 },
  shutter: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', borderWidth: 4, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
});
