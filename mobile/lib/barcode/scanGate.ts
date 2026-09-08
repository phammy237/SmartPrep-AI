/**
 * Camera duplicate-suppression for the barcode scanner. `expo-camera` fires
 * `onBarcodeScanned` many times per second while a code is in frame; this gate
 * makes sure one physical scan triggers exactly one lookup.
 *
 * It is a plain object (not React state) so correctness never depends on a
 * re-render landing in time. The component holds one in a `useRef`.
 */

export interface ScanGate {
  /**
   * True only if `barcode` may be processed right now: nothing is in flight
   * AND this is not the barcode that was just handled. Locks on true.
   */
  claim(barcode: string): boolean;
  /** Clear the in-flight lock after a lookup settles. The last barcode stays remembered, so an immediate camera re-fire is still ignored. */
  release(): void;
  /** Full reset - for an explicit "Scan again", which SHOULD allow re-scanning the same barcode. */
  reset(): void;
}

export function createScanGate(): ScanGate {
  let locked = false;
  let lastClaimed: string | null = null;

  return {
    claim(barcode: string): boolean {
      if (locked) return false;
      if (barcode === lastClaimed) return false;
      locked = true;
      lastClaimed = barcode;
      return true;
    },
    release(): void {
      locked = false;
    },
    reset(): void {
      locked = false;
      lastClaimed = null;
    },
  };
}
