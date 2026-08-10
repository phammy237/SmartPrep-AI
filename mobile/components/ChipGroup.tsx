import React from 'react';
import { View } from 'react-native';

import { Chip } from './Chip';

export interface ChipOption {
  value: string;
  label: string;
  icon?: string;
}

interface ChipGroupProps {
  options: ChipOption[];
  selected: string[];
  onToggle: (value: string) => void;
}

export function ChipGroup({ options, selected, onToggle }: ChipGroupProps) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          icon={option.icon}
          selected={selected.includes(option.value)}
          onPress={() => onToggle(option.value)}
        />
      ))}
    </View>
  );
}
