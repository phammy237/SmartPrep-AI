import { canTransitionPantryStatus, isValidQuantity, statusForQuantity, wouldGoNegative } from '../pantryTransitions';

describe('canTransitionPantryStatus', () => {
  it('allows active -> depleted', () => {
    expect(canTransitionPantryStatus('active', 'depleted')).toBe(true);
  });

  it('allows depleted -> active (restore)', () => {
    expect(canTransitionPantryStatus('depleted', 'active')).toBe(true);
  });

  it('rejects a no-op transition to the same status', () => {
    expect(canTransitionPantryStatus('active', 'active')).toBe(false);
    expect(canTransitionPantryStatus('depleted', 'depleted')).toBe(false);
  });
});

describe('isValidQuantity', () => {
  it('accepts zero and positive numbers', () => {
    expect(isValidQuantity(0)).toBe(true);
    expect(isValidQuantity(3.5)).toBe(true);
  });

  it('rejects negative numbers', () => {
    expect(isValidQuantity(-1)).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isValidQuantity(NaN)).toBe(false);
    expect(isValidQuantity(Infinity)).toBe(false);
  });
});

describe('wouldGoNegative', () => {
  it('is false when a deduction lands exactly on zero (the boundary)', () => {
    expect(wouldGoNegative(5, -5)).toBe(false);
  });

  it('is true when a deduction would go below zero', () => {
    expect(wouldGoNegative(5, -5.01)).toBe(true);
  });

  it('is false for a positive adjustment', () => {
    expect(wouldGoNegative(5, 10)).toBe(false);
  });
});

describe('statusForQuantity', () => {
  it('is depleted at exactly zero', () => {
    expect(statusForQuantity(0)).toBe('depleted');
  });

  it('is active for any positive quantity', () => {
    expect(statusForQuantity(0.01)).toBe('active');
    expect(statusForQuantity(5)).toBe('active');
  });
});
