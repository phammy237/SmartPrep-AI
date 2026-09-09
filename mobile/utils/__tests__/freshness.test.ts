import { FreshnessLabel } from '@/types';
import {
  deriveFreshnessLabel,
  freshnessSortWeight,
  FRESHNESS_META,
  isPantryItemNeedingAttention,
} from '../freshness';

describe('deriveFreshnessLabel', () => {
  it('returns "cant_tell" whenever confidence is below 0.6, regardless of score', () => {
    expect(deriveFreshnessLabel(95, 0.5)).toBe('cant_tell');
    expect(deriveFreshnessLabel(10, 0.59)).toBe('cant_tell');
  });

  it('maps confident scores to the documented thresholds', () => {
    expect(deriveFreshnessLabel(70, 0.9)).toBe('fresh');
    expect(deriveFreshnessLabel(69, 0.9)).toBe('use_soon');
    expect(deriveFreshnessLabel(40, 0.9)).toBe('use_soon');
    expect(deriveFreshnessLabel(39, 0.9)).toBe('prioritize');
  });
});

describe('isPantryItemNeedingAttention', () => {
  it('flags "prioritize" and "use_soon" as needing attention', () => {
    expect(isPantryItemNeedingAttention('prioritize')).toBe(true);
    expect(isPantryItemNeedingAttention('use_soon')).toBe(true);
  });

  it('does not flag "fresh" or "cant_tell"', () => {
    expect(isPantryItemNeedingAttention('fresh')).toBe(false);
    expect(isPantryItemNeedingAttention('cant_tell')).toBe(false);
  });

  it('agrees with the urgency sort ordering (attention items sort ahead of the rest)', () => {
    const labels: FreshnessLabel[] = ['fresh', 'use_soon', 'prioritize', 'cant_tell'];
    for (const label of labels) {
      if (isPantryItemNeedingAttention(label)) {
        expect(freshnessSortWeight(label)).toBeLessThan(freshnessSortWeight('cant_tell'));
      }
    }
  });
});

describe('FRESHNESS_META', () => {
  it('pairs every label with non-empty text and an icon so freshness is never color-only', () => {
    (Object.keys(FRESHNESS_META) as FreshnessLabel[]).forEach((label) => {
      const meta = FRESHNESS_META[label];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.shortLabel.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
    });
  });
});
