import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface SmartPrepLogoProps {
  size?: number;
}

/** Viewfinder-bracket mark framing a leaf - nods to the scan-first product idea. */
export function SmartPrepLogo({ size = 28 }: SmartPrepLogoProps) {
  const theme = useTheme();
  const corner = size * 0.32;
  const stroke = Math.max(1.5, size * 0.06);

  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.corner, { width: corner, height: corner, top: 0, left: 0, borderTopWidth: stroke, borderLeftWidth: stroke, borderColor: theme.colors.accent, borderTopLeftRadius: corner * 0.4 }]} />
      <View style={[styles.corner, { width: corner, height: corner, top: 0, right: 0, borderTopWidth: stroke, borderRightWidth: stroke, borderColor: theme.colors.accent, borderTopRightRadius: corner * 0.4 }]} />
      <View style={[styles.corner, { width: corner, height: corner, bottom: 0, left: 0, borderBottomWidth: stroke, borderLeftWidth: stroke, borderColor: theme.colors.accent, borderBottomLeftRadius: corner * 0.4 }]} />
      <View style={[styles.corner, { width: corner, height: corner, bottom: 0, right: 0, borderBottomWidth: stroke, borderRightWidth: stroke, borderColor: theme.colors.accent, borderBottomRightRadius: corner * 0.4 }]} />
      <View style={styles.center}>
        <Ionicons name="leaf" size={size * 0.42} color={theme.colors.accent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
