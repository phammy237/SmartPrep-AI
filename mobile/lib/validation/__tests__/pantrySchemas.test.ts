import {
  adjustQuantitySchema,
  createPantryItemSchema,
  depleteItemSchema,
  editPantryItemMetadataSchema,
} from '../pantrySchemas';

describe('createPantryItemSchema', () => {
  const base = { displayName: 'Milk', category: 'dairy' as const, quantity: 1, unit: 'item' as const };

  it('accepts a minimal valid item', () => {
    expect(createPantryItemSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(createPantryItemSchema.safeParse({ ...base, displayName: '  ' }).success).toBe(false);
  });

  it('rejects a negative quantity', () => {
    expect(createPantryItemSchema.safeParse({ ...base, quantity: -1 }).success).toBe(false);
  });

  it('accepts a zero quantity', () => {
    expect(createPantryItemSchema.safeParse({ ...base, quantity: 0 }).success).toBe(true);
  });

  it('rejects an unsupported unit', () => {
    expect(createPantryItemSchema.safeParse({ ...base, unit: 'gallon' }).success).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(createPantryItemSchema.safeParse({ ...base, purchaseDate: '08/01/2026' }).success).toBe(false);
  });

  it('requires a date type when a user-provided date is given', () => {
    const result = createPantryItemSchema.safeParse({ ...base, userProvidedDate: '2026-08-20' });
    expect(result.success).toBe(false);
  });

  it('accepts a user-provided date paired with its type', () => {
    const result = createPantryItemSchema.safeParse({
      ...base,
      userProvidedDate: '2026-08-20',
      userProvidedDateType: 'best_by',
    });
    expect(result.success).toBe(true);
  });
});

describe('editPantryItemMetadataSchema', () => {
  it('accepts an empty patch (no-op edit)', () => {
    expect(editPantryItemMetadataSchema.safeParse({}).success).toBe(true);
  });

  it('has no quantity or status field at all - metadata edits cannot touch either', () => {
    const shape = editPantryItemMetadataSchema.safeParse({ quantity: 5, status: 'depleted' });
    // Unknown keys are stripped by default zod object parsing, not rejected -
    // confirm they simply don't appear in the parsed result.
    expect(shape.success && !('quantity' in shape.data) && !('status' in shape.data)).toBe(true);
  });

  it('rejects an overly long note', () => {
    expect(editPantryItemMetadataSchema.safeParse({ notes: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('adjustQuantitySchema', () => {
  it('accepts a positive or negative delta', () => {
    expect(adjustQuantitySchema.safeParse({ itemId: 'a', delta: 1, eventType: 'adjusted' }).success).toBe(true);
    expect(adjustQuantitySchema.safeParse({ itemId: 'a', delta: -1, eventType: 'consumed' }).success).toBe(true);
  });

  it('rejects a zero delta (not a meaningful adjustment)', () => {
    expect(adjustQuantitySchema.safeParse({ itemId: 'a', delta: 0, eventType: 'adjusted' }).success).toBe(false);
  });

  it('rejects an event type that belongs to a different mutation (e.g. depleted)', () => {
    expect(adjustQuantitySchema.safeParse({ itemId: 'a', delta: 1, eventType: 'depleted' }).success).toBe(false);
  });
});

describe('depleteItemSchema', () => {
  it('accepts depleted, discarded, and corrected event types', () => {
    for (const eventType of ['depleted', 'discarded', 'corrected']) {
      expect(depleteItemSchema.safeParse({ itemId: 'a', eventType }).success).toBe(true);
    }
  });

  it('rejects an adjust-only event type', () => {
    expect(depleteItemSchema.safeParse({ itemId: 'a', eventType: 'adjusted' }).success).toBe(false);
  });
});
