const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

global.__DEV__ = false;

const root = path.resolve(__dirname, '..');
const briefEntries = [];
const logs = [];
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './ecsLogger' || request.endsWith('/ecsLogger')) {
    return {
      ecsLog: {
        debug(scope, message, payload) {
          logs.push({ level: 'debug', scope, message, payload });
        },
        warn(scope, message, payload) {
          logs.push({ level: 'warn', scope, message, payload });
        },
      },
    };
  }
  if (request === './briefCadLogStore' || request.endsWith('/briefCadLogStore')) {
    return {
      briefCadLogStore: {
        recordUpdate(message) {
          briefEntries.push(message);
        },
        clear() {
          briefEntries.length = 0;
        },
      },
    };
  }
  if (request === './telemetrySourceState' || request.endsWith('/telemetrySourceState')) {
    return loadTypeScriptModule('lib/telemetrySourceState.ts');
  }
  return originalLoad.call(this, request, parent, isMain);
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(root, relativePath);
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

const {
  POWER_LIVE_MAX_AGE_MS,
  POWER_STALE_MAX_AGE_MS,
  getPowerTruthLabel,
  normalizePowerTelemetryTruth,
} = loadTypeScriptModule('src/power/types/PowerTelemetry.ts');

const {
  SCANNER_SCAN_WINDOW_DEBOUNCE_MS,
  clearScannerDeviceDismissalsForTests,
  dismissScannerDeviceForCooldown,
  upsertScannerDeviceList,
} = loadTypeScriptModule('lib/scannerDeviceListState.ts');

const {
  POWER_BRIEF_SUPPRESSION_MS,
  buildPowerBriefAdvisories,
  publishPowerBriefAdvisories,
  resetPowerBriefPublisherForTests,
} = loadTypeScriptModule('lib/powerBriefPublisher.ts');

const {
  TELEMETRY_LIVE_MAX_AGE_MS,
  TELEMETRY_RECENT_MAX_AGE_MS,
  resolveTelemetrySourceState,
} = loadTypeScriptModule('lib/telemetrySourceState.ts');

const now = 1_700_000_000_000;

const manualTruth = normalizePowerTelemetryTruth({
  source: 'unavailable',
  timestamp: now,
  device: { id: 'manual', vendor: 'manual' },
  truth: {
    sourceTruth: 'manual',
    providerId: 'manual',
    deviceId: 'manual',
    confidence: 0.55,
    isLive: false,
    isStale: false,
    isManual: true,
    isSimulated: false,
    reason: 'User entered estimate.',
  },
}, now);
assert.strictEqual(manualTruth.isLive, false, 'manual telemetry must never be live');
assert.strictEqual(getPowerTruthLabel(manualTruth), 'Manual estimate');

const cachedTruth = normalizePowerTelemetryTruth({
  source: 'cloud',
  timestamp: now - POWER_LIVE_MAX_AGE_MS - 1,
  device: { id: 'delta2', vendor: 'ecoflow' },
}, now);
assert.strictEqual(cachedTruth.sourceTruth, 'cached', 'provider readings older than live window should become cached');
assert.strictEqual(cachedTruth.isLive, false, 'cached telemetry must not be live');
assert.strictEqual(getPowerTruthLabel(cachedTruth), 'Last known');

const staleTruth = normalizePowerTelemetryTruth({
  source: 'ble',
  timestamp: now - POWER_STALE_MAX_AGE_MS - 1,
  device: { id: 'delta2', vendor: 'ecoflow' },
}, now);
assert.strictEqual(staleTruth.isStale, true, 'cached readings older than stale threshold must be stale');
assert.strictEqual(getPowerTruthLabel(staleTruth), 'Stale — reconnect');

const simulatedTruth = normalizePowerTelemetryTruth({
  source: 'mock_dev',
  timestamp: now,
  device: { id: 'mock', vendor: 'ecs' },
}, now);
assert.strictEqual(simulatedTruth.isLive, false, 'simulated telemetry must not be live in production');
assert.strictEqual(simulatedTruth.isSimulated, true, 'mock_dev readings must be flagged simulated');
assert.strictEqual(getPowerTruthLabel(simulatedTruth), 'Not connected', 'production should hide simulated telemetry');
process.env.EXPO_PUBLIC_ECS_POWER_DEMO_MODE = '1';
assert.strictEqual(getPowerTruthLabel(simulatedTruth), 'Demo data');
delete process.env.EXPO_PUBLIC_ECS_POWER_DEMO_MODE;

