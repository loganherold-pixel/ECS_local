const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assertContains(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotContains(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

const wizardDraftStore = read('lib/wizardDraftStore.ts');
const waypointProgressStore = read('lib/waypointProgressStore.ts');
const powerDeviceStore = read('src/power/devices/PowerDeviceStore.ts');
const weatherStore = read('lib/weatherStore.ts');

for (const [name, source] of [
  ['wizard draft store', wizardDraftStore],
  ['waypoint progress store', waypointProgressStore],
  ['power device store', powerDeviceStore],
  ['weather store', weatherStore],
]) {
  assertContains(
    source,
    'createPersistedKeyValueCache',
    `${name} should use the canonical persisted key-value adapter instead of native memory-only fallback storage.`,
  );
}

assertContains(
  wizardDraftStore,
  "createPersistedKeyValueCache('ecs_wizard_draft_store')",
  'Wizard drafts should use a dedicated persisted key-value namespace.',
);
assertContains(
  wizardDraftStore,
  'waitForHydration()',
  'Wizard drafts should expose hydration for restart/reload tests and startup callers.',
);
assertContains(
  wizardDraftStore,
  'flush()',
  'Wizard drafts should expose a flush helper so debounced saves can be forced before shutdown/tests.',
);
assertNotContains(
  wizardDraftStore,
  'const memoryStore',
  'Wizard drafts should not keep a native-only in-memory persistence fallback.',
);
assertNotContains(
  wizardDraftStore,
  'Platform.OS',
  'Wizard drafts should delegate platform behavior to the canonical adapter.',
);

assertContains(
  waypointProgressStore,
  "createPersistedKeyValueCache('ecs_waypoint_progress_store')",
  'Waypoint progress should use a dedicated persisted key-value namespace.',
);
assertContains(
  waypointProgressStore,
  'waitForHydration()',
  'Waypoint progress should expose hydration for restart/reload behavior.',
);
assertContains(
  waypointProgressStore,
  'flush()',
  'Waypoint progress should expose a flush helper for deterministic persistence tests.',
);
assertNotContains(
  waypointProgressStore,
  'const memoryStore',
  'Waypoint progress should not keep a native-only in-memory persistence fallback.',
);
assertNotContains(
  waypointProgressStore,
  'Platform.OS',
  'Waypoint progress should delegate platform behavior to the canonical adapter.',
);

assertContains(
  powerDeviceStore,
  'createPersistedKeyValueCache("ecs_power_device_store")',
  'Power device selections and safe metadata should use one persisted key-value namespace.',
);
assertContains(
  powerDeviceStore,
  'export type PersistedPowerDeviceMetadata',
  'Power device store should define the safe device metadata persisted locally.',
);
assertContains(
  powerDeviceStore,
  'supportedMetrics?: string[]',
  'Power device metadata should persist supported metric labels when a provider supplies them.',
);
assertContains(
  powerDeviceStore,
  'lastKnownConnectionState',
  'Power device metadata should persist non-sensitive last known connection state.',
);
assertContains(
  powerDeviceStore,
  'upsertKnownDevice(',
  'Power device store should expose a safe metadata upsert path for provider catalogs.',
);
assertContains(
  powerDeviceStore,
  'getKnownDevice(',
  'Power device store should expose known device metadata by provider and device ID.',
);
assertContains(
  powerDeviceStore,
  'clearKnownDevices(',
  'Power device store should expose a way to clear persisted safe device metadata.',
);
assertContains(
  powerDeviceStore,
  'waitForHydration()',
  'Power device store should expose hydration for restart/reload behavior.',
);
assertNotContains(
  powerDeviceStore,
  'const memoryStore',
  'Power device store should not keep a native-only in-memory persistence fallback.',
);
assertNotContains(
  powerDeviceStore,
  'from "react-native"',
  'Power device store should delegate platform behavior to the canonical adapter.',
);

assertContains(
  weatherStore,
  "createPersistedKeyValueCache('ecs_weather_cache')",
  'Weather cache should use the canonical persisted key-value adapter on native and web.',
);
assertContains(
  weatherStore,
  'WEATHER_CACHE_INDEX_KEY',
  'Weather cache should keep an index of persisted weather entries for clear/stats behavior.',
);
assertContains(
  weatherStore,
  'waitForWeatherCacheHydration',
  'Weather cache should expose hydration for restart/reload behavior.',
);
assertContains(
  weatherStore,
  'flushWeatherCache',
  'Weather cache should expose flush for deterministic persistence tests.',
);
assertContains(
  weatherStore,
  "source: isWeatherStale(cached.cachedAt) ? 'cache_stale' : 'cache_fresh'",
  'Weather cache should continue labeling stale cache honestly.',
);
assertNotContains(
  weatherStore,
  'function readLocalStorage(',
  'Weather cache reads should go through the persisted adapter instead of a web-only helper.',
);
assertNotContains(
  weatherStore,
  'localStorage.setItem(CACHE_KEY_PREFIX',
  'Weather cache writes should go through the persisted adapter instead of direct web-only storage.',
);

const contractPath = 'docs/operational-persistence-contract.md';
assert.ok(exists(contractPath), 'Operational persistence contract doc should exist.');
const contract = read(contractPath);
for (const fragment of [
  'createPersistedKeyValueCache',
  'wizardDraftStore',
  'PowerDeviceStore',
  'waypointProgressStore',
  'weatherStore',
  'Safe for non-secure local persistence',
  'Intentionally memory-only',
  'Do not persist secrets',
]) {
  assertContains(contract, fragment, `Operational persistence contract should document ${fragment}.`);
}

console.log('Operational persistence adapter checks passed.');
