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
  interlockSource.includes("discovery_source: 'cached_only'") &&
    interlockSource.includes("navigation_source: 'cached_only'"),
  'ecsOfflineInterlock default source priorities should not unlock live-only behavior during boot.'
);

console.log('Connectivity startup hardening checks passed.');
