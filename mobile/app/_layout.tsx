import 'react-native-gesture-handler';

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { AuthProvider, useAuth } from '@/lib/supabase/AuthProvider';
import { useSessionStore } from '@/store';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <AppGate />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/** Waits on fonts, the local session-store rehydration, and the initial Supabase session check before mounting the navigator. */
function AppGate() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const { status } = useAuth();
  const ready = fontsLoaded && hasHydrated && status !== 'loading';

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return <RootNavigator />;
}

function RootNavigator() {
  const theme = useTheme();
  const { status } = useAuth();
  const previousStatus = useRef(status);

  // Catches sign-out happening anywhere in the tree, not just the explicit
  // "Sign Out" button - e.g. a refresh token that's been revoked or expired
  // while the user was deep inside the app.
  useEffect(() => {
    if (previousStatus.current === 'signedIn' && status === 'signedOut') {
      router.replace('/onboarding/signin');
    }
    previousStatus.current = status;
  }, [status]);

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
        <Stack.Screen name="recipes" />
        <Stack.Screen name="grocery" />
        <Stack.Screen name="nutrition" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
