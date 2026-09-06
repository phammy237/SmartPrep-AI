// Supabase Edge Function: scan-ingredients
//
// Real ingredient detection for SmartPrep Scan. The Expo client sends ONE
// captured photo (base64) + scan context; this function calls an OpenAI
// vision model with a strict JSON schema and returns normalized detections.
// The user still reviews and confirms every detection in the app before
// anything is written to the pantry - this function never touches the DB.
//
// Request  (POST, authenticated):
//   { image: { base64: string, mimeType: string }, scanMode: "quick"|"guided",
//     section?: "fridge"|"freezer"|"pantry"|"quick", knownContext?: string }
//
// Response (200 unless noted):
//   { status: "ok", detections: [...], warnings: [...] }
//   { status: "no_detections", warnings: [...] }        // ok, nothing found
//   { status: "model_refusal", message }                 // model returned unusable content
//   { status: "unauthenticated" }                  (401)
//   { status: "invalid_request", reason }          (400)
//   { status: "image_too_large" }                  (413)
//   { status: "config_error" }                     (500)  // OPENAI_API_KEY missing
//   { status: "rate_limited" }                     (429)
//   { status: "upstream_timeout" }                 (504)
//   { status: "upstream_error" }                   (502)
//   { status: "malformed_upstream", reason }       (502)
//
// Secrets (npx supabase secrets set ...  - NEVER EXPO_PUBLIC_*):
//   OPENAI_API_KEY            - required
//   OPENAI_SCAN_MODEL         - optional, defaults to gpt-4o-mini
//   SUPABASE_URL / SUPABASE_ANON_KEY - injected by the platform (auth check)
//
// NOT deployed by this task:
//   npx supabase functions deploy scan-ingredients
//   npx supabase secrets set OPENAI_API_KEY=sk-...
//
// Privacy: the image is transient inference input. It is never stored, never
// written to a bucket, and never logged (no base64, no data URI, no keys, no
// Authorization header).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { MAX_DETECTIONS, VISION_JSON_SCHEMA, normalizeVisionResponse } from './normalize.ts';
import { SCAN_PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt } from './prompt.ts';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_IMAGE_BASE64_CHARS = 8_000_000; // ~6 MB decoded; the client sends much smaller
const MAX_OUTPUT_TOKENS = 1500;
const OPENAI_TIMEOUT_MS = 28_000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Safe operational log line - no image, no keys, no headers, no PII. */
function logEvent(fields: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ fn: 'scan-ingredients', promptVersion: SCAN_PROMPT_VERSION, ...fields }));
  } catch {
    /* never let logging throw */
  }
}

