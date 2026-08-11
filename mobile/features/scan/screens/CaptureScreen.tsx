import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScanMode, ScanSection } from '@/types';
import { haptics } from '@/utils/haptics';
import { placeholderPhotoUri } from '@/utils/ingredientPhoto';
import { SECTION_LABELS } from '../constants';

export function CaptureScreen() {
  const { mode, section } = useLocalSearchParams<{ mode: ScanMode; section: ScanSection }>();
  const [capturing, setCapturing] = useState(false);
  const label = SECTION_LABELS[section] ?? 'your kitchen';
  const previewUri = placeholderPhotoUri(`scan-${mode}-${section}`, 900, 1200);

  const handleCapture = () => {
    if (capturing) return;
    haptics.tap();
    setCapturing(true);
    setTimeout(() => {
      router.replace({ pathname: '/scan/processing', params: { mode, section, imageUri: previewUri } });
    }, 350);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={10}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.topLabel}>{label}</Text>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.viewfinder}>
          <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
          <View style={styles.dim} />
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <Text style={styles.hint}>Position {label.toLowerCase()} in frame</Text>
        </View>

        <View style={styles.shutterRow}>
          <Pressable
            onPress={handleCapture}
            disabled={capturing}
            accessibilityRole="button"
            accessibilityLabel="Capture photo"
            style={[styles.shutter, capturing && { opacity: 0.6 }]}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const CORNER_SIZE = 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  safe: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  viewfinder: {
    flex: 1,
    margin: 24,
    borderRadius: 24,
    backgroundColor: '#1c1c1c',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  hint: {
    color: '#fff',
    fontSize: 15,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#fff',
  },
  cornerTL: { top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: 16, left: 16, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 16, right: 16, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  shutterRow: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
