/**
 * Deterministic real-photo URLs for ingredients, keyed by name. LoremFlickr
 * serves an actual tagged photograph per keyword and (with a lock) returns
 * the same one every time - no API key, no risk of a guessed/broken URL,
 * unlike hand-picking exact photo IDs from a provider.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ',')
    .replace(/^,+|,+$/g, '');
}

function stableHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 100000;
}

export function ingredientPhotoUri(seedId: string, name: string, size = 300): string {
  return `https://loremflickr.com/${size}/${size}/${slugify(name)}?lock=${stableHash(seedId)}`;
}

/**
 * Deterministic stock-photography placeholder (not keyword-matched) for
 * recipe hero images and scan-history photos, standing in for a real
 * food-photography/asset pipeline in a later milestone.
 */
export function placeholderPhotoUri(seed: string, width: number, height: number): string {
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}
