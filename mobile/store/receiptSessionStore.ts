import { create } from 'zustand';

import { ReceiptIntakeCandidate, ReceiptOcrResult } from '@/types';

/**
 * Ephemeral (non-persisted) state for the receipt intake currently in progress.
 * The capture screen sets the image + a stable `clientReceiptId`; processing
 * sets the OCR result; the review screen reads it and is the ONLY place that
 * writes inventory (explicitly).
 */
export interface ReceiptPendingImage {
  base64: string;
  mimeType: string;
  width?: number;
  height?: number;
}

interface ReceiptSessionState {
  /** Stable per intake session - the receipt idempotency anchor. */
  clientReceiptId: string | null;
  image: ReceiptPendingImage | null;
  ocr: ReceiptOcrResult | null;
  candidates: ReceiptIntakeCandidate[];
  begin: () => string;
  setImage: (image: ReceiptPendingImage) => void;
  setResult: (ocr: ReceiptOcrResult, candidates: ReceiptIntakeCandidate[]) => void;
  clear: () => void;
}

function newClientReceiptId(): string {
  return `rcpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useReceiptSessionStore = create<ReceiptSessionState>((set, get) => ({
  clientReceiptId: null,
  image: null,
  ocr: null,
  candidates: [],
  begin: () => {
    const id = newClientReceiptId();
    set({ clientReceiptId: id, image: null, ocr: null, candidates: [] });
    return id;
  },
  setImage: (image) => set({ image, clientReceiptId: get().clientReceiptId ?? newClientReceiptId() }),
  setResult: (ocr, candidates) => set({ ocr, candidates }),
  clear: () => set({ clientReceiptId: null, image: null, ocr: null, candidates: [] }),
}));
