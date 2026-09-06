import { create } from 'zustand';

import { Scan, ScanCaptureImage, ScanDetection, ScanMode, ScanSection, ScanSectionResult } from '@/types';

/** A photo just captured, waiting for the Processing screen to run vision inference. Never persisted. */
export interface PendingCapture {
  image: ScanCaptureImage;
  previewUri: string;
  mode: ScanMode;
  section: ScanSection;
}

/**
 * Ephemeral (non-persisted) state for the scan currently being captured and
 * reviewed. This is the single source of truth screens read/write while a
 * scan is in progress; scanService.confirmScan() is only called once, at
 * the end, to commit it to the pantry.
 */
interface ScanSessionState {
  scan: Scan | null;
  activeDetectionId: string | null;
  /** Set by Capture, consumed + cleared by Processing. Holds the base64 image only in memory. */
  pendingCapture: PendingCapture | null;

  beginScan: (mode: ScanMode) => void;
  setSectionResult: (result: ScanSectionResult) => void;
  markSectionSkipped: (section: ScanSection) => void;
  updateDetection: (detectionId: string, patch: Partial<ScanDetection>) => void;
  removeDetection: (detectionId: string) => void;
  restoreDetection: (detectionId: string) => void;
  addManualDetection: (section: ScanSection, detection: ScanDetection) => void;
  setActiveDetectionId: (id: string | null) => void;
  setPendingCapture: (capture: PendingCapture) => void;
  clearPendingCapture: () => void;
  reset: () => void;
}

function upsertSection(scan: Scan, result: ScanSectionResult): Scan {
  const existingIndex = scan.sections.findIndex((s) => s.section === result.section);
  const sections =
    existingIndex >= 0
      ? scan.sections.map((s, i) => (i === existingIndex ? result : s))
      : [...scan.sections, result];
  return { ...scan, sections };
}

export const useScanSessionStore = create<ScanSessionState>()((set) => ({
  scan: null,
  activeDetectionId: null,
  pendingCapture: null,

  beginScan: (mode) =>
    set({
      scan: { id: `scan-draft-${Date.now()}`, mode, status: 'capturing', createdAt: new Date().toISOString(), sections: [] },
      activeDetectionId: null,
      pendingCapture: null,
    }),

  setSectionResult: (result) =>
    set((state) => (state.scan ? { scan: upsertSection(state.scan, result) } : state)),

  markSectionSkipped: (section) =>
    set((state) =>
      state.scan
        ? { scan: upsertSection(state.scan, { section, imageUri: '', detections: [], skipped: true }) }
        : state,
    ),

  updateDetection: (detectionId, patch) =>
    set((state) => {
      if (!state.scan) return state;
      const sections = state.scan.sections.map((section) => ({
        ...section,
        detections: section.detections.map((d) => (d.id === detectionId ? { ...d, ...patch } : d)),
      }));
      return { scan: { ...state.scan, sections } };
    }),

  removeDetection: (detectionId) =>
    set((state) => {
      if (!state.scan) return state;
      const sections = state.scan.sections.map((section) => ({
        ...section,
        detections: section.detections.map((d) => (d.id === detectionId ? { ...d, isRemoved: true } : d)),
      }));
      return { scan: { ...state.scan, sections } };
    }),

  restoreDetection: (detectionId) =>
    set((state) => {
      if (!state.scan) return state;
      const sections = state.scan.sections.map((section) => ({
        ...section,
        detections: section.detections.map((d) => (d.id === detectionId ? { ...d, isRemoved: false } : d)),
      }));
      return { scan: { ...state.scan, sections } };
    }),

  addManualDetection: (section, detection) =>
    set((state) => {
      if (!state.scan) return state;
      const existingIndex = state.scan.sections.findIndex((s) => s.section === section);
      if (existingIndex === -1) {
        return { scan: upsertSection(state.scan, { section, imageUri: '', detections: [detection], skipped: false }) };
      }
      const sections = state.scan.sections.map((s, i) =>
        i === existingIndex ? { ...s, detections: [...s.detections, detection] } : s,
      );
      return { scan: { ...state.scan, sections } };
    }),

  setActiveDetectionId: (id) => set({ activeDetectionId: id }),

  setPendingCapture: (capture) => set({ pendingCapture: capture }),
  clearPendingCapture: () => set({ pendingCapture: null }),

  reset: () => set({ scan: null, activeDetectionId: null, pendingCapture: null }),
}));
