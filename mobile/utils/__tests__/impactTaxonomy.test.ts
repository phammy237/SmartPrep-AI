import {
  ALL_PANTRY_EVENT_TYPES,
  IMPACT_ADDED_EVENT_TYPES,
  IMPACT_DISCARDED_EVENT_TYPES,
  IMPACT_EXCLUDED_EVENT_TYPES,
  IMPACT_USED_EVENT_TYPES,
  classifyPantryEventForImpact,
} from '../impactTaxonomy';

describe('classifyPantryEventForImpact', () => {
  it('classifies inventory addition as added (not used, not discarded)', () => {
    expect(classifyPantryEventForImpact('added')).toBe('added');
  });

  it('classifies consumed / deducted_by_cooking / depleted as used', () => {
    expect(classifyPantryEventForImpact('consumed')).toBe('used');
    expect(classifyPantryEventForImpact('deducted_by_cooking')).toBe('used');
    expect(classifyPantryEventForImpact('depleted')).toBe('used');
  });

  it('classifies discarded as discarded', () => {
    expect(classifyPantryEventForImpact('discarded')).toBe('discarded');
  });

  it('excludes recount / correction / status-change / reserved events', () => {
    expect(classifyPantryEventForImpact('adjusted')).toBe('excluded');
    expect(classifyPantryEventForImpact('corrected')).toBe('excluded');
    expect(classifyPantryEventForImpact('restored')).toBe('excluded');
    expect(classifyPantryEventForImpact('donated')).toBe('excluded');
    expect(classifyPantryEventForImpact('traded')).toBe('excluded');
  });
});

describe('taxonomy completeness / disjointness (guards the SQL <-> TS sync)', () => {
  const groups = [
    IMPACT_ADDED_EVENT_TYPES,
    IMPACT_USED_EVENT_TYPES,
    IMPACT_DISCARDED_EVENT_TYPES,
    IMPACT_EXCLUDED_EVENT_TYPES,
  ].map((g) => [...g]);

  it('every allowed pantry event type is classified exactly once', () => {
    for (const t of ALL_PANTRY_EVENT_TYPES) {
      const hits = groups.filter((g) => g.includes(t));
      expect({ t, count: hits.length }).toEqual({ t, count: 1 });
    }
  });

  it('the four groups together cover every allowed event type and nothing extra', () => {
    const union = new Set(groups.flat());
    expect([...union].sort()).toEqual([...ALL_PANTRY_EVENT_TYPES].sort());
  });

  it('classifyPantryEventForImpact is total (never throws / undefined)', () => {
    for (const t of ALL_PANTRY_EVENT_TYPES) {
      expect(['added', 'used', 'discarded', 'excluded']).toContain(classifyPantryEventForImpact(t));
    }
  });
});
