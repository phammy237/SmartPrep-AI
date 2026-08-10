import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface TagInputProps {
  placeholder: string;
  onAdd: (value: string) => void;
}

export function TagInput({ placeholder, onAdd }: TagInputProps) {
  const theme = useTheme();
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onAdd(trimmed);
      setValue('');
    }
  };

  return (
    <View style={styles.row}>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        onSubmitEditing={submit}
        returnKeyType="done"
        accessibilityLabel={placeholder}
        style={[
          styles.input,
          theme.typography.body,
          { borderColor: theme.colors.border, color: theme.colors.textPrimary, backgroundColor: theme.colors.backgroundElevated },
        ]}
      />
      <Pressable
        onPress={submit}
        accessibilityRole="button"
        accessibilityLabel="Add"
        style={({ pressed }) => [styles.addBtn, { backgroundColor: theme.colors.accent }, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="add" size={22} color={theme.colors.textOnAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
