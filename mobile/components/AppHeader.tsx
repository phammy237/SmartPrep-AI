import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { SmartPrepLogo } from './SmartPrepLogo';

interface AppHeaderProps {
  rightAccessory?: React.ReactNode;
}

/** Small branded strip repeated at the top of each primary tab screen. */
export function AppHeader({ rightAccessory }: AppHeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <SmartPrepLogo size={24} />
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>SmartPrep</Text>
      </View>
      {rightAccessory}
    </View>
  );
}
