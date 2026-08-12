import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Text, View } from 'react-native';

import { Button, Screen, TextField } from '@/components';
import { useRequestPasswordReset, useUpdatePassword } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { toUserSafeAuthMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import {
  NewPasswordInput,
  newPasswordSchema,
  RequestPasswordResetInput,
  requestPasswordResetSchema,
} from '@/lib/validation/authSchemas';

/**
 * Two modes, chosen automatically:
 *  - "request": default. User enters their email, we send a reset link.
 *  - "confirm": the app was opened via that email's deep link
 *    (smartprep://auth/reset-password), which Supabase turns into a
 *    short-lived recovery session and a PASSWORD_RECOVERY auth event -
 *    here the user sets their new password.
 *
 * Requires `smartprep://auth/reset-password` to be added to the Supabase
 * project's Auth > URL Configuration > Redirect URLs allow-list, otherwise
 * Supabase will refuse to redirect back into the app.
 */
export function ResetPasswordScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<'request' | 'confirm'>('request');

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('confirm');
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <Screen contentContainerStyle={{ flex: 1 }} scroll>
      <View style={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'center', gap: theme.spacing.xl }}>
        {mode === 'request' ? <RequestResetForm /> : <ConfirmNewPasswordForm />}
      </View>
    </Screen>
  );
}

function RequestResetForm() {
  const theme = useTheme();
  const requestReset = useRequestPasswordReset();
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await requestReset.mutateAsync(values);
      setSent(true);
    } catch (error) {
      Alert.alert('Could not send reset email', toUserSafeAuthMessage(error));
    }
  });

  if (sent) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Check your email</Text>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          If an account exists for that address, a password reset link is on its way.
        </Text>
        <Button label="Back to sign in" variant="secondary" onPress={() => router.back()} fullWidth />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Reset your password</Text>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          Enter your account email and we'll send you a reset link.
        </Text>
      </View>
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
      <Button label="Send reset link" onPress={onSubmit} loading={requestReset.isPending} fullWidth />
    </View>
  );
}

function ConfirmNewPasswordForm() {
  const theme = useTheme();
  const updatePassword = useUpdatePassword();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updatePassword.mutateAsync(values);
      Alert.alert('Password updated', 'Your password has been changed.');
      router.replace('/(tabs)/home');
    } catch (error) {
      Alert.alert('Could not update password', toUserSafeAuthMessage(error));
    }
  });

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Set a new password</Text>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          Choose a new password for your account.
        </Text>
      </View>
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label="New password"
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
      <Button label="Update password" onPress={onSubmit} loading={updatePassword.isPending} fullWidth />
    </View>
  );
}