const liveBleTruth = normalizePowerTelemetryTruth({
  source: 'ble',
  timestamp: now,
  device: { id: 'ble-device', vendor: 'generic' },
}, now);
assert.strictEqual(getPowerTruthLabel(liveBleTruth), 'Live BLE');

const freshObdSourceState = resolveTelemetrySourceState({
  sourceType: 'obd_live',
  freshness: 'live',
  updatedAt: now,
  now,
  isStreaming: true,
});
assert.strictEqual(freshObdSourceState.label, 'OBD Live');
assert.strictEqual(freshObdSourceState.isHighConfidenceLive, true);
assert.strictEqual(
  resolveTelemetrySourceState({
    sourceType: 'obd_live',
    freshness: 'live',
    updatedAt: now - TELEMETRY_LIVE_MAX_AGE_MS - 1,
    now,
    isStreaming: false,
  }).label,
  'Recent',
  'telemetry outside the live window should not stay labeled live',
);
assert.strictEqual(
  resolveTelemetrySourceState({
    sourceType: 'cached',
    freshness: 'recent',
    updatedAt: now - TELEMETRY_RECENT_MAX_AGE_MS - 1,
    now,
  }).label,
  'Stale',
  'old cached telemetry should resolve to stale',
);
assert.strictEqual(resolveTelemetrySourceState({ sourceType: 'manual' }).label, 'Manual');
assert.strictEqual(resolveTelemetrySourceState({ sourceType: 'simulated' }).label, 'Simulation');
assert.strictEqual(resolveTelemetrySourceState({ sourceType: 'unavailable' }).label, 'Unavailable');

const scannerResult = upsertScannerDeviceList([], [
  { id: 'weak', source: 'ble', displayName: 'Weak Power Thing', brand: 'EcoFlow', rssi: -95 },
  { source: 'ble', displayName: 'Unknown device', rssi: -50 },
  { id: 'keyboard', source: 'ble', displayName: 'Travel Keyboard', brand: 'KeyboardCo', rssi: -42 },
  { id: 'delta2', source: 'ble', displayName: 'EcoFlow DELTA 2', brand: 'EcoFlow', rssi: -45 },
  { id: 'delta2', source: 'ble', displayName: 'EcoFlow DELTA 2', brand: 'EcoFlow', rssi: -43 },
], {
  reason: 'power_live_readiness',
  now,
  requireBrandAllowlistMatch: true,
});
assert.strictEqual(scannerResult.devices.length, 1, 'scanner should keep one likely power device after filtering');
assert.strictEqual(scannerResult.deduped, 1, 'scanner should dedupe repeated device sightings');
assert.ok(scannerResult.dropReasons.includes('weak_rssi'), 'scanner should drop weak RSSI by default');
assert.ok(scannerResult.dropReasons.includes('unknown_ble_hidden'), 'scanner should hide unknown BLE advertisements by default');
assert.ok(scannerResult.dropReasons.includes('brand_allowlist_miss'), 'scanner should hide non-power BLE devices by default');
assert.strictEqual(logs.length, 0, 'scanner should not emit routine logs without debug enabled');

const advancedScannerResult = upsertScannerDeviceList([], [
  { source: 'ble', displayName: 'Unknown BLE device', rssi: -50 },
], {
  reason: 'advanced_scan',
  now,
  advancedScan: true,
});
assert.strictEqual(advancedScannerResult.devices.length, 1, 'advanced scan should show unknown BLE advertisements');

clearScannerDeviceDismissalsForTests();
dismissScannerDeviceForCooldown({ id: 'delta2', source: 'ble', displayName: 'EcoFlow DELTA 2', brand: 'EcoFlow', rssi: -45 }, { now });
const dismissedScannerResult = upsertScannerDeviceList([], [
  { id: 'delta2', source: 'ble', displayName: 'EcoFlow DELTA 2', brand: 'EcoFlow', rssi: -45 },
], {
  reason: 'dismissed_cooldown',
  now: now + 1_000,
  requireBrandAllowlistMatch: true,
});
assert.strictEqual(dismissedScannerResult.devices.length, 0, 'dismissed devices should stay hidden during cooldown');
assert.ok(dismissedScannerResult.dropReasons.includes('dismissed_cooldown'), 'dismissed cooldown should be reported');

