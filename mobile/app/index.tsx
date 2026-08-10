import { Redirect } from 'expo-router';

import { useSessionStore } from '@/store';

export default function Index() {
  const hasOnboarded = useSessionStore((s) => s.hasOnboarded);
  return <Redirect href={hasOnboarded ? '/(tabs)/home' : '/onboarding/welcome'} />;
}
