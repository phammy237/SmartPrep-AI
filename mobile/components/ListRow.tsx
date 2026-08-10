import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface ListRowProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  isLast?: boolean;
}

export function ListRow({ icon, title, subtitle, right, onPress, showChevron, isLast }: ListRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.colors.border, borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth },
        pressed && onPress ? { backgroundColor: theme.colors.surfaceMuted } : null,
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.titles}>
        <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary, marginTop: 2 }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    minHeight: 52,
  },
  icon: {
    width: 28,
    alignItems: 'center',
  },
  titles: {
    flex: 1,
  },
});
