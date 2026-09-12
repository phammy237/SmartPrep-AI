import { ScanInferenceError } from '@/lib/supabase/repositories';

/**
 * User-facing copy for a failed capture, by `ScanInferenceError` code (or the
 * generic fallback for anything else). Pulled out of `ProcessingScreen.tsx`
 * as a plain, RN-free module so it is directly unit-testable - same pattern
 * as the Edge Functions' `normalize.ts` files (pure logic separated from the
 * runtime-coupled shell around it).
 */
export function messageFor(err: unknown): string {
  const code = err instanceof ScanInferenceError ? err.code : 'unknown';
  switch (code) {
    case 'unauthenticated':
      return 'Your session expired. Sign in again and retry.';
    case 'network':
      return "You're offline. Reconnect and try again.";
    case 'rate_limited':
      return 'The scanner is busy right now. Wait a moment and try again.';
    case 'upstream_timeout':
      return 'That took too long. Try again in good light with the items in frame.';
    case 'image_too_large':
      return 'That photo was too large. Retake it a bit further back.';
    case 'provider_unavailable':
      // Distinct from the generic fallback below - this isn't "this one photo
      // failed," it's "photo scanning isn't available right now at all," so
      // the screen's own "Try again" retry button would be misleading without
      // this framing (the manual-entry button is the one that actually helps).
      return "Photo scanning isn't available right now. Add items by hand instead.";
    default:
      return "We couldn't read that photo. Try again, or add items by hand.";
  }
}
