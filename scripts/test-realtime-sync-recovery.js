const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const realtimeSource = read('lib/realtimeSync.ts');
const dispatchSource = read('components/dispatch/DispatchCommandCenter.tsx');

assert(
  realtimeSource.includes("import { connectivity, type ConnectivityStatus } from './connectivity';"),
  'RealtimeSync should use the canonical connectivity monitor.',
);

assert(
  realtimeSource.includes('RECONNECT_BASE_DELAY_MS') &&
    realtimeSource.includes('RECONNECT_MAX_DELAY_MS') &&
    realtimeSource.includes('RECONNECT_MAX_WINDOW_MS') &&
    realtimeSource.includes('RECONNECT_MAX_ATTEMPTS') &&
    realtimeSource.includes('SUBSCRIPTION_TIMEOUT_MS') &&
    realtimeSource.includes('REALTIME_WARNING_THROTTLE_MS'),
  'RealtimeSync should define backoff, retry-window, timeout, max-attempt, and warning-throttle constants.',
);

assert(
  realtimeSource.includes("'idle'") &&
    realtimeSource.includes("'connecting'") &&
    realtimeSource.includes("'subscribed'") &&
    realtimeSource.includes("'timed_out'") &&
    realtimeSource.includes("'retrying'") &&
    realtimeSource.includes("'degraded'") &&
    realtimeSource.includes("'offline_available'"),
  'RealtimeSync should expose a clear realtime state machine.',
);

assert(
  realtimeSource.includes('_channelKey') &&
    realtimeSource.includes('_subscribeInFlight') &&
    realtimeSource.includes('subscription_already_active'),
  'RealtimeSync should guard duplicate subscriptions for the same channel.',
);

assert(
  realtimeSource.includes('Math.pow(2, this._retryAttempt)') &&
    realtimeSource.includes('RECONNECT_JITTER_RATIO') &&
    realtimeSource.includes('realtime_retry_scheduled') &&
    realtimeSource.includes('realtime_retry_started') &&
    realtimeSource.includes('realtime_retry_skipped_duplicate'),
  'RealtimeSync should schedule controlled jittered exponential-backoff retries and skip parallel retries.',
);

assert(
  realtimeSource.includes('realtime_paused_offline') &&
    realtimeSource.includes('connectivity.onStatusChange') &&
    realtimeSource.includes("_lastFailureReason === 'network_offline'"),
  'RealtimeSync should pause retries while offline and resume through connectivity changes.',
);

assert(
  realtimeSource.includes('_armSubscriptionTimeout') &&
    realtimeSource.includes('_clearSubscriptionTimeout') &&
    realtimeSource.includes('_cleanupStaleChannel') &&
    realtimeSource.includes('realtime_subscribe_timeout'),
  'RealtimeSync should clear subscription timeouts and clean up stale channels on TIMED_OUT.',
);

assert(
  realtimeSource.includes('_warnThrottled') &&
    realtimeSource.includes('suppressedRepeats') &&
    !realtimeSource.includes("console.warn('[RealtimeSync] Channel error/closed')") &&
    !realtimeSource.includes("console.warn('[RealtimeSync] Subscription timed out')"),
  'RealtimeSync should throttle repeated channel warnings instead of logging every failure.',
);

assert(
  realtimeSource.includes('_channelGeneration') &&
    realtimeSource.includes('realtime_stale_channel_status_ignored') &&
    realtimeSource.includes('realtime_stale_channel_failure_ignored'),
  'RealtimeSync should ignore stale callbacks from channels that were already replaced or cleaned up.',
);

assert(
  realtimeSource.includes('reconnect_already_scheduled') &&
    realtimeSource.includes('if (this._enabled === enabled) return'),
  'RealtimeSync should skip duplicate same-user starts while reconnect is scheduled and keep enable toggles idempotent.',
);

assert(
  realtimeSource.includes("'auth_missing'") &&
    realtimeSource.includes("'network_offline'") &&
    realtimeSource.includes("'channel_closed'") &&
    realtimeSource.includes("'subscription_timeout'") &&
    realtimeSource.includes("'server_rejected'"),
  'RealtimeSync should distinguish known failure reasons.',
);

assert(
  realtimeSource.includes('realtime_subscribe_started') &&
    realtimeSource.includes('realtime_subscribed') &&
    realtimeSource.includes('realtime_initial_subscribe_failed') &&
    realtimeSource.includes('realtime_reconnect_success') &&
    realtimeSource.includes('realtime_permanent_auth_failure') &&
    realtimeSource.includes('realtime_degraded') &&
    realtimeSource.includes('realtime_cleanup'),
  'RealtimeSync should log subscribe start, success, degraded, and cleanup events.',
);

assert(
  realtimeSource.includes('supabase.auth.getSession()') &&
    realtimeSource.includes('realtime_auth_check_started') &&
    realtimeSource.includes('auth_session_invalid') &&
    realtimeSource.indexOf('supabase.auth.getSession()') < realtimeSource.indexOf('supabase.channel(channelKey'),
  'RealtimeSync should validate auth/session before opening a realtime channel.',
);

assert(
  realtimeSource.includes('summarizeRealtimeError') &&
    realtimeSource.includes('channel.subscribe((status: string, error?: unknown)') &&
    realtimeSource.includes("this._handleChannelFailure('channel_error', status, channelKey, channelGeneration, error)"),
  'RealtimeSync should capture underlying realtime channel errors when CHANNEL_ERROR is reported.',
);

assert(
  realtimeSource.includes('_removeChannelSafely') &&
    realtimeSource.includes('supabase.removeChannel(channel)') &&
    realtimeSource.includes("removal as Promise<unknown>).catch"),
  'RealtimeSync should safely remove broken channels and capture async cleanup failures.',
);

assert(
  dispatchSource.includes("activeExpedition.source === 'local'") &&
    dispatchSource.includes('realtime_paused_no_active_team') &&
    dispatchSource.includes('activeExpedition.source, applyRealtimeEvent'),
  'Dispatch realtime should not subscribe to team-only channels for the local no-team fallback.',
);

console.log('realtime sync recovery checks passed');
