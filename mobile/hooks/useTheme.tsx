import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { palettes, radius, shadow, spacing, typography, ThemeColors } from '@/constants/theme';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadow: typeof shadow;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const scheme = systemScheme === 'dark' ? 'dark' : 'light';

  const theme = useMemo<Theme>(
    () => ({
      scheme,
      colors: palettes[scheme],
      spacing,
      radius,
      typography,
      shadow,
    }),
    [scheme],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return theme;
}
