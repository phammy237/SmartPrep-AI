import { ScanInferenceError } from '@/lib/supabase/repositories';
import { messageFor } from '../processingErrorMessages';

// `@/lib/supabase/repositories` transitively imports the real Supabase client,
// which throws at import time without real EXPO_PUBLIC_SUPABASE_* env vars -
// mock it out; ScanInferenceError itself needs no other repository behavior.
// (jest.mock calls are hoisted above imports by babel-jest regardless of
// source position, so this still takes effect before the import above runs.)
jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

describe('messageFor', () => {
  it('gives a distinct, honest message for provider_unavailable - not the generic "couldn\'t read that photo" copy', () => {
    const msg = messageFor(new ScanInferenceError('provider_unavailable', 'no provider configured'));
    expect(msg).toMatch(/not available|isn't available/i);
    expect(msg).not.toMatch(/couldn't read that photo/i);
  });

  it('still maps other known codes correctly (regression)', () => {
    expect(messageFor(new ScanInferenceError('network'))).toMatch(/offline/i);
    expect(messageFor(new ScanInferenceError('rate_limited'))).toMatch(/busy/i);
  });

  it('falls back to the generic message for a non-ScanInferenceError / unknown failure', () => {
    expect(messageFor(new Error('boom'))).toMatch(/couldn't read that photo/i);
    expect(messageFor('not even an Error')).toMatch(/couldn't read that photo/i);
  });
});
