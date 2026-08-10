import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface GreetingHeaderProps {
  name: string;
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function GreetingHeader({ name }: GreetingHeaderProps) {
  const theme = useTheme();
  const firstName = name.split(' ')[0];

  return (
    <View style={{ gap: 2 }}>
      <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
        {greetingForHour(new Date().getHours())}
      </Text>
      <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>{firstName}</Text>
    </View>
  );
}
