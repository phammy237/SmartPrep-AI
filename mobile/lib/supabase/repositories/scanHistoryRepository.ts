import {
  PersistedScanStatus,
  QuantityUnit,
  ScanMode,
  ScanRecord,
  ScanRecordDetail,
  ScanRecordDetection,
} from '@/types';
import { Database } from '@/types/database.types';
import { supabase } from '../client';

type ScanRow = Database['public']['Tables']['scans']['Row'];
type ScanSectionRow = Database['public']['Tables']['scan_sections']['Row'];
type ScanDetectionRow = Database['public']['Tables']['scan_detections']['Row'];

interface ScanJoinRow extends ScanRow {
  scan_sections: ScanSectionRow[];
  scan_detections: ScanDetectionRow[];
}

const SCAN_SELECT = '*, scan_sections(*), scan_detections(*)';
const PREVIEW_LIMIT = 4;

function mapDetectionRow(row: ScanDetectionRow): ScanRecordDetection {
  return {
    detectionId: row.detection_id,
    section: row.section,
    name: row.display_name,
    canonicalIngredientId: row.canonical_ingredient_id,
    quantity: row.quantity,
    unit: row.unit as QuantityUnit,
    category: row.category,
    identityEdited: row.identity_edited,
    quantityEdited: row.quantity_edited,
    pantryItemId: row.pantry_item_id,
  };
}

function mapScanRow(row: ScanJoinRow): ScanRecord {
  const detections = [...row.scan_detections];
  const confirmed = detections.filter((d) => d.pantry_item_id !== null);
  return {
    id: row.id,
    clientScanId: row.client_scan_id,
    mode: row.mode,
    status: row.status,
    startedAt: row.started_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    sections: [...row.scan_sections]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ section: s.section, skipped: s.skipped })),
    confirmedItemCount: confirmed.length,
    detectionCount: detections.length,
    ingredientPreview: confirmed.slice(0, PREVIEW_LIMIT).map((d) => d.display_name),
  };
}

/**
 * Confirmed scans for the History list, newest first. Ownership is enforced by
 * RLS (`scans_select_own`); child rows come back through the parent policy.
 */
export async function fetchConfirmedScans(): Promise<ScanRecord[]> {
  const { data, error } = await supabase
    .from('scans')
    .select(SCAN_SELECT)
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as ScanJoinRow[]).map(mapScanRow);
}

/** One scan with its full confirmed-detection list. Null when not found / not owned. */
export async function fetchScanDetail(scanId: string): Promise<ScanRecordDetail | null> {
  const { data, error } = await supabase.from('scans').select(SCAN_SELECT).eq('id', scanId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as ScanJoinRow;
  return {
    ...mapScanRow(row),
    detections: [...row.scan_detections]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(mapDetectionRow),
  };
}

// --- Idempotent confirmation RPCs (see migration 0008) -----------------------

export interface BeginScanConfirmationDetection {
  detectionId: string;
  section: string | null;
  displayName: string;
  canonicalIngredientId: string | null;
  quantity: number;
  unit: QuantityUnit;
  category: string | null;
  identityEdited: boolean;
  quantityEdited: boolean;
}

export interface BeginScanConfirmationResult {
  scanId: string;
  status: PersistedScanStatus;
  detections: { detectionId: string; pantryItemId: string | null }[];
}

/**
 * Creates or resumes the durable `scans` row (keyed by clientScanId) plus one
 * intent row per confirmed detection. Idempotent - call it on every Confirm,
 * including retries; it never creates a second scan and never disturbs a
 * detection that already produced a pantry item. Snake_case payload keys are
 * required by the RPC's jsonb_to_recordset.
 */
export async function beginScanConfirmation(params: {
  clientScanId: string;
  mode: ScanMode;
  startedAt?: string;
  sections: { section: string; skipped: boolean; sortOrder: number }[];
  detections: BeginScanConfirmationDetection[];
}): Promise<BeginScanConfirmationResult> {
  const { data, error } = await supabase.rpc('begin_scan_confirmation', {
    p_client_scan_id: params.clientScanId,
    p_mode: params.mode,
    p_started_at: params.startedAt ?? null,
    p_sections: params.sections.map((s) => ({
      section: s.section,
      skipped: s.skipped,
      sort_order: s.sortOrder,
    })),
    p_detections: params.detections.map((d) => ({
      detection_id: d.detectionId,
      section: d.section,
      display_name: d.displayName,
      canonical_ingredient_id: d.canonicalIngredientId,
      quantity: d.quantity,
      unit: d.unit,
      category: d.category,
      identity_edited: d.identityEdited,
      quantity_edited: d.quantityEdited,
    })),
  });
  if (error) throw error;
  return data as unknown as BeginScanConfirmationResult;
}

/** Records the pantry item created for one confirmed detection. Idempotent for the same pair. */
export async function linkScanDetection(
  scanId: string,
  detectionId: string,
  pantryItemId: string,
): Promise<void> {
  const { error } = await supabase.rpc('link_scan_detection', {
    p_scan_id: scanId,
    p_detection_id: detectionId,
    p_pantry_item_id: pantryItemId,
  });
  if (error) throw error;
}

/**
 * Flips the scan to `confirmed` once every detection has a pantry item. A
 * no-op while any are still pending, so it is safe to retry after a dropped
 * response.
 */
export async function finalizeScanConfirmation(
  scanId: string,
): Promise<{ id: string; status: PersistedScanStatus; confirmedAt: string | null }> {
  const { data, error } = await supabase.rpc('finalize_scan_confirmation', { p_scan_id: scanId });
  if (error) throw error;
  const row = data as unknown as ScanRow;
  return { id: row.id, status: row.status, confirmedAt: row.confirmed_at };
}
