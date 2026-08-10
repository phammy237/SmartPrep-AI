import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface ProfileHeaderProps {
  name: string;
  email: string;
  initials: string;
}

export function ProfileHeader({ name, email, initials }: ProfileHeaderProps) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: theme.colors.accentMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[theme.typography.title2, { color: theme.colors.accent }]}>{initials}</Text>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>{name}</Text>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{email}</Text>
      </View>
    </View>
  );
}