const advisoryInput = {
  batteryPercent: 9,
  outputWatts: 1600,
  estimatedRuntimeMinutes: 45,
  deviceId: 'delta2',
  deviceName: 'EcoFlow DELTA 2',
  providerId: 'ecoflow',
  truth: normalizePowerTelemetryTruth({
    source: 'cloud',
    timestamp: now,
    device: { id: 'delta2', vendor: 'ecoflow', model: 'DELTA 2' },
  }, now),
};
const advisories = buildPowerBriefAdvisories(advisoryInput);
assert.ok(advisories.some((entry) => entry.kind === 'low_battery'), 'brief should include low battery advisory');
assert.ok(advisories.some((entry) => entry.kind === 'low_runtime'), 'brief should include low runtime advisory');
assert.ok(advisories.some((entry) => entry.kind === 'high_draw'), 'brief should include high draw advisory');
assert.ok(advisories.every((entry) => entry.message.startsWith('POWER ADVISORY:') === false), 'brief message body should not duplicate the title prefix');
assert.ok(advisories.every((entry) => entry.sourceLine.includes('Source: EcoFlow DELTA 2')), 'power advisories should include source line metadata');

const manualBriefTruth = {
  sourceTruth: 'manual',
  providerId: 'generic',
  deviceId: 'manual-power',
  deviceName: 'Manual estimate',
  lastUpdatedAt: now,
  freshnessMs: 0,
  confidence: 0.55,
  isLive: false,
  isStale: false,
  isManual: true,
  isSimulated: false,
};

const manualHealthyAdvisories = buildPowerBriefAdvisories({
  batteryPercent: 82,
  outputWatts: 62,
  estimatedRuntimeMinutes: 580,
  deviceId: 'manual-power',
  deviceName: 'Manual estimate',
  truth: manualBriefTruth,
});
assert.strictEqual(manualHealthyAdvisories.length, 0, 'healthy manual estimates should not emit generic brief noise');

const manualLowReserveAdvisories = buildPowerBriefAdvisories({
  batteryPercent: 12,
  outputWatts: 62,
  estimatedRuntimeMinutes: 90,
  deviceId: 'manual-power',
  deviceName: 'Manual estimate',
  truth: manualBriefTruth,
});
assert.ok(manualLowReserveAdvisories.some((entry) => entry.kind === 'manual_low_reserve'), 'manual low reserve should emit a specific manual reserve advisory');
assert.ok(manualLowReserveAdvisories.some((entry) => /Manual estimate suggests/.test(entry.message)), 'manual advisory copy should be honest and actionable');
assert.ok(manualLowReserveAdvisories.every((entry) => /· Manual ·/.test(entry.sourceLine)), 'manual advisories must carry manual source state');

resetPowerBriefPublisherForTests();
briefEntries.length = 0;
const firstPublish = publishPowerBriefAdvisories(advisoryInput, { now });
const secondPublish = publishPowerBriefAdvisories(advisoryInput, { now: now + 60_000 });
assert.ok(firstPublish.length > 0, 'first power advisory publish should emit');
assert.strictEqual(secondPublish.length, 0, 'duplicate power advisories should be suppressed within 15 minutes');
assert.strictEqual(briefEntries.length, firstPublish.length, 'suppressed advisories should not enter ECS Brief');
assert.strictEqual(POWER_BRIEF_SUPPRESSION_MS, 15 * 60_000, 'power brief suppression window should be 15 minutes');
assert.ok(briefEntries.some((entry) => /Source: EcoFlow DELTA 2/.test(entry.text)), 'published power brief entries should include source freshness');

