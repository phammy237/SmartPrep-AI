let counter = 0;

/** Lightweight unique id generator - good enough for a client-only mock backend. */
export function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
