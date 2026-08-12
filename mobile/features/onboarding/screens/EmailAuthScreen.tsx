import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Screen, TextField } from '@/components';
import { useSignIn, useSignUp } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { toUserSafeAuthMessage } from '@/lib/errors';
import { SignInInput, signInSchema, SignUpInput, signUpSchema } from '@/lib/validation/authSchemas';
import { userService } from '@/services';
import { useSessionStore } from '@/store';
import { OnboardingProgress } from '../components/OnboardingProgress';

type Mode = 'signUp' | 'signIn';

function SignUpForm({ onSuccess }: { onSuccess: () => void }) {
  const theme = useTheme();
  const signUp = useSignUp();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { needsEmailConfirmation } = await signUp.mutateAsync(values);
      if (needsEmailConfirmation) {
        Alert.alert(
          'Check your email',
          "We've sent a confirmation link to your email. Confirm it, then come back and sign in.",
        );
        return;
      }
      onSuccess();
    } catch (error) {
      Alert.alert('Could not create account', toUserSafeAuthMessage(error));
    }
  });

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Controller
        control={control}
        name="displayName"
        render={({ field }) => (
          <TextField
            label="Name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="Jamie Lee"
            autoCapitalize="words"
            textContentType="name"
            error={errors.displayName?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label="Password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="password-new"
            textContentType="newPassword"
            error={errors.password?.message}
          />
        )}
      />
      <Button label="Create account" onPress={onSubmit} loading={signUp.isPending} fullWidth />
    </View>
  );
}

function SignInForm({ onSuccess }: { onSuccess: () => void }) {
  const theme = useTheme();
  const signIn = useSignIn();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signIn.mutateAsync(values);
      onSuccess();
    } catch (error) {
      Alert.alert('Could not sign in', toUserSafeAuthMessage(error));
    }
  });

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label="Password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="Your password"
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            error={errors.password?.message}
          />
        )}
      />
      <Pressable
        onPress={() => router.push('/auth/reset-password')}
        accessibilityRole="button"
        accessibilityLabel="Forgot password"
        hitSlop={8}
      >
        <Text style={[theme.typography.footnote, { color: theme.colors.accent }]}>Forgot password?</Text>
      </Pressable>
      <Button label="Sign in" onPress={onSubmit} loading={signIn.isPending} fullWidth />
    </View>
  );
}

export function EmailAuthScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('signUp');
  const completeOnboarding = useSessionStore((s) => s.completeOnboarding);

  const handleSignedUp = () => {
    // New account: still needs to go through the preference-collecting
    // onboarding screens before anything is saved.
    router.push('/onboarding/dietary');
  };

  const handleSignedIn = async () => {
    // Returning account: skip straight past onboarding if they already have
    // preferences saved, otherwise pick up onboarding where a prior signup
    // left off.
    try {
      const alreadySetUp = await userService.hasCompletedProfileSetup();
      if (alreadySetUp) {
        completeOnboarding();
        router.replace('/(tabs)/home');
      } else {
        router.push('/onboarding/dietary');
      }
    } catch {
      router.push('/onboarding/dietary');
    }
  };

  return (
    <Screen contentContainerStyle={{ flex: 1 }} scroll>
      <OnboardingProgress step={1} total={7} onBack={() => router.back()} />
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>
            {mode === 'signUp' ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            {mode === 'signUp'
              ? 'Your pantry, meal plans, and nutrition goals stay saved to this account.'
              : 'Sign in to pick up where you left off.'}
          </Text>
        </View>

        {mode === 'signUp' ? <SignUpForm onSuccess={handleSignedUp} /> : <SignInForm onSuccess={handleSignedIn} />}

        <Pressable
          onPress={() => setMode(mode === 'signUp' ? 'signIn' : 'signUp')}
          accessibilityRole="button"
          accessibilityLabel={mode === 'signUp' ? 'Switch to sign in' : 'Switch to create account'}
          style={{ alignSelf: 'center', padding: theme.spacing.sm }}
        >
          <Text style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}>
            {mode === 'signUp' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
