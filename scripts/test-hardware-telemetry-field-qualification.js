const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      StyleSheet: { create: (styles) => styles },
      Text: 'Text',
      TouchableOpacity: 'TouchableOpacity',
      View: 'View',
      ScrollView: 'ScrollView',
    };
  }
  if (request === 'expo-router') {
    return { Redirect: () => null, Stack: { Screen: () => null } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const qualification = require(path.join(root, 'src', 'telemetry', 'hardwareTelemetryQualification.ts'));

const {
  HARDWARE_TELEMETRY_DATA_STATES,
  HARDWARE_TELEMETRY_LIVE_MAX_AGE_MS,
  HARDWARE_TELEMETRY_PROVIDER_INVENTORY,
  HARDWARE_TELEMETRY_QA_FIXTURES,
  HARDWARE_TELEMETRY_TRUTH_RULES,
  ACTIVE_TRIP_PACKET_TELEMETRY_AUDIT,
  DASHBOARD_POWER_TELEMETRY_AUDIT,
  getHardwareTelemetryQaFixtures,
  isHardwareTelemetryQaHarnessEnabled,
  qualifyHardwareTelemetrySample,
} = qualification;

const now = Date.parse('2026-06-10T18:00:00.000Z');

assert.deepEqual(
  HARDWARE_TELEMETRY_DATA_STATES,
  ['live', 'stale', 'manual', 'unknown', 'unavailable', 'unsupported', 'mock', 'demo', 'error'],
  'hardware telemetry qualification states must be explicit and complete',
);
assert.equal(HARDWARE_TELEMETRY_LIVE_MAX_AGE_MS, 30_000, 'live hardware readings should age out quickly');
assert.equal(isHardwareTelemetryQaHarnessEnabled({ dev: false, nodeEnv: 'production' }), false);
assert.equal(isHardwareTelemetryQaHarnessEnabled({ dev: true, nodeEnv: 'production' }), true);
assert.equal(isHardwareTelemetryQaHarnessEnabled({ dev: false, nodeEnv: 'test' }), true);
assert.deepEqual(getHardwareTelemetryQaFixtures({ dev: false, nodeEnv: 'production' }), [], 'production must not expose QA fixtures');
assert.ok(getHardwareTelemetryQaFixtures({ dev: true }).length >= 9, 'dev/test harness should cover all hardware telemetry edge states');

const liveObd = qualifyHardwareTelemetrySample({
  providerId: 'obd2_veepeak',
  providerLabel: 'VeePeak OBD2',
  surface: 'vehicle_obd2',
  connectionState: 'reading',
  source: 'trusted_live',
  decodedMetrics: ['engine_rpm', 'vehicle_speed'],
  sampleReceivedAt: now - 5_000,
  now,
});
assert.equal(liveObd.dataState, 'live');
assert.equal(liveObd.isLive, true);
assert.match(liveObd.truthLabel, /Live decoded telemetry/);

const connectionOnly = qualifyHardwareTelemetrySample({
  providerId: 'obd2_veepeak',
  providerLabel: 'VeePeak OBD2',
  surface: 'vehicle_obd2',
  connectionState: 'connected',
  source: 'trusted_live',
  decodedMetrics: [],
  sampleReceivedAt: now - 2_000,
  now,
});
assert.notEqual(connectionOnly.dataState, 'live', 'connected hardware without decoded metrics must not qualify as live');
assert.equal(connectionOnly.dataState, 'unsupported');
assert.equal(connectionOnly.isLive, false);
assert.match(connectionOnly.truthLabel, /Connected; no decoded telemetry/);

const staleObd = qualifyHardwareTelemetrySample({
  providerId: 'obd2_veepeak',
  providerLabel: 'VeePeak OBD2',
  surface: 'vehicle_obd2',
  connectionState: 'connected',
  source: 'trusted_live',
  decodedMetrics: ['engine_rpm'],
  sampleReceivedAt: now - 90_000,
  now,
});
assert.equal(staleObd.dataState, 'stale');
assert.equal(staleObd.isLive, false);
assert.match(staleObd.truthLabel, /Stale telemetry/);

const manual = qualifyHardwareTelemetrySample({
  providerId: 'generic_power_manual',
  providerLabel: 'Manual Power',
  surface: 'power_store',
  connectionState: 'unknown',
  source: 'manual',
  decodedMetrics: ['battery_percent'],
  sampleReceivedAt: now,
  now,
});
assert.equal(manual.dataState, 'manual');
assert.equal(manual.isLive, false);

const mock = qualifyHardwareTelemetrySample({
  providerId: 'mock_power_connector',
  providerLabel: 'Mock Power',
  surface: 'power_store',
  connectionState: 'reading',
  source: 'mock',
  decodedMetrics: ['battery_percent'],
  sampleReceivedAt: now,
  now,
});
assert.equal(mock.dataState, 'mock');
assert.equal(mock.isLive, false);
assert.equal(mock.productionReady, false);
assert.match(mock.truthLabel, /Mock telemetry ignored/);

const demo = qualifyHardwareTelemetrySample({
  providerId: 'demo_utility_sensor',
  providerLabel: 'Demo Utility Sensor',
  surface: 'utility_sensor',
  connectionState: 'reading',
  source: 'demo',
  decodedMetrics: ['level_percent'],
  sampleReceivedAt: now,
  now,
});
assert.equal(demo.dataState, 'demo');
assert.equal(demo.isLive, false);
assert.equal(demo.productionReady, false);

const error = qualifyHardwareTelemetrySample({
  providerId: 'ecoflow_cloud_api',
  providerLabel: 'EcoFlow Cloud/API',
  surface: 'power_store',
  connectionState: 'error',
  source: 'trusted_live',
  decodedMetrics: [],
  sampleReceivedAt: null,
  errorReason: 'Provider timeout',
  now,
});
assert.equal(error.dataState, 'error');
assert.equal(error.isLive, false);
assert.match(error.truthLabel, /Provider error/);

const unsupported = qualifyHardwareTelemetrySample({
  providerId: 'mopeka_bluestack_utility_sensor',
  providerLabel: 'Mopeka / Bluestack utility sensor',
  surface: 'utility_sensor',
  connectionState: 'connected',
  source: 'trusted_live',
  decodedMetrics: ['level_distance_mm'],
  unsupportedReason: 'Tank geometry missing; distance cannot be converted to percent.',
  sampleReceivedAt: now,
  now,
});
assert.equal(unsupported.dataState, 'unsupported');
assert.equal(unsupported.isLive, false);
assert.match(unsupported.truthLabel, /Unsupported telemetry/);

const inventoryIds = new Set(HARDWARE_TELEMETRY_PROVIDER_INVENTORY.map((provider) => provider.id));
[
  'obd2_veepeak',
  'ecoflow_ble',
  'ecoflow_cloud_api',
  'mopeka_bluestack_utility_sensor',
  'generic_power_manual',
  'mock_power_connector',
].forEach((id) => assert.ok(inventoryIds.has(id), `provider inventory must include ${id}`));

const veepeak = HARDWARE_TELEMETRY_PROVIDER_INVENTORY.find((provider) => provider.id === 'obd2_veepeak');
assert.equal(veepeak.classification, 'hardware_qa_required');
assert.ok(veepeak.checklist.some((item) => /decoded PID/i.test(item)), 'VeePeak checklist must require decoded PID evidence');

const ecoflowBle = HARDWARE_TELEMETRY_PROVIDER_INVENTORY.find((provider) => provider.id === 'ecoflow_ble');
assert.equal(ecoflowBle.classification, 'partial');
assert.ok(ecoflowBle.productionGate, 'EcoFlow BLE must remain production-gated until field evidence is complete');

const mopeka = HARDWARE_TELEMETRY_PROVIDER_INVENTORY.find((provider) => provider.id === 'mopeka_bluestack_utility_sensor');
assert.equal(mopeka.classification, 'parser_pending_or_manual');
assert.ok(mopeka.checklist.some((item) => /tank profile/i.test(item)), 'Mopeka checklist must require tank profile/calibration evidence');

assert.ok(
  HARDWARE_TELEMETRY_TRUTH_RULES.some((rule) => /Connection presence is not live telemetry/i.test(rule)),
  'truth rules must state that connection presence is not live telemetry',
);
assert.ok(
  HARDWARE_TELEMETRY_TRUTH_RULES.some((rule) => /mock|demo/i.test(rule)),
  'truth rules must explicitly demote mock/demo telemetry',
);
assert.ok(
  DASHBOARD_POWER_TELEMETRY_AUDIT.some((row) => row.surface === 'dashboard_power_widget' && /normalized ECS power telemetry/i.test(row.currentPath)),
  'dashboard audit must document normalized power widget consumption',
);
assert.ok(
  ACTIVE_TRIP_PACKET_TELEMETRY_AUDIT.some((row) => row.surface === 'offline_incident_packet' && /stored snapshot/i.test(row.currentPath)),
  'offline packet audit must document stored snapshot telemetry behavior',
);

for (const fixture of HARDWARE_TELEMETRY_QA_FIXTURES) {
  assert.equal(fixture.productionLive, false, `${fixture.id} must not be production live`);
  assert.equal(fixture.mutatesProductState, false, `${fixture.id} must not mutate product state`);
  assert.equal(fixture.publishesLocation, false, `${fixture.id} must not publish location`);
  assert.equal(fixture.unlocksBadges, false, `${fixture.id} must not unlock badges`);
}

const fixtureSource = read('src/telemetry/hardwareTelemetryQualification.ts');
const screenSource = read('components/qa/HardwareTelemetryQualificationQaScreen.tsx');
const routeSource = read('app/dev/hardware-telemetry-qa.tsx');
const docSource = read('docs/qa/hardware-telemetry-field-qualification.md');

assert.ok(routeSource.includes('isHardwareTelemetryQaHarnessEnabled'), 'dev route must use the production guard');
assert.ok(routeSource.includes('<Redirect href="/" />'), 'production route must redirect away from the fixture');
assert.ok(screenSource.includes('DEV ONLY - HARDWARE TELEMETRY QA'), 'fixture screen must be visibly non-production');
assert.ok(screenSource.includes('No providers are called'), 'fixture screen must state provider isolation');
assert.ok(screenSource.includes('Badge state') && screenSource.includes('Untouched'), 'fixture screen must state badge isolation');

for (const forbidden of [
  'AsyncStorage',
  'activeTripModeStore',
  'offlineIncident',
  'expeditionBadgeStore',
  'recordBadgeIdentitySafeSignal',
  'convoyStore',
  'vehicleStore',
  'powerDeviceStore',
  'supabase',
  'fetch(',
  'RIDB_API_KEY',
  'ECS_SERVICE_ROLE_KEY',
]) {
  assert.equal(fixtureSource.includes(forbidden), false, `fixture contract must not import/call ${forbidden}`);
  assert.equal(screenSource.includes(forbidden), false, `fixture screen must not import/call ${forbidden}`);
}

for (const docNeedle of [
  'VeePeak OBD2',
  'EcoFlow BLE',
  'EcoFlow Cloud/API',
  'Mopeka / Bluestack utility sensor',
  'connection presence is not live telemetry',
  '.qa/hardware-telemetry-field-qualification/',
  'Do not store raw QA evidence in git',
]) {
  assert.ok(docSource.includes(docNeedle), `field qualification doc must include ${docNeedle}`);
}

console.log('Hardware telemetry field qualification checks passed.');
