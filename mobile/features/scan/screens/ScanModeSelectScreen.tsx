import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { isIngredientInferenceAvailable } from '@/lib/scan/providers';
import { useScanSessionStore } from '@/store';
import { ScanMode } from '@/types';

/** Never mentions OpenAI or any specific provider - see docs/INGREDIENT_MODEL_ROADMAP.md. */
const PHOTO_SCAN_UNAVAILABLE_MESSAGE =
  'Ingredient photo scanning is currently in development. You can still add items manually or scan a barcode.';

interface ModeOption {
  mode: ScanMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const OPTIONS: ModeOption[] = [
  {
    mode: 'quick',
    icon: 'flash-outline',
    title: 'Quick Scan',
    description: 'One photo of whatever you want to add right now.',
  },
  {
    mode: 'guided',
    icon: 'grid-outline',
    title: 'Full Kitchen Scan',
    description: 'A guided scan of your fridge, freezer, and pantry.',
  },
];

export function ScanModeSelectScreen() {
  const theme = useTheme();
  const beginScan = useScanSessionStore((s) => s.beginScan);
  // Checked once per render, not cached - this is a cheap, synchronous,
  // local config check (see lib/scan/providers), not a network call.
  const photoScanAvailable = isIngredientInferenceAvailable();

  const handleSelect = (mode: ScanMode) => {
    if (!photoScanAvailable) {
      // Belt-and-suspenders: the cards below are already visually disabled,
      // but a tap (e.g. before the disabled style registers) must still not
      // start a capture session nobody can complete.
      Alert.alert('Not available yet', PHOTO_SCAN_UNAVAILABLE_MESSAGE);
      return;
    }
    beginScan(mode);
    if (mode === 'quick') {
      router.push({ pathname: '/scan/capture', params: { mode, section: 'quick' } });
    } else {
      router.push('/scan/sections');
    }
  };

  return (
    <Screen contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Add to Pantry</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <Pressable
          onPress={() => router.push('/pantry/add')}
          accessibilityRole="button"
          accessibilityLabel="Add an item manually"
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              backgroundColor: theme.colors.backgroundElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
            },
            theme.shadow.card,
            pressed && { opacity: 0.9 },
          ]}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: theme.colors.accentMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="create-outline" size={24} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Add Manually</Text>
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
              Type in an item, quantity, and dates yourself.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/scan/barcode/scan')}
          accessibilityRole="button"
          accessibilityLabel="Scan a barcode"
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              backgroundColor: theme.colors.backgroundElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
            },
            theme.shadow.card,
            pressed && { opacity: 0.9 },
          ]}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: theme.colors.accentMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="barcode-outline" size={24} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Scan Barcode</Text>
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
              A packaged product's UPC or EAN, looked up and reviewed before it's added.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/scan/receipt/capture')}
          accessibilityRole="button"
          accessibilityLabel="Scan a receipt"
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              backgroundColor: theme.colors.backgroundElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
            },
            theme.shadow.card,
            pressed && { opacity: 0.9 },
          ]}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: theme.colors.accentMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="receipt-outline" size={24} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Scan Receipt</Text>
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
              A grocery receipt - items are extracted and reviewed before any are added.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </Pressable>

        {OPTIONS.map((option) => (
          <Pressable
            key={option.mode}
            onPress={() => handleSelect(option.mode)}
            accessibilityRole="button"
            accessibilityLabel={option.title}
            accessibilityState={{ disabled: !photoScanAvailable }}
            accessibilityHint={photoScanAvailable ? undefined : PHOTO_SCAN_UNAVAILABLE_MESSAGE}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                backgroundColor: theme.colors.backgroundElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.lg,
                opacity: photoScanAvailable ? 1 : 0.5,
              },
              theme.shadow.card,
              pressed && { opacity: 0.9 },
            ]}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: theme.colors.accentMuted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={option.icon} size={24} color={theme.colors.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>{option.title}</Text>
              <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
                {photoScanAvailable ? option.description : PHOTO_SCAN_UNAVAILABLE_MESSAGE}
              </Text>
            </View>
            {photoScanAvailable ? (
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
            ) : null}
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => router.push('/scan/history')}
        accessibilityRole="button"
        accessibilityLabel="View scan history"
        style={({ pressed }) => [
          { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, alignSelf: 'center' },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Ionicons name="time-outline" size={18} color={theme.colors.textSecondary} />
        <Text style={[theme.typography.callout, { color: theme.colors.textSecondary }]}>View scan history</Text>
      </Pressable>
    </Screen>
  );
}
