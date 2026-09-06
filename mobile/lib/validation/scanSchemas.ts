import { z } from 'zod';

/**
 * Client-side re-validation of the `scan-ingredients` Edge Function response.
 * The function already normalizes its output, but Review must never be handed
 * an unvalidated shape - a malformed response becomes a typed error, not a crash.
 */

const confidence = z.number().min(0).max(1);

export const visionDetectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().finite().positive().nullable(),
  unit: z.string().trim().min(1).max(24).nullable(),
  category: z.enum(['produce', 'protein', 'dairy', 'pantry', 'frozen', 'other']).nullable(),
  confidence,
  quantityConfidence: confidence.nullable(),
  needsReview: z.boolean(),
  notes: z.string().trim().max(200).nullable(),
});

export const visionSuccessSchema = z.object({
  status: z.enum(['ok', 'no_detections']),
  detections: z.array(visionDetectionSchema).max(40),
  warnings: z.array(z.string()).max(10).default([]),
});

/** Non-throwing statuses the function can return with HTTP 200. */
export const visionModelRefusalSchema = z.object({
  status: z.literal('model_refusal'),
  message: z.string().max(400).optional(),
});

/** Error statuses (the function returns these with a non-200 status, but `functions.invoke` still surfaces the body). */
export const visionErrorStatusSchema = z.object({
  status: z.enum([
    'unauthenticated',
    'invalid_request',
    'image_too_large',
    'config_error',
    'rate_limited',
    'upstream_timeout',
    'upstream_error',
    'malformed_upstream',
    'method_not_allowed',
  ]),
  reason: z.string().optional(),
});

export type VisionDetection = z.infer<typeof visionDetectionSchema>;
export type VisionSuccess = z.infer<typeof visionSuccessSchema>;
