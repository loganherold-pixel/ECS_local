export type AuthOfflineModeCleanupReason =
  | 'startup_signed_out'
  | 'initial_provider_session'
  | 'session_restore_failure'
  | 'provider_signed_out'
  | 'session_expired'
  | 'authenticated'
  | 'explicit_sign_out';

const FORCED_CLEAR_REASONS = new Set<AuthOfflineModeCleanupReason>([
  'provider_signed_out',
  'session_expired',
  'authenticated',
  'explicit_sign_out',
]);

export function shouldClearOfflineModeForAuthCleanup(input: {
  reason: AuthOfflineModeCleanupReason;
  persistedOfflineMode: boolean;
}): boolean {
  if (FORCED_CLEAR_REASONS.has(input.reason)) return true;
  return !input.persistedOfflineMode;
}
