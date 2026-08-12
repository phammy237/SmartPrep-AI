import { Redirect } from 'expo-router';
import React, { useEffect } from 'react';

import { EmptyState, LoadingState } from '@/components';
import { useHasCompletedProfileSetup } from '@/hooks';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useSessionStore } from '@/store';

export default function Index() {
  const hasOnboarded = useSessionStore((s) => s.hasOnboarded);
  const completeOnboarding = useSessionStore((s) => s.completeOnboarding);
  const { status } = useAuth();

  if (status === 'signedOut') {
    return <Redirect href="/onboarding/welcome" />;
  }

  if (hasOnboarded) {
    return <Redirect href="/(tabs)/home" />;
  }

  // Signed in, but this device's local "onboarded" flag isn't set - e.g. a
  // fresh install where the user signed back into an existing account.
  // Check whether they already have saved preferences before deciding
  // whether to send them through onboarding again.
  return <ResumeSession onProfileFound={completeOnboarding} />;
}

function ResumeSession({ onProfileFound }: { onProfileFound: () => void }) {
  const setupQuery = useHasCompletedProfileSetup();

  useEffect(() => {
    if (setupQuery.data) {
      onProfileFound();
    }
  }, [setupQuery.data, onProfileFound]);

  if (setupQuery.isLoading) {
    return <LoadingState fullscreen message="Loading your account..." />;
  }

  if (setupQuery.isError) {
    return (
      <EmptyState
        title="Couldn't load your account"
        message="Check your connection and try again."
        actionLabel="Retry"
        onActionPress={() => setupQuery.refetch()}
      />
    );
  }

  return <Redirect href={setupQuery.data ? '/(tabs)/home' : '/onboarding/dietary'} />;
}
