/**
 * Design tokens for SmartPrep AI: warm neutral backgrounds, dark charcoal
 * typography, restrained natural accents. No neon gradients, no glassmorphism.
 * Every screen should style itself from these tokens via useTheme() rather
 * than hardcoding colors, so theming/dark-mode stays centralized.
 */

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography = {
  largeTitle: { fontFamily: fontFamily.bold, fontSize: 32, lineHeight: 38 },
  title1: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 32 },
  title2: { fontFamily: fontFamily.semibold, fontSize: 21, lineHeight: 27 },
  title3: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 24 },
  headline: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 22 },
  callout: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 20 },
  subhead: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 19 },
  footnote: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16 },
} as const;

export interface ThemeColors {
  background: string;
  backgroundElevated: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnAccent: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentMuted: string;
  accentStrong: string;
  secondary: string;
  secondaryMuted: string;
  overlay: string;
  freshness: {
    fresh: string;
    freshMuted: string;
    useSoon: string;
    useSoonMuted: string;
    prioritize: string;
    prioritizeMuted: string;
    cantTell: string;
    cantTellMuted: string;
  };
}

const lightColors: ThemeColors = {
  background: '#FAF6F0',
  backgroundElevated: '#FFFFFF',
  surfaceMuted: '#F1EBE2',
  textPrimary: '#2B2521',
  textSecondary: '#6B6156',
  textTertiary: '#9C9187',
  textOnAccent: '#FFFFFF',
  border: '#E8E1D6',
  borderStrong: '#D6CCBD',
  accent: '#2F5233',
  accentMuted: '#E6EFE2',
  accentStrong: '#213D26',
  secondary: '#6B5B95',
  secondaryMuted: '#ECE8F5',
  overlay: 'rgba(43, 37, 33, 0.5)',
  freshness: {
    fresh: '#2F5233',
    freshMuted: '#E6EFE2',
    useSoon: '#B8863B',
    useSoonMuted: '#F5EBD9',
    prioritize: '#B5562F',
    prioritizeMuted: '#F5E4DB',
    cantTell: '#7C7166',
    cantTellMuted: '#EFEBE4',
  },
};

const darkColors: ThemeColors = {
  background: '#1C1917',
  backgroundElevated: '#26221F',
  surfaceMuted: '#2F2A26',
  textPrimary: '#F5F1EA',
  textSecondary: '#B8AFA4',
  textTertiary: '#8A8074',
  textOnAccent: '#12211A',
  border: '#3A342F',
  borderStrong: '#4A4339',
  accent: '#8FC49B',
  accentMuted: '#23342A',
  accentStrong: '#B7DEBE',
  secondary: '#B6A7DA',
  secondaryMuted: '#2E2A3D',
  overlay: 'rgba(0, 0, 0, 0.6)',
  freshness: {
    fresh: '#8FC49B',
    freshMuted: '#23342A',
    useSoon: '#D9A65C',
    useSoonMuted: '#3A2F1E',
    prioritize: '#E08A63',
    prioritizeMuted: '#3A2620',
    cantTell: '#A79E92',
    cantTellMuted: '#302B26',
  },
};

export const palettes = { light: lightColors, dark: darkColors };

export const shadow = {
  card: {
    shadowColor: '#2B2521',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#2B2521',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
  },
} as const;
