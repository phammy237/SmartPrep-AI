import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { router, Tabs } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

function ScanTabButton(props: BottomTabBarButtonProps) {
  const theme = useTheme();

  return (
    <View style={styles.scanButtonWrap} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push('/scan')}
        accessibilityRole="button"
        accessibilityLabel="Scan"
        style={({ pressed }) => [
          styles.scanButton,
          theme.shadow.raised,
          { backgroundColor: theme.colors.accent, borderColor: theme.colors.background },
          pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
        ]}
      >
        <Ionicons name="camera" size={26} color={theme.colors.textOnAccent} />
      </Pressable>
    </View>
  );
}

function tabIcon(name: keyof typeof Ionicons.glyphMap, focusedName: keyof typeof Ionicons.glyphMap) {
  function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return <Ionicons name={focused ? focusedName : name} size={24} color={color} />;
  }
  return TabIcon;
}

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarLabelStyle: { fontFamily: theme.typography.caption.fontFamily, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: theme.colors.backgroundElevated,
          borderTopColor: theme.colors.border,
          height: Platform.select({ ios: 84, default: 64 }),
          paddingTop: 8,
          paddingBottom: Platform.select({ ios: 28, default: 10 }),
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline', 'home') }} />
      <Tabs.Screen name="pantry" options={{ title: 'Pantry', tabBarIcon: tabIcon('file-tray-stacked-outline', 'file-tray-stacked') }} />
      <Tabs.Screen
        name="scan"
        options={{
          title: '',
          tabBarButton: (props) => <ScanTabButton {...props} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/scan');
          },
        }}
      />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: tabIcon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline', 'person') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scanButtonWrap: {
    top: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
