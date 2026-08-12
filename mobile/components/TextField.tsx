import React from 'react';
import { Text, TextInput, TextInputProps, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface TextFieldProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  keyboardType?: TextInputProps['keyboardType'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  accessibilityLabel?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  error,
  secureTextEntry,
  autoCapitalize = 'none',
  keyboardType,
  autoComplete,
  textContentType,
  accessibilityLabel,
}: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {label ? <Text style={[theme.typography.subhead, { color: theme.colors.textPrimary }]}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        textContentType={textContentType}
        accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
        accessibilityState={{ disabled: false }}
        style={[
          {
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            minHeight: 48,
            borderColor: error ? theme.colors.freshness.prioritize : theme.colors.border,
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.backgroundElevated,
          },
          theme.typography.body,
        ]}
      />
      {error ? (
        <Text style={[theme.typography.footnote, { color: theme.colors.freshness.prioritize }]}>{error}</Text>
      ) : null}
    </View>
  );
}
