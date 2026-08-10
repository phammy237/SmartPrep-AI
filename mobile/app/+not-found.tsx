import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export default function NotFoundScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>
          This screen doesn't exist.
        </Text>
        <Link href="/" style={styles.link}>
          <Text style={[theme.typography.body, { color: theme.colors.accent }]}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
