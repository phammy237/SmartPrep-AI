// Supabase Edge Function: receipt-ocr
//
// Expo -> here -> AWS Textract AnalyzeExpense -> provider-neutral ReceiptOcrResult.
// The AWS credentials NEVER reach the client. This function does NOT touch the
// database and NEVER creates pantry inventory - it only extracts structured
// receipt data for the review screen.
//
// Request:  { "image": { "base64": "<jpeg/png bytes>", "mimeType": "image/jpeg" } }
// Response: { "status": "ok", "result": ReceiptOcrResult }
//        |  { "status": "no_line_items", "result": ReceiptOcrResult }
//        |  { "status": "invalid_image" | "image_too_large" | "rate_limited"
//        |            | "upstream_error" | "malformed_upstream"
//        |            | "config_error" | "unauthenticated" | "auth_error" }
//
// Secrets (never EXPO_PUBLIC_*):
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   IAM user limited to textract:AnalyzeExpense
//   AWS_REGION                                  e.g. us-east-1
//   SUPABASE_URL / SUPABASE_ANON_KEY            injected (for the JWT auth check)
//
// NOT deployed by this task. `supabase functions deploy receipt-ocr` + the
// secrets above are still required. The receipt image is processed and
// discarded - it is never written to Storage, S3, or a table.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { normalizeTextractExpense } from './normalize.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ~4 MB of base64 ≈ ~3 MB JPEG. Textract's synchronous image limit is 10 MB;
// we cap well below that to keep requests fast.
const MAX_BASE64_CHARS = 4_200_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const UPSTREAM_TIMEOUT_MS = 25_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ status: 'method_not_allowed' }, 405);

  const user = await requireUser(req);
  if (!user) return json({ status: 'unauthenticated' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ status: 'invalid_image', reason: 'body must be JSON' }, 400);
  }

  const image = payload.image as { base64?: unknown; mimeType?: unknown } | undefined;
  const base64 = typeof image?.base64 === 'string' ? image.base64 : '';
  const mimeType = typeof image?.mimeType === 'string' ? image.mimeType.toLowerCase() : '';
  if (base64.length === 0 || !ALLOWED_MIME.has(mimeType)) {
    return json({ status: 'invalid_image', reason: 'image.base64 + a jpeg/png mimeType are required' }, 400);
  }
  if (base64.length > MAX_BASE64_CHARS) {
    return json({ status: 'image_too_large' }, 413);
  }

  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const region = Deno.env.get('AWS_REGION') ?? 'us-east-1';
  if (!accessKeyId || !secretAccessKey) return json({ status: 'config_error' }, 500);

  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: 'textract' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let res: Response;
  try {
    res = await aws.fetch(`https://textract.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'Textract.AnalyzeExpense',
      },
      body: JSON.stringify({ Document: { Bytes: base64 } }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return json({ status: 'upstream_error' }, 502);
  }
  clearTimeout(timer);

  if (res.status === 429) return json({ status: 'rate_limited' }, 429);
  if (res.status === 400) return json({ status: 'invalid_image' }, 400);
  if (res.status === 403) return json({ status: 'auth_error' }, 502);
  if (!res.ok) return json({ status: 'upstream_error' }, 502);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return json({ status: 'malformed_upstream' }, 502);
  }

  const normalized = normalizeTextractExpense(body);
  if (normalized.status === 'malformed') return json({ status: 'malformed_upstream' }, 502);
  return json({ status: normalized.status, result: normalized.result });
});
