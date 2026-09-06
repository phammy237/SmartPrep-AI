import { BoundingBox } from '@/types';

/**
 * The vision model returns names/quantities, not reliable pixel coordinates,
 * so Review draws detections on a synthetic grid over the photo purely as a
 * visual index (tap a card -> highlight its tile). These boxes are never
 * treated as real object locations and never persisted.
 */
export function gridBoxes(count: number): BoundingBox[] {
  if (count <= 0) return [];
  const cols = count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const gap = 0.035;
  const cellW = (1 - gap * (cols + 1)) / cols;
  const cellH = (1 - gap * (rows + 1)) / rows;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return { x: gap + col * (cellW + gap), y: gap + row * (cellH + gap), width: cellW, height: cellH };
  });
}
