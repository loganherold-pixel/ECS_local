const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const connectivitySource = read('lib/connectivity.ts');
const intelStoreSource = read('lib/connectivityIntelStore.ts');
const intelServiceSource = read('lib/connectivityIntelService.ts');
const interlockSource = read('lib/ecsOfflineInterlock.ts');

assert(
  connectivitySource.includes("if (this._networkType === 'none')"),
  'connectivity.ts should force offline when transport type is none.'
);

assert(
  !connectivitySource.includes("this._updateStatus(navigator.onLine ? 'online' : 'offline');"),
  'connectivity.ts should not optimistically seed online/offline from navigator.onLine during startup.'
);

assert(
  connectivitySource.includes("if (this._initialized && this._status !== 'online' && !this._checkInFlight)") &&
    connectivitySource.includes("!this._checkInFlight") &&
    connectivitySource.includes("this._updateStatus('reconnecting');"),
  'connectivity.ts should only publish reconnecting from online events after initial reconciliation, when not already online, and when no check is already in flight.'
);

assert(
  connectivitySource.includes('private _checkInFlight: Promise<boolean> | null = null;') &&
    connectivitySource.includes('if (this._checkInFlight)') &&
    connectivitySource.includes('return this._checkInFlight;') &&
    connectivitySource.includes('this._performConnectivityCheck().finally(() =>') &&
    connectivitySource.includes('this._checkInFlight = null;'),
  'connectivity.ts should serialize reachability checks so startup/event/poll checks cannot race into status flapping.'
);

assert(
  !connectivitySource.includes("if (this._status === 'offline' || this._status === 'reconnecting') {\n        this._updateStatus('reconnecting');") &&
    !connectivitySource.includes("if (this._status === 'offline' || this._status === 'reconnecting') {\r\n        this._updateStatus('reconnecting');"),
  'connectivity polling should not force offline devices through reconnecting before a check.'
);

assert(
  intelStoreSource.includes("connectivity_state: restoredTransportNone ? 'offline' : 'unknown'"),
  'connectivityIntelStore restore should sanitize restored sessions into offline/unknown startup state.'
);

assert(
  intelStoreSource.includes('active_source: null'),
  'connectivityIntelStore restore should clear active_source until live reconciliation occurs.'
);

assert(
  intelServiceSource.includes("if (connectivityState === 'unknown')"),
  'connectivityIntelService should treat unknown connectivity as a non-live freshness state.'
);

assert(
  intelServiceSource.includes("const isLive = freshness === 'live' && debouncedState !== 'unknown';"),
  'connectivityIntelService should not mark unknown startup state as live.'
);

assert(
  interlockSource.includes("return 'offline';\n}") ||
    interlockSource.includes("return 'offline';\r\n}"),
  'ecsOfflineInterlock should map unresolved connectivity to offline-safe mode.'
);

assert(
  interlockSource.includes("mode: 'offline'"),
  'ecsOfflineInterlock default state should be offline-safe at startup.'
);

assert(
  interlockSource.includes('_stateSignature') &&
    interlockSource.includes('_lastNotifiedSignature'),
  'ecsOfflineInterlock should suppress duplicate listener notifications for identical state.'
);

assert(
  interlockSource.includes("discovery_source: 'cached_only'") &&
    interlockSource.includes("navigation_source: 'cached_only'"),
  'ecsOfflineInterlock default source priorities should not unlock live-only behavior during boot.'
);

assert(
  read('lib/offlineCacheAwarenessEngine.ts').includes('INVALIDATION_DEDUPE_WINDOW_MS') &&
    read('lib/offlineNavigationBridge.ts').includes('INVALIDATION_DEDUPE_WINDOW_MS'),
  'offline cache invalidators should dedupe identical startup invalidation bursts.'
);

assert(
  read('lib/offlineCacheAwarenessEngine.ts').includes('VOLATILE_INVALIDATION_KEYS') &&
    read('lib/offlineNavigationBridge.ts').includes('VOLATILE_INVALIDATION_KEYS'),
  'offline cache invalidators should ignore volatile timestamp fields when building idempotency keys.'
);

assert(
  intelServiceSource.includes("const invalidated = invalidateCacheReadiness('tile_cache_store_change', tileCacheState);") &&
    (intelServiceSource.includes("if (invalidated) {\n          _update();") ||
      intelServiceSource.includes("if (invalidated) {\r\n          _update();")),
  'connectivityIntelService should skip tile-cache re-evaluation when cache invalidation was deduped.'
);

assert(
  intelServiceSource.includes("const invalidated = invalidateCacheReadiness(reason, sourceState);") &&
    (intelServiceSource.includes("if (invalidated) {\n      _update();") ||
      intelServiceSource.includes("if (invalidated) {\r\n      _update();")),
  'connectivityIntelService.invalidateCache should not re-evaluate for duplicate invalidation keys.'
);

console.log('Connectivity startup hardening checks passed.');