async function requireUser(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return null;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

interface ParsedRequest {
  base64: string;
  mimeType: string;
  scanMode: 'quick' | 'guided';
  section: string | null;
  knownContext: string | null;
}

function parseRequest(payload: Record<string, unknown>): { ok: true; value: ParsedRequest } | { ok: false; status: number; body: unknown } {
  const image = payload.image as Record<string, unknown> | undefined;
  const base64 = typeof image?.base64 === 'string' ? image.base64 : '';
  const mimeType = typeof image?.mimeType === 'string' && /^image\/(jpeg|jpg|png|webp)$/i.test(image.mimeType) ? image.mimeType : 'image/jpeg';
  const scanMode = payload.scanMode === 'guided' ? 'guided' : payload.scanMode === 'quick' ? 'quick' : null;

  if (!scanMode) return { ok: false, status: 400, body: { status: 'invalid_request', reason: "scanMode must be 'quick' or 'guided'" } };
  if (base64.length < 100) return { ok: false, status: 400, body: { status: 'invalid_request', reason: 'image.base64 is missing or too small' } };
  if (base64.length > MAX_IMAGE_BASE64_CHARS) return { ok: false, status: 413, body: { status: 'image_too_large' } };

  const section = typeof payload.section === 'string' ? payload.section.slice(0, 32) : null;
  const knownContext = typeof payload.knownContext === 'string' ? payload.knownContext.slice(0, 300) : null;
  return { ok: true, value: { base64, mimeType, scanMode, section, knownContext } };
}

async function callOpenAI(
  apiKey: string,
  model: string,
  req: ParsedRequest,
): Promise<
  | { ok: true; content: string }
  | { ok: false; kind: 'rate_limited' | 'upstream_error' | 'upstream_timeout' | 'malformed_upstream'; reason?: string }
> {
  const userPrompt = buildUserPrompt(req.scanMode, req.section) + (req.knownContext ? `\nUser context: ${req.knownContext}` : '');
  const requestBody = {
    model,
    temperature: 0.1,
    max_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: 'json_schema', json_schema: VISION_JSON_SCHEMA },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: `data:${req.mimeType};base64,${req.base64}`, detail: 'auto' } },
        ],
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
    return { ok: false, kind: isTimeout ? 'upstream_timeout' : 'upstream_error' };
  }

  if (res.status === 429) return { ok: false, kind: 'rate_limited' };
  if (!res.ok) {
    // Do not surface upstream body (may contain org/key hints).
    return { ok: false, kind: res.status >= 500 ? 'upstream_error' : 'upstream_error', reason: `openai_status_${res.status}` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, kind: 'malformed_upstream', reason: 'non-JSON body' };
  }

  const choice = (body as { choices?: Array<{ message?: { content?: unknown; refusal?: unknown } }> })?.choices?.[0];
  const refusal = choice?.message?.refusal;
  if (typeof refusal === 'string' && refusal.trim().length > 0) {
    return { ok: true, content: JSON.stringify({ refusal }) };
  }
  const content = choice?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    return { ok: false, kind: 'malformed_upstream', reason: 'no message content' };
  }
  return { ok: true, content };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const startedAt = Date.now();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ status: 'method_not_allowed' }, 405);

  const user = await requireUser(req);
  if (!user) {
    logEvent({ ok: false, errorCategory: 'unauthenticated', latencyMs: Date.now() - startedAt });
    return json({ status: 'unauthenticated' }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ status: 'invalid_request', reason: 'body must be JSON' }, 400);
  }

  const parsed = parseRequest(payload);
  if (!parsed.ok) {
    logEvent({ ok: false, errorCategory: 'invalid_request', latencyMs: Date.now() - startedAt });
    return json(parsed.body, parsed.status);
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    logEvent({ ok: false, errorCategory: 'config_error', latencyMs: Date.now() - startedAt });
    return json({ status: 'config_error' }, 500);
  }
  const model = Deno.env.get('OPENAI_SCAN_MODEL') || DEFAULT_MODEL;

  const openai = await callOpenAI(apiKey, model, parsed.value);
  if (!openai.ok) {
    const httpStatus = openai.kind === 'rate_limited' ? 429 : openai.kind === 'upstream_timeout' ? 504 : 502;
    logEvent({ ok: false, errorCategory: openai.kind, latencyMs: Date.now() - startedAt });
    return json({ status: openai.kind }, httpStatus);
  }

  const normalized = normalizeVisionResponse(openai.content);
  if (normalized.status === 'malformed') {
    logEvent({ ok: false, errorCategory: 'malformed_model', latencyMs: Date.now() - startedAt });
    return json({ status: 'malformed_upstream', reason: normalized.reason }, 502);
  }
  if (normalized.status === 'model_refusal') {
    logEvent({ ok: false, errorCategory: 'model_refusal', latencyMs: Date.now() - startedAt });
    return json({ status: 'model_refusal', message: normalized.message }, 200);
  }

  logEvent({
    ok: true,
    model,
    scanMode: parsed.value.scanMode,
    detectionCount: normalized.detections.length,
    warningCount: normalized.warnings.length,
    latencyMs: Date.now() - startedAt,
  });

  return json({
    status: normalized.detections.length === 0 ? 'no_detections' : 'ok',
    detections: normalized.detections.slice(0, MAX_DETECTIONS),
    warnings: normalized.warnings,
  });
});
