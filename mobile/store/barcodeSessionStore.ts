import { create } from 'zustand';

import { BarcodeProductCandidate } from '@/lib/barcode';

/**
 * Ephemeral (non-persisted) state for the barcode intake currently in progress.
 * The scan screen writes a lookup result here; the review screen reads it. Only
 * the review screen's explicit "Add to pantry" writes inventory.
 */
export interface BarcodePendingLookup {
  /** Normalized barcode (digits only, UPC-E expanded). */
  barcode: string;
  /** The resolved product, or null when the barcode was not found and the user is entering it by hand. */
  candidate: BarcodeProductCandidate | null;
  status: 'found' | 'not_found';
}

interface BarcodeSessionState {
  pending: BarcodePendingLookup | null;
  setPending: (pending: BarcodePendingLookup) => void;
  clear: () => void;
}

export const useBarcodeSessionStore = create<BarcodeSessionState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
