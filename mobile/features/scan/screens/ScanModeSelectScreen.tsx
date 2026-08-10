import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { useScanSessionStore } from '@/store';
import { ScanMode } from '@/types';

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

  const handleSelect = (mode: ScanMode) => {
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
        <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Scan Your Kitchen</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.mode}
            onPress={() => handleSelect(option.mode)}
            accessibilityRole="button"
            accessibilityLabel={option.title}
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
              <Ionicons name={option.icon} size={24} color={theme.colors.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>{option.title}</Text>
              <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
                {option.description}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
