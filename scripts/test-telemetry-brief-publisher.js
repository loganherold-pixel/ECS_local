const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const briefEntries = [];
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './briefCadLogStore' || request.endsWith('/briefCadLogStore')) {
    return {
      briefCadLogStore: {
        recordUpdate(message) {
          briefEntries.push(message);
        },
      },
    };
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

function snapshot(overrides = {}) {
  return {
    sourceType: 'obd_live',
    sourceLabel: 'OBD Live',
    freshness: 'live',
    confidence: 'high',
    updatedAt: new Date(now).toISOString(),
    source: 'bluetooth_obd_live',
    isLive: true,
    deviceId: 'obd-primary',
    speedMph: null,
    rpm: null,
    coolantTempF: null,
    intakeTempF: null,
    engineLoadPct: null,
    throttlePct: null,
    batteryVoltage: null,
    fuelLevelPct: null,
    rangeMiles: null,
    oilTempF: null,
    transmissionTempF: null,
    pitchDeg: null,
    rollDeg: null,
    headingDeg: null,
    warnings: [],
    ...overrides,
  };
}

const now = 1_700_000_000_000;
const {
  TELEMETRY_BRIEF_SUPPRESSION_MS,
  buildTelemetryBriefAdvisories,
  publishTelemetryBriefAdvisories,
  publishAttitudeTelemetryBriefAdvisory,
  resetTelemetryBriefPublisherForTests,
} = loadTypeScriptModule('lib/telemetryBriefPublisher.ts');

const liveBatteryAdvisories = buildTelemetryBriefAdvisories({
  snapshot: snapshot({ batteryVoltage: 11.1 }),
}, { now });
assert.ok(liveBatteryAdvisories.some((entry) => entry.kind === 'low_battery_voltage'), 'low live battery voltage should emit');
assert.ok(liveBatteryAdvisories.some((entry) => entry.severity === 'critical'), 'high-confidence live critical voltage can escalate');
assert.ok(liveBatteryAdvisories.every((entry) => /Source: OBD Live/.test(entry.sourceLine)), 'live OBD advisories should carry OBD Live source label');

const tempAdvisories = buildTelemetryBriefAdvisories({
  snapshot: snapshot({ coolantTempF: 238, transmissionTempF: 265 }),
}, { now });
assert.ok(tempAdvisories.some((entry) => entry.kind === 'high_coolant_temp'), 'high coolant temp should emit');
assert.ok(tempAdvisories.some((entry) => entry.kind === 'high_transmission_temp'), 'high transmission temp should emit');

const manualAdvisories = buildTelemetryBriefAdvisories({
  snapshot: snapshot({
    sourceType: 'manual',
    sourceLabel: 'Manual Profile',
    freshness: 'unknown',
    confidence: 'medium',
    source: 'manual',
    isLive: false,
    batteryVoltage: 11.1,
    coolantTempF: 255,
  }),
}, { now });
assert.ok(manualAdvisories.length > 0, 'manual threshold crossings may emit source-aware watch advisories');
assert.ok(manualAdvisories.every((entry) => entry.severity === 'watch'), 'manual telemetry must not generate high-severity live warnings');
assert.ok(manualAdvisories.every((entry) => /Manual Profile/.test(entry.sourceLine)), 'manual advisories should carry Manual Profile source label');

const simulatedAdvisories = buildTelemetryBriefAdvisories({
  snapshot: snapshot({
    sourceType: 'simulated',
    sourceLabel: 'Simulation',
    freshness: 'live',
    confidence: 'high',
    source: 'mock_dev',
    isLive: false,
    batteryVoltage: 10.9,
    coolantTempF: 270,
  }),
}, { now });
assert.strictEqual(simulatedAdvisories.length, 0, 'simulated telemetry must not create live safety warnings');

const unverifiedAdvisories = buildTelemetryBriefAdvisories({
  snapshot: snapshot({
    confidence: 'unverified',
    batteryVoltage: 10.9,
    coolantTempF: 270,
  }),
}, { now });
assert.strictEqual(unverifiedAdvisories.length, 0, 'unverified telemetry must not create high-certainty safety advisories');

const staleNavigation = buildTelemetryBriefAdvisories({
  snapshot: snapshot({
    sourceType: 'cached',
    sourceLabel: 'Last known',
    freshness: 'stale',
    confidence: 'medium',
    source: 'cache',
    isLive: false,
    updatedAt: new Date(now - 15 * 60_000).toISOString(),
  }),
  activeNavigation: true,
}, { now });
assert.ok(staleNavigation.some((entry) => entry.kind === 'stale_active_navigation'), 'stale telemetry during active navigation should emit');
assert.ok(staleNavigation.every((entry) => /ECS-Inferred/.test(entry.sourceLine)), 'stale/inferred navigation advisory should avoid live source certainty');

resetTelemetryBriefPublisherForTests();
briefEntries.length = 0;
const firstPublish = publishTelemetryBriefAdvisories({
  snapshot: snapshot({ batteryVoltage: 11.4 }),
}, { now });
const suppressedPublish = publishTelemetryBriefAdvisories({
  snapshot: snapshot({ batteryVoltage: 11.4 }),
}, { now: now + 60_000 });
assert.ok(firstPublish.length > 0, 'first telemetry advisory publish should emit');
assert.strictEqual(suppressedPublish.length, 0, 'duplicate telemetry advisories should be suppressed within 10 minutes');
assert.strictEqual(briefEntries.length, firstPublish.length, 'suppressed telemetry advisories should not enter ECS Brief');
assert.strictEqual(TELEMETRY_BRIEF_SUPPRESSION_MS, 10 * 60_000, 'telemetry suppression window should be ten minutes');
assert.ok(briefEntries.every((entry) => entry.source === 'ecs-telemetry'), 'published telemetry entries should stay in the telemetry advisory lane');

const escalationPublish = publishTelemetryBriefAdvisories({
  snapshot: snapshot({ batteryVoltage: 11.0 }),
}, { now: now + 120_000 });
assert.ok(escalationPublish.some((entry) => entry.severity === 'critical'), 'severity escalation should bypass suppression');

resetTelemetryBriefPublisherForTests();
briefEntries.length = 0;
publishTelemetryBriefAdvisories({
  snapshot: snapshot({ deviceId: 'transition-obd', batteryVoltage: 12.6 }),
  scannerConnected: true,
}, { now });
const disconnected = publishTelemetryBriefAdvisories({
  snapshot: snapshot({
    deviceId: 'transition-obd',
    sourceType: 'unavailable',
    sourceLabel: 'Unavailable',
    freshness: 'offline',
    confidence: 'unverified',
    source: 'unavailable',
    isLive: false,
    updatedAt: null,
  }),
  scannerConnected: false,
  activeNavigation: true,
}, { now: now + 30_000 });
assert.ok(disconnected.some((entry) => entry.kind === 'telemetry_disconnected'), 'live-to-disconnected telemetry transition should emit once');
assert.ok(disconnected.every((entry) => entry.severity !== 'critical'), 'disconnect transition should not over-escalate unavailable telemetry');

resetTelemetryBriefPublisherForTests();
briefEntries.length = 0;
const attitudeUnavailable = publishAttitudeTelemetryBriefAdvisory({
  attitudeWidgetActive: true,
  attitudeSensorAvailable: false,
  sensorStatus: 'PERMISSION_DENIED',
  deviceId: 'attitude-primary',
  now,
});
const attitudeDuplicate = publishAttitudeTelemetryBriefAdvisory({
  attitudeWidgetActive: true,
  attitudeSensorAvailable: false,
  sensorStatus: 'PERMISSION_DENIED',
  deviceId: 'attitude-primary',
  now: now + 1_000,
});
assert.ok(attitudeUnavailable.some((entry) => entry.kind === 'attitude_sensor_unavailable'), 'active attitude widget should report unavailable device attitude sensor');
assert.strictEqual(attitudeDuplicate.length, 0, 'duplicate attitude sensor advisories should be suppressed');
assert.ok(briefEntries.some((entry) => entry.title === 'ATTITUDE SENSOR'), 'attitude sensor advisories should use the attitude title');

const vehicleWidgetSource = read('components/dashboard/VehicleTelemetryWidget.tsx');
const widgetRenderersSource = read('components/dashboard/WidgetRenderers.tsx');
assert.ok(vehicleWidgetSource.includes('publishTelemetryBriefAdvisories'), 'vehicle telemetry widget should publish telemetry brief advisories');
assert.ok(vehicleWidgetSource.includes('useVehicleTelemetryBriefPublisher'), 'vehicle telemetry publishing should be centralized in a local hook');
assert.ok(widgetRenderersSource.includes('publishAttitudeTelemetryBriefAdvisory'), 'attitude widget should publish sensor-unavailable telemetry advisories');
assert.ok(widgetRenderersSource.includes("sensorStatus !== 'AWAITING'"), 'attitude waiting/calibration state should not be treated as unavailable spam');

console.log('Telemetry brief publisher checks passed.');
