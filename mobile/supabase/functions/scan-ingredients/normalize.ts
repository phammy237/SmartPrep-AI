/**
 * Pure parse + normalize for the vision model's JSON output. NO Deno /
 * network / env / secret access here, so it is unit-testable with the app's
 * normal jest setup (see __tests__/normalize.test.ts). index.ts does auth,
 * the OpenAI call, and error mapping, and delegates all shape work here.
 *
 * The model is instructed to return strict JSON. This module still treats the
 * output as untrusted: it clamps, caps, drops junk, and never lets model
 * prose or fabricated database ids flow onward.
 */

export const MAX_DETECTIONS = 40;
const MAX_NOTE_CHARS = 200;
const MAX_NAME_CHARS = 120;
const MAX_WARNINGS = 10;

const CATEGORIES = ['produce', 'protein', 'dairy', 'pantry', 'frozen', 'other'] as const;
export type ScanCategory = (typeof CATEGORIES)[number];

export interface NormalizedVisionDetection {
  name: string;
  /** null = the model could not see a quantity. Never fabricated. */
  quantity: number | null;
  /** Raw model unit string (e.g. "ounces", "cup"); the CLIENT normalizes it against the unit taxonomy. */
  unit: string | null;
  category: ScanCategory | null;
  /** 0..1 identity confidence. */
  confidence: number;
  /** 0..1 quantity confidence, or null when there is no quantity. */
  quantityConfidence: number | null;
  /** The model's own "this needs a human" hint (advisory; the client applies its own deterministic gating too). */
  needsReview: boolean;
  notes: string | null;
}

export type NormalizedVisionResult =
  | { status: 'ok'; detections: NormalizedVisionDetection[]; warnings: string[] }
  | { status: 'model_refusal'; message: string }
  | { status: 'malformed'; reason: string };

function clamp01(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

function positiveNumberOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

function trimTo(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

function coerceCategory(v: unknown): ScanCategory | null {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v.toLowerCase())
    ? (v.toLowerCase() as ScanCategory)
    : null;
}

/**
 * @param raw - the model's message content: a JSON string, or an already-parsed object.
 */
export function normalizeVisionResponse(raw: unknown): NormalizedVisionResult {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (text.length === 0) return { status: 'malformed', reason: 'empty model content' };
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON content from a structured request almost always means a refusal.
      return { status: 'model_refusal', message: text.slice(0, MAX_NOTE_CHARS) };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { status: 'malformed', reason: 'response is not an object' };
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.refusal === 'string' && obj.refusal.trim().length > 0) {
    return { status: 'model_refusal', message: obj.refusal.slice(0, MAX_NOTE_CHARS) };
  }

  if (!Array.isArray(obj.detections)) {
    return { status: 'malformed', reason: 'detections is not an array' };
  }

  const warnings: string[] = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === 'string' && w.trim().length > 0).slice(0, MAX_WARNINGS)
    : [];

  const detections: NormalizedVisionDetection[] = [];
  for (const entry of obj.detections) {
    if (detections.length >= MAX_DETECTIONS) {
      warnings.push(`Only the first ${MAX_DETECTIONS} detections were kept.`);
      break;
    }
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const name = trimTo(e.name, MAX_NAME_CHARS);
    if (!name) continue; // no usable ingredient name -> drop (covers non-food noise)

    const quantity = positiveNumberOrNull(e.quantity);
    const confidence = clamp01(e.confidence) ?? 0;
    const quantityConfidence = quantity === null ? null : clamp01(e.quantityConfidence);

    detections.push({
      name,
      quantity,
      // A unit hint is kept even when quantity is null - the client Review UI uses it.
      unit: trimTo(e.unit, 24),
      category: coerceCategory(e.category),
      confidence,
      quantityConfidence,
      needsReview: e.needsReview === true,
      notes: trimTo(e.notes, MAX_NOTE_CHARS),
    });
  }

  return { status: 'ok', detections, warnings: warnings.slice(0, MAX_WARNINGS) };
}

/** JSON schema handed to OpenAI (`response_format: json_schema`, strict). No id / nutrition / date fields. */
export const VISION_JSON_SCHEMA = {
  name: 'scan_ingredient_detections',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['detections', 'warnings'],
    properties: {
      detections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'quantity', 'unit', 'category', 'confidence', 'quantityConfidence', 'needsReview', 'notes'],
          properties: {
            name: { type: 'string', description: 'Visible food/pantry ingredient or product name.' },
            quantity: { type: ['number', 'null'], description: 'Only when visually defensible; null otherwise.' },
            unit: { type: ['string', 'null'], description: "e.g. 'item', 'oz', 'bag', 'can'. null if unknown." },
            category: { type: ['string', 'null'], enum: ['produce', 'protein', 'dairy', 'pantry', 'frozen', 'other', null] },
            confidence: { type: 'number', description: '0..1 identity confidence.' },
            quantityConfidence: { type: ['number', 'null'], description: '0..1, null when there is no quantity.' },
            needsReview: { type: 'boolean' },
            notes: { type: ['string', 'null'], description: 'Short reason for uncertainty, if any.' },
          },
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  },
} as const;
