import React from 'react';
import { ScrollView } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { Chip } from './Chip';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterBarProps<T extends string> {
  options: FilterOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
}

export function FilterBar<T extends string>({ options, selected, onSelect }: FilterBarProps<T>) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.lg }}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={selected === option.value}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </ScrollView>
  );
}
