const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

const {
  ECS_ALERT_DEDUPE_WINDOW_MS,
  createECSUpdateFingerprint,
  createECSUpdateSemanticFingerprint,
  ecsUpdateDedupeTestHooks,
  shouldSuppressECSUpdate,
  shouldSuppressECSUpdateInRegistry,
} = loadTypeScriptModule('lib/ecsUpdateDedupe.ts');
const { briefCadLogStore, recordBriefCadEntry } = loadTypeScriptModule('lib/briefCadLogStore.ts');
const { advisoryStore, createAlertMessage } = loadTypeScriptModule('lib/advisoryStore.ts');
const advisoryStoreSource = fs.readFileSync(path.join(process.cwd(), 'lib/advisoryStore.ts'), 'utf8');

assert.strictEqual(
  ECS_ALERT_DEDUPE_WINDOW_MS,
  10 * 60 * 1000,
  'ECS alert duplicate window should be ten minutes.',
);

const baseEvent = {
  id: 'weather-storm-route-a',
  type: 'weather',
  title: 'Storm Warning',
  message: 'High wind expected on route.',
  severity: 'warning',
  source: 'weather_engine',
  timestamp: 1_000,
};
const repeatedEvent = {
  ...baseEvent,
  timestamp: 10_000,
};

assert.strictEqual(
  createECSUpdateFingerprint(baseEvent),
  createECSUpdateFingerprint(repeatedEvent),
  'Timestamp-only changes should not change the stable ECS update fingerprint.',
);
assert.strictEqual(
  shouldSuppressECSUpdate({ lastEvent: baseEvent, nextEvent: repeatedEvent }),
  true,
  'Repeated same alert inside ten minutes should be suppressed.',
);
ecsUpdateDedupeTestHooks.clearRegistry();
assert.strictEqual(
  shouldSuppressECSUpdateInRegistry({ nextEvent: baseEvent }),
  false,
  'First producer should be allowed to accept a new ECS fingerprint.',
);
assert.strictEqual(
  shouldSuppressECSUpdateInRegistry({ nextEvent: repeatedEvent }),
  true,
  'Second producer in the same startup tick should not accept the same fingerprint as first_event.',
);
assert.strictEqual(
  shouldSuppressECSUpdateInRegistry({
    nextEvent: { ...repeatedEvent, severity: 'critical' },
  }),
  false,
  'Central registry should still accept meaningful updates.',
);
assert.strictEqual(
  shouldSuppressECSUpdateInRegistry({ nextEvent: { ...repeatedEvent, id: 'weather-storm-route-a-remount' } }),
  true,
  'Same semantic warning from a remounted producer with a new id should still be suppressed.',
);
assert.strictEqual(
  ecsUpdateDedupeTestHooks.registrySize() > 0,
  true,
  'Central ECS dedupe registry should retain accepted fingerprints synchronously.',
);
ecsUpdateDedupeTestHooks.clearRegistry();
assert.strictEqual(
  shouldSuppressECSUpdate({
    lastEvent: baseEvent,
    nextEvent: { ...repeatedEvent, severity: 'critical' },
  }),
  false,
  'Severity changes should be treated as meaningful updates.',
);
assert.strictEqual(
  shouldSuppressECSUpdate({
    lastEvent: baseEvent,
    nextEvent: { ...repeatedEvent, id: 'weather-storm-route-b' },
  }),
  true,
  'Identical semantic content with a different id should not be accepted as a meaningful_update.',
);
assert.strictEqual(
  shouldSuppressECSUpdate({
    lastEvent: baseEvent,
    nextEvent: { ...repeatedEvent, message: 'High wind expected on route. Stage recovery gear.' },
  }),
  false,
  'Material body changes should be treated as meaningful updates.',
);
assert.strictEqual(
  shouldSuppressECSUpdate({
    lastEvent: baseEvent,
    nextEvent: { ...repeatedEvent, userCreated: true },
  }),
  false,
  'User-created actions should never be suppressed as polling duplicates.',
);
assert.strictEqual(
  shouldSuppressECSUpdate({
    lastEvent: baseEvent,
    nextEvent: { ...baseEvent, timestamp: baseEvent.timestamp + ECS_ALERT_DEDUPE_WINDOW_MS },
  }),
  true,
  'Same alert exactly at the ten-minute boundary should still be suppressed.',
);
assert.strictEqual(
  shouldSuppressECSUpdate({
    lastEvent: baseEvent,
    nextEvent: { ...baseEvent, timestamp: baseEvent.timestamp + ECS_ALERT_DEDUPE_WINDOW_MS + 1 },
  }),
  false,
  'Same alert outside the duplicate window should be accepted.',
);
assert.strictEqual(
  shouldSuppressECSUpdate({
    lastEvent: baseEvent,
    nextEvent: {
      ...baseEvent,
      id: 'weather-storm-route-b',
      title: 'Flood Warning',
      message: 'Flooding expected on route.',
      timestamp: 10_000,
    },
  }),
  false,
  'Different stable alert IDs with different alert content should be accepted inside the duplicate window.',
);

