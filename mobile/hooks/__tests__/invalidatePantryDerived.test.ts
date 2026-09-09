import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '../queryKeys';
import { PANTRY_DERIVED_QUERY_KEYS, invalidatePantryDerivedQueries } from '../invalidatePantryDerived';

describe('invalidatePantryDerivedQueries', () => {
  it('invalidates pantry plus every surface derived from it', () => {
    const invalidateQueries = jest.fn();
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    invalidatePantryDerivedQueries(queryClient);

    const invalidatedKeys = invalidateQueries.mock.calls.map(([arg]) => arg.queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        queryKeys.pantry,
        queryKeys.recipes,
        queryKeys.recipeCollections,
        queryKeys.readyToCookCount,
        queryKeys.recommendations,
      ]),
    );
    expect(invalidateQueries).toHaveBeenCalledTimes(PANTRY_DERIVED_QUERY_KEYS.length);
  });

  it('always includes the Use-Soon recommendations key (the surface most often forgotten)', () => {
    expect(PANTRY_DERIVED_QUERY_KEYS).toContain(queryKeys.recommendations);
    expect(PANTRY_DERIVED_QUERY_KEYS).toContain(queryKeys.pantry);
  });
});
