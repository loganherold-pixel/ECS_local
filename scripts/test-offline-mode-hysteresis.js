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

const source = read('lib/offlineExpeditionModeEngine.ts');

assert(
  source.includes('LIMITED_STATE_DEBOUNCE_MS = 12_000') &&
    source.includes('RECONNECTING_STATE_DEBOUNCE_MS = 8_000') &&
    source.includes('OFFLINE_STATE_DEBOUNCE_MS = 2_000') &&
    source.includes('RECOVERY_TO_ONLINE_SETTLE_MS = 2_500'),
  'Offline mode should use distinct hysteresis windows for limited, reconnecting, offline, and recovery states.',
);

assert(
  source.includes("rawState === 'online' && currentState === 'limited'") &&
    source.includes('return currentState;') &&
    source.includes("return 'online';"),
  'Recovery from limited connectivity should settle directly back to online instead of visibly flapping through reconnecting.',
);

assert(
  source.includes('_logSuppressedTransient') &&
    source.includes('Offline mode transient state held for hysteresis') &&
    source.includes('TRANSIENT_SUPPRESSION_LOG_MS'),
  'Suppressed transient offline-mode changes should be debug logged with throttling.',
);

assert(
  source.includes('_readConnectivityReason') &&
    source.includes('userForcedOfflineMode') &&
    source.includes('realtimeSyncUnavailable') &&
    source.includes('tileCacheServiceUnavailable') &&
    source.includes('connectivityStatus') &&
    source.includes('connectivityLevel'),
  'Offline mode transition diagnostics should distinguish forced offline, transport, realtime, and tile/cache causes.',
);

assert(
  source.includes("if (newState === 'offline')") &&
    source.includes("ecsLog.warn('SYSTEM', `Offline mode state changed to ${newState}`") &&
    source.includes("debugOfflineMode(`Offline mode state changed to ${newState}`"),
  'Only real offline transitions should warn; limited/reconnecting transitions should use debug logging.',
);

console.log('offline mode hysteresis checks passed');