const fingerprintedEvent = {
  type: 'weather',
  title: 'Storm Warning',
  message: 'High wind expected on route.',
  severity: 'warning',
  source: 'weather_engine',
  location: { latitude: 39.739236, longitude: -104.990251 },
  timestamp: 200_000,
};
const repeatedFingerprintEvent = {
  ...fingerprintedEvent,
  title: 'Storm   Warning',
  message: 'High wind expected on route.',
  timestamp: 210_000,
};
assert.strictEqual(
  createECSUpdateFingerprint(fingerprintedEvent),
  createECSUpdateFingerprint(repeatedFingerprintEvent),
  'Alerts without IDs should dedupe through normalized type/severity/title/message/location fingerprinting.',
);
assert.strictEqual(
  createECSUpdateSemanticFingerprint(baseEvent),
  createECSUpdateSemanticFingerprint({ ...repeatedEvent, id: 'different-id-same-warning' }),
  'Semantic fingerprint should ignore unstable producer IDs for same warning content.',
);
assert.strictEqual(
  shouldSuppressECSUpdate({
    lastEvent: fingerprintedEvent,
    nextEvent: repeatedFingerprintEvent,
  }),
  true,
  'Missing stable IDs should still suppress same alert fingerprints inside ten minutes.',
);
assert.strictEqual(
  shouldSuppressECSUpdate({
    lastEvent: fingerprintedEvent,
    nextEvent: { ...fingerprintedEvent, title: 'Flood Warning', timestamp: 210_000 },
  }),
  false,
  'Different alert content should be accepted inside the duplicate window.',
);

ecsUpdateDedupeTestHooks.clearRegistry();
assert.strictEqual(
  shouldSuppressECSUpdateInRegistry({ nextEvent: baseEvent }),
  false,
  'Initial module instance should accept a new warning once.',
);
const reloadedDedupeModule = loadTypeScriptModule('lib/ecsUpdateDedupe.ts');
assert.strictEqual(
  reloadedDedupeModule.shouldSuppressECSUpdateInRegistry({ nextEvent: repeatedEvent }),
  true,
  'Global ECS dedupe registry should survive provider/auth remount style module reloads.',
);
reloadedDedupeModule.ecsUpdateDedupeTestHooks.clearRegistry();

briefCadLogStore.clear();
recordBriefCadEntry({
  id: 'route-brief-1',
  text: 'Route analyzed. Camp stop candidates are available.',
  mode: 'advisory',
  priority: 3,
  queuedAt: 100_000,
});
recordBriefCadEntry({
  id: 'route-brief-1',
  text: 'Route analyzed.   Camp stop candidates are available.',
  mode: 'advisory',
  priority: 3,
  queuedAt: 110_000,
});
assert.strictEqual(
  briefCadLogStore.getEntries().length,
  1,
  'Brief Activity Log should suppress same alert repeats within ten minutes.',
);
recordBriefCadEntry({
  id: 'route-brief-3',
  text: 'Route analyzed. Severe weather warning added.',
  mode: 'alert',
  priority: 1,
  queuedAt: 120_000,
});
assert.strictEqual(
  briefCadLogStore.getEntries().length,
  2,
  'Brief Activity Log should accept meaningful alert updates immediately.',
);

advisoryStore.clear();
advisoryStore.push(createAlertMessage('weather-a', 'High wind expected on route.', { priority: 2 }));
advisoryStore.push(createAlertMessage('weather-b', 'High wind expected on route.', { priority: 2 }));
assert(
  advisoryStoreSource.includes('shouldSuppressECSUpdateInRegistry') &&
    !advisoryStoreSource.includes('recentDedupeEvents') &&
    !advisoryStoreSource.includes('clearECSUpdateDedupeRegistry') &&
    advisoryStoreSource.includes('recordBriefCadEntryFromAdvisory(fullMessage, { dedupeAlreadyAccepted: true })'),
  'Advisory store should run central ECS duplicate suppression without clearing the session registry on remount cleanup.',
);

advisoryStore.destroy();

console.log('ECS update dedupe checks passed.');