resetPowerBriefPublisherForTests();
briefEntries.length = 0;
publishPowerBriefAdvisories({
  batteryPercent: 82,
  outputWatts: 62,
  solarWatts: 0,
  estimatedRuntimeMinutes: 580,
  deviceId: 'delta2-transition',
  deviceName: 'EcoFlow DELTA 2',
  providerId: 'ecoflow',
  activeRouteOrCamp: true,
  truth: normalizePowerTelemetryTruth({
    source: 'cloud',
    timestamp: now,
    device: { id: 'delta2-transition', vendor: 'ecoflow', model: 'DELTA 2' },
  }, now),
}, { now });
const disconnectTransition = publishPowerBriefAdvisories({
  deviceId: 'delta2-transition',
  deviceName: 'EcoFlow DELTA 2',
  providerId: 'ecoflow',
  activeRouteOrCamp: true,
  truth: normalizePowerTelemetryTruth({
    source: 'cloud',
    timestamp: now - POWER_STALE_MAX_AGE_MS - 1,
    device: { id: 'delta2-transition', vendor: 'ecoflow', model: 'DELTA 2' },
  }, now),
}, { now: now + 1_000 });
assert.ok(disconnectTransition.some((entry) => entry.kind === 'device_disconnected'), 'active route/camp disconnect should emit a transition advisory');

const reconnectTransition = publishPowerBriefAdvisories({
  batteryPercent: 82,
  outputWatts: 62,
  solarWatts: 0,
  estimatedRuntimeMinutes: 580,
  deviceId: 'delta2-transition',
  deviceName: 'EcoFlow DELTA 2',
  providerId: 'ecoflow',
  truth: normalizePowerTelemetryTruth({
    source: 'cloud',
    timestamp: now + 2_000,
    device: { id: 'delta2-transition', vendor: 'ecoflow', model: 'DELTA 2' },
  }, now + 2_000),
}, { now: now + 2_000 });
assert.ok(reconnectTransition.some((entry) => entry.kind === 'device_reconnected'), 'device reconnect should emit a source restoration advisory');

const solarTransition = publishPowerBriefAdvisories({
  batteryPercent: 84,
  outputWatts: 62,
  solarWatts: 140,
  estimatedRuntimeMinutes: 620,
  deviceId: 'delta2-transition',
  deviceName: 'EcoFlow DELTA 2',
  providerId: 'ecoflow',
  truth: normalizePowerTelemetryTruth({
    source: 'cloud',
    timestamp: now + 3_000,
    device: { id: 'delta2-transition', vendor: 'ecoflow', model: 'DELTA 2' },
  }, now + 3_000),
}, { now: now + 3_000 });
assert.ok(solarTransition.some((entry) => entry.kind === 'solar_restored'), 'solar input restoration should emit once when solar appears');

const unknownBleAdvisories = buildPowerBriefAdvisories({
  deviceId: 'unknown-ble',
  deviceName: 'Unknown BLE device',
  providerId: 'generic',
  truth: {
    sourceTruth: 'device_detected',
    providerId: 'generic',
    deviceId: 'unknown-ble',
    deviceName: 'Unknown BLE device',
    confidence: 0.2,
    isLive: false,
    isStale: false,
    isManual: false,
    isSimulated: false,
  },
});
assert.strictEqual(unknownBleAdvisories.length, 0, 'unknown/device-detected BLE noise must not enter ECS Brief');

const widgetSource = read('components/dashboard/PowerSystemWidget.tsx');
const riveAdapterSource = read('lib/powerModuleRiveTelemetry.ts');
const detailSource = read('components/dashboard/PowerSystemDetail.tsx');
const centralTelemetryTypesSource = read('src/types/telemetry.ts');
const telemetrySourceStateSource = read('lib/telemetrySourceState.ts');
const powerTruthServiceSource = read('src/features/power/services/powerTruthService.ts');
const setupSource = read('lib/powerSetupStore.ts');
const routingSource = read('lib/bluetoothDeviceRouting.ts');
const adaptersSource = read('lib/powerBrandConnectionAdapters.ts');
const hookSource = read('lib/useUnifiedDeviceConnections.ts');
const scannerScreenSource = read('app/power/blu.tsx');

