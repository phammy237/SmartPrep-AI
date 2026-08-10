import React from 'react';
import { DimensionValue, Pressable } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { BoundingBox } from '@/types';

interface DetectionBoundingBoxProps {
  box: BoundingBox;
  isActive: boolean;
  onPress: () => void;
  label: string;
}

export function DetectionBoundingBox({ box, isActive, onPress, label }: DetectionBoundingBoxProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} detection`}
      style={{
        position: 'absolute',
        left: `${box.x * 100}%` as DimensionValue,
        top: `${box.y * 100}%` as DimensionValue,
        width: `${box.width * 100}%` as DimensionValue,
        height: `${box.height * 100}%` as DimensionValue,
        borderWidth: isActive ? 3 : 2,
        borderColor: isActive ? theme.colors.accent : 'rgba(255,255,255,0.85)',
        borderRadius: theme.radius.sm,
        backgroundColor: isActive ? 'rgba(79,122,92,0.18)' : 'transparent',
      }}
    />
  );
}
