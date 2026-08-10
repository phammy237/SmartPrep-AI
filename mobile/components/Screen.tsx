import React from 'react';
import { ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { AppHeader } from './AppHeader';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  /** Renders the small branded "SmartPrep" strip fixed above the (optionally scrolling) content. */
  header?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
}

/** Standard screen shell: safe-area aware, themed background, optional header, optional scrolling. */
export function Screen({
  children,
  scroll = false,
  header = false,
  style,
  contentContainerStyle,
  edges = ['top', 'left', 'right'],
}: ScreenProps) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.colors.background }, style]} edges={edges}>
      {header ? <AppHeader /> : null}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[{ paddingBottom: theme.spacing.xxxl }, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentContainerStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