assert.ok(widgetSource.includes('inputWatts: number | null;'), 'widget summary should allow unknown input watts');
assert.ok(centralTelemetryTypesSource.includes('export type PowerTelemetrySnapshot'), 'power must have a separate normalized snapshot contract');
assert.ok(centralTelemetryTypesSource.includes('batteryPercent: number | null;'), 'power snapshot should keep battery percentage in the power contract');
assert.ok(centralTelemetryTypesSource.includes('outputWatts: number | null;'), 'power snapshot should keep watts in the power contract');
assert.ok(centralTelemetryTypesSource.includes('export type VehicleTelemetrySnapshot'), 'vehicle must keep a separate normalized snapshot contract');
assert.ok(centralTelemetryTypesSource.includes('rpm: number | null;'), 'vehicle snapshot should keep OBD fields in the vehicle contract');
assert.ok(powerTruthServiceSource.includes('normalizePowerTelemetrySnapshot'), 'power truth service should expose a power snapshot adapter');
assert.ok(widgetSource.includes('snapshot: PowerTelemetrySnapshot;'), 'power widget summary should carry the normalized power snapshot');
assert.ok(widgetSource.includes('sourceState: TelemetrySourceState;'), 'power widget summary should carry shared telemetry source state');
assert.ok(widgetSource.includes('resolveTelemetrySourceState'), 'power widget should use shared telemetry source-state labels');
assert.ok(telemetrySourceStateSource.includes('TELEMETRY_LIVE_MAX_AGE_MS'), 'shared source-state helper should define live freshness threshold');
assert.ok(
  riveAdapterSource.includes('export function adaptPowerTelemetryForRive') &&
    widgetSource.includes('inputWatts={riveTelemetry.inputWatts}') &&
    widgetSource.includes('outputWatts={riveTelemetry.outputWatts}'),
  'widget should render unknown/stale watts as dashes',
);
assert.ok(widgetSource.includes("summary.batteryPercent == null ? 'battery unavailable'"), 'widget should render unknown battery percent as unavailable instead of zero');
assert.ok(
  widgetSource.includes('const canAnimateFlow = hasLiveTelemetry || hasConfidentManualEstimate;') &&
    widgetSource.includes('canAnimateFlow,'),
  'widget should animate flow only for live or confident manual telemetry',
);
assert.ok(widgetSource.includes('simulationBlocked'), 'widget should block simulated telemetry outside dev/demo mode');
assert.ok(!/fallback/i.test(widgetSource), 'power widget must not show fallback copy');
assert.ok(!/fallback/i.test(detailSource), 'power detail must not show fallback copy');
assert.ok(detailSource.includes('MANUAL PROFILE'), 'detail modal should label manual profile honestly');
assert.ok(detailSource.includes('PROVIDER PATHS'), 'detail modal should avoid overclaiming every brand as supported');
assert.ok(setupSource.includes("supportLabel: 'Provider support pending'"), 'unsupported providers should be setup/support pending');
assert.ok(routingSource.includes("support.supportLevel === 'verified' ? 'power/live' : 'power/partial'"), 'only verified providers should route as live');
assert.ok(adaptersSource.includes('getCapabilities()'), 'provider adapters should expose capabilities');
assert.ok(adaptersSource.includes('supportsLiveTelemetry: false'), 'unvalidated adapters should not claim live telemetry');
assert.ok(hookSource.includes('SCANNER_SCAN_WINDOW_DEBOUNCE_MS'), 'scanner hook should debounce scan windows');
assert.ok(hookSource.includes('DEBUG_DEVICE_CONNECTIONS'), 'scanner source-search logging should be behind explicit debug gating');
assert.ok(hookSource.includes("reason: 'debounced_scan_window'"), 'scanner should suppress repeated scan button presses');
assert.ok(hookSource.includes('requireBrandAllowlistMatch: true'), 'power scanner should require brand allowlist matches by default');
assert.ok(scannerScreenSource.includes('Found nearby power and OBD2 devices'), 'user-facing scanner should label nearby power and OBD2 findings clearly');
assert.ok(scannerScreenSource.includes('Real nearby power and OBD2 advertisements only'), 'scanner copy should explain real nearby advertisement filtering');
assert.strictEqual(typeof SCANNER_SCAN_WINDOW_DEBOUNCE_MS, 'number', 'scanner debounce constant should be exported');

console.log('Power live-readiness checks passed.');
