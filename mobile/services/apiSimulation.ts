/** Simulated network latency so loading states have something real to show. */
export function delay(ms = 450): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deep-clones plain JSON-safe data (our mock records are all ISO strings, no Date/Map/Set). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
