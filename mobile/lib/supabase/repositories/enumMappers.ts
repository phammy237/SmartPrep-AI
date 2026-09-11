/**
 * Repository-boundary parsing for CHECK-constrained Postgres `text` columns.
 *
 * The generated `Database` types expose these columns (and several RPC return
 * fields) as plain `string`, because a SQL `CHECK (... in (...))` constraint is
 * not represented in the generated TypeScript. The application models the same
 * values as narrow domain unions.
 *
 * These helpers validate a raw database string against the domain's allowed
 * values at the exact point a DB row is mapped to an app model, so a value that
 * somehow falls outside the domain contract fails loudly here (with a
 * descriptive error naming the column) instead of silently flowing into the
 * app typed as a union member it is not.
 *
 * Prefer passing a domain module's `FOO_VALUES` array (declared `as const`,
 * with the union type derived from it) so there is a single source of truth.
 */

/** Narrow a required DB string to `T`, or throw if it is not an allowed value. */
export function assertEnumValue<T extends string>(
  allowed: readonly T[],
  value: string,
  context: string,
): T {
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(
    `${context}: unexpected value ${JSON.stringify(value)} from the database ` +
      `(allowed: ${allowed.join(', ')})`,
  );
}

/**
 * Narrow an optional DB string to `T | undefined`. `null`/`undefined` map to
 * `undefined` (the shape most app models use for "absent"); any other value is
 * validated the same way as {@link assertEnumValue}.
 */
export function parseNullableEnumValue<T extends string>(
  allowed: readonly T[],
  value: string | null | undefined,
  context: string,
): T | undefined {
  if (value === null || value === undefined) return undefined;
  return assertEnumValue(allowed, value, context);
}

/**
 * Like {@link parseNullableEnumValue} but preserves `null` - for app models
 * whose field is explicitly typed `T | null` rather than optional.
 */
export function parseEnumValueOrNull<T extends string>(
  allowed: readonly T[],
  value: string | null | undefined,
  context: string,
): T | null {
  if (value === null || value === undefined) return null;
  return assertEnumValue(allowed, value, context);
}
