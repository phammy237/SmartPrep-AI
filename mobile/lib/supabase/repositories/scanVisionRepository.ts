import {
  VisionDetection,
  visionErrorStatusSchema,
  visionModelRefusalSchema,
  visionSuccessSchema,
} from '@/lib/validation/scanSchemas';
import { ScanCaptureImage, ScanMode, ScanSection } from '@/types';
import { supabase } from '../client';

/**
 * The one path from the app to the vision Edge Function. `scanService` calls
 * here; nothing else invokes `supabase.functions` for scanning, and no
 * screen touches it. The OpenAI key lives only as an Edge Function secret.
 */

export type ScanInferenceErrorCode =
  | 'unauthenticated'
  | 'invalid_request'
  | 'image_too_large'
  | 'config_error'
  | 'rate_limited'
  | 'upstream_timeout'
  | 'upstream_error'
  | 'malformed_upstream'
  | 'model_refusal'
  | 'network'
  | 'unknown';

/** A single typed failure surface for every way vision inference can go wrong. Never falls back to canned detections. */
export class ScanInferenceError extends Error {
  constructor(
    readonly code: ScanInferenceErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ScanInferenceError';
  }
}

export interface DetectScanIngredientsArgs {
  image: ScanCaptureImage;
  scanMode: ScanMode;
  section?: ScanSection;
  knownContext?: string;
}

export interface ScanVisionResult {
  detections: VisionDetection[];
  warnings: string[];
}

export async function detectScanIngredients(args: DetectScanIngredientsArgs): Promise<ScanVisionResult> {
  let data: unknown;
  let invokeError: unknown;
  try {
    const res = await supabase.functions.invoke('scan-ingredients', {
      body: {
        image: { base64: args.image.base64, mimeType: args.image.mimeType },
        scanMode: args.scanMode,
        section: args.section && args.section !== 'quick' ? args.section : undefined,
        knownContext: args.knownContext,
      },
    });
    data = res.data;
    invokeError = res.error;
  } catch (e) {
    throw new ScanInferenceError('network', e instanceof Error ? e.message : undefined);
  }

  // supabase-js surfaces a FunctionsHttpError for non-2xx; the JSON body is still
  // available on `data` in recent versions, but be defensive and map the error too.
  const asError = safeParse(visionErrorStatusSchema, data);
  if (asError) {
    throw new ScanInferenceError(mapErrorCode(asError.status), asError.reason);
  }
  const refusal = safeParse(visionModelRefusalSchema, data);
  if (refusal) {
    throw new ScanInferenceError('model_refusal', refusal.message);
  }
  if (invokeError) {
    throw new ScanInferenceError('upstream_error', invokeError instanceof Error ? invokeError.message : String(invokeError));
  }

  const ok = safeParse(visionSuccessSchema, data);
  if (!ok) {
    throw new ScanInferenceError('malformed_upstream', 'unexpected response shape');
  }
  return { detections: ok.detections, warnings: ok.warnings };
}

function mapErrorCode(status: string): ScanInferenceErrorCode {
  switch (status) {
    case 'unauthenticated':
    case 'invalid_request':
    case 'image_too_large':
    case 'config_error':
    case 'rate_limited':
    case 'upstream_timeout':
    case 'upstream_error':
    case 'malformed_upstream':
      return status;
    default:
      return 'unknown';
  }
}

function safeParse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T | null {
  const r = schema.safeParse(value);
  return r.success ? (r.data as T) : null;
}
