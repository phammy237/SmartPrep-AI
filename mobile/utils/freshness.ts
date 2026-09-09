import { FreshnessLabel } from '@/types';

/**
 * Single source of truth for turning a raw AI score + confidence into the
 * label every screen displays. Thresholds per product spec:
 *   70-100 = Fresh, 40-69 = Use Soon, 0-39 = Prioritize.
 * Below 0.60 confidence, always show "Can't Tell" regardless of the score -
 * we never assert freshness the model isn't sure about.
 */
export function deriveFreshnessLabel(score: number, confidence: number): FreshnessLabel {
  if (confidence < 0.6) return 'cant_tell';
  if (score >= 70) return 'fresh';
  if (score >= 40) return 'use_soon';
  return 'prioritize';
}

interface FreshnessMeta {
  label: string;
  shortLabel: string;
  description: string;
  icon: 'checkmark-circle' | 'time' | 'alert-circle' | 'help-circle';
}

/**
 * Text + icon pairing so freshness is never conveyed by color alone.
 * Tone maps to theme.colors.freshness.<tone> for the actual color value.
 */
export const FRESHNESS_META: Record<FreshnessLabel, FreshnessMeta> = {
  fresh: {
    label: 'Fresh',
    shortLabel: 'Fresh',
    description: "Looks good - no rush to use this.",
    icon: 'checkmark-circle',
  },
  use_soon: {
    label: 'Use soon',
    shortLabel: 'Use soon',
    description: 'Best used in the next few days.',
    icon: 'time',
  },
  prioritize: {
    label: 'Use now',
    shortLabel: 'Use now',
    description: "Use this first - it won't be good much longer.",
    icon: 'alert-circle',
  },
  cant_tell: {
    label: 'No date',
    shortLabel: 'No date',
    description: 'No expiration date for this item yet.',
    icon: 'help-circle',
  },
};

/**
 * The one predicate for "this pantry item needs the user's attention soon" -
 * used by the Home summary line and the Pantry "Use soon" filter so both
 * surfaces mean exactly the same thing.
 */
export function isPantryItemNeedingAttention(label: FreshnessLabel): boolean {
  return label === 'prioritize' || label === 'use_soon';
}

export const FRESHNESS_LABELS: FreshnessLabel[] = ['fresh', 'use_soon', 'prioritize', 'cant_tell'];

/** Representative score/confidence pair to write when a user manually sets a freshness label. */
export const FRESHNESS_OVERRIDE_VALUES: Record<FreshnessLabel, { score: number; confidence: number }> = {
  fresh: { score: 85, confidence: 0.95 },
  use_soon: { score: 55, confidence: 0.9 },
  prioritize: { score: 20, confidence: 0.9 },
  cant_tell: { score: 50, confidence: 0.4 },
};

export function freshnessSortWeight(label: FreshnessLabel): number {
  switch (label) {
    case 'prioritize':
      return 0;
    case 'use_soon':
      return 1;
    case 'cant_tell':
      return 2;
    case 'fresh':
      return 3;
  }
}
