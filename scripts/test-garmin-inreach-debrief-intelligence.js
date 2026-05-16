const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
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
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const { resolveGarminInreachConfig } = loadTypeScriptModule('lib/garmin/garminInreachConfig.ts');
const { parseGarminIpcOutboundPayload } = loadTypeScriptModule('lib/garmin/garminInreachOutboundWebhook.ts');
const { normalizeGarminInreachDomainEvent } = loadTypeScriptModule('lib/garmin/garminInreachEventNormalizer.ts');
const { createGarminInreachCommandDraft, confirmGarminInreachCommandDraft } = loadTypeScriptModule('lib/garmin/garminInreachAdapter.ts');
const { buildGarminInreachDebriefSection } = loadTypeScriptModule('lib/garmin/garminInreachDebriefIntelligence.ts');

function enabledConfig(mode = 'ipc_readonly') {
  return resolveGarminInreachConfig({
    flags: {
      garminInreachEnabled: true,
      garminInreachInboundEventsEnabled: mode === 'ipc_readonly' || mode === 'ipc_command',
      garminInreachOutboundCommandsEnabled: mode === 'ipc_command',
      garminInreachSosSignalsEnabled: mode === 'ipc_readonly' || mode === 'ipc_command',
    },
    mode,
  });
}

function normalizedDomainEvent(rawEvent, version = '4.0') {
  const parsed = parseGarminIpcOutboundPayload({
    Version: version,
    Events: [rawEvent],
  }, new Date('2026-04-28T18:00:00Z'));
  assert.strictEqual(parsed.ok, true);
  return normalizeGarminInreachDomainEvent(parsed.events[0]).primaryEvent;
}

const fullImei = '300434123456789';
const events = [
  normalizedDomainEvent({
    ID: 'position-1',
    IMEI: fullImei,
    MessageCode: 0,
    Latitude: 38.7807,
    Longitude: -121.2076,
    Timestamp: '2026-04-28T15:00:00Z',
    Accuracy: 20,
  }, '2.0'),
  normalizedDomainEvent({
    ID: 'checkin-1',
    IMEI: fullImei,
    MessageCode: 14,
    Text: 'Check-in OK',
    Timestamp: '2026-04-28T15:10:00Z',
  }),
  normalizedDomainEvent({
    ID: 'position-2',
    IMEI: fullImei,
    MessageCode: 0,
    Latitude: 38.79,
    Longitude: -121.22,
    Timestamp: '2026-04-28T16:20:00Z',
    Accuracy: 20,
  }),
  normalizedDomainEvent({
    ID: 'battery-1',
    IMEI: fullImei,
    MessageCode: 21,
    BatteryPercent: 14,
    Timestamp: '2026-04-28T16:25:00Z',
  }),
  normalizedDomainEvent({
    ID: 'locate-response-1',
    IMEI: fullImei,
    MessageCode: 2,
    Latitude: 38.782,
    Longitude: -121.209,
    Timestamp: '2026-04-28T16:30:00Z',
  }),
  normalizedDomainEvent({
    ID: 'sos-1',
    IMEI: fullImei,
    MessageCode: 4,
    Latitude: 38.783,
    Longitude: -121.21,
    Timestamp: '2026-04-28T16:35:00Z',
  }),
  normalizedDomainEvent({
    ID: 'unknown-1',
    IMEI: fullImei,
    MessageCode: 999,
    Timestamp: '2026-04-28T16:40:00Z',
  }),
];

const draft = createGarminInreachCommandDraft({
  id: 'locate-command-1',
  type: 'request_location',
  expeditionId: 'expedition-1',
  deviceIdentifier: fullImei,
  reason: 'Post-trip locate audit.',
  createdAt: '2026-04-28T16:00:00Z',
});
const queued = confirmGarminInreachCommandDraft(draft, {
  confirmed: true,
  operatorUserId: 'operator-1',
  confirmedAt: '2026-04-28T16:01:00Z',
});

let section = buildGarminInreachDebriefSection({
  config: enabledConfig('ipc_command'),
  events,
  commandRequests: [queued],
  plannedRoute: [
    { latitude: 38.7807, longitude: -121.2076, label: 'Start' },
    { latitude: 38.781, longitude: -121.208, label: 'Checkpoint' },
  ],
  checkInSchedule: [{
    id: 'checkin-a',
    label: 'Morning check-in',
    dueAt: '2026-04-28T15:10:00Z',
    toleranceMinutes: 10,
  }],
  duplicateRetryCount: 2,
  staleKml: true,
  publicOrSharedView: true,
}, new Date('2026-04-28T18:30:00Z'));

assert.ok(section, 'Enabled Garmin data should produce a debrief section.');
assert.strictEqual(section.source, 'garmin_inreach');
assert.strictEqual(section.sourceMode, 'ipc_command');
assert.strictEqual(section.trackReplay.length, 2, 'Track replay should include Garmin position events.');
assert.strictEqual(section.messageTimeline.length, 1, 'Message timeline should include Garmin check-ins/messages.');
assert.strictEqual(section.messageTimeline[0].type, 'check_in');
assert.strictEqual(section.checkInCompliance[0].status, 'met', 'Check-in should match the scheduled window.');
assert.strictEqual(section.staleGaps.length, 1, 'Long gaps between position reports should be called out.');
assert.ok(section.commandTimeline.length >= 2, 'Command timeline should include request and locate response.');
assert.strictEqual(section.batteryRiskEvents.length, 1, 'Low battery events should be summarized.');
assert.strictEqual(section.incidentChronology.length, 1, 'SOS/incident signal chronology should be summarized.');
assert.strictEqual(section.plannedRouteComparison.status, 'deviation', 'Far locate point should affect route comparison.');
assert.strictEqual(section.dataQuality.duplicateRetries, 2);
assert.strictEqual(section.dataQuality.staleKml, true);
assert.ok(section.dataQuality.unknownMessageCodes.includes(999), 'Unknown Garmin message codes should be retained as data quality notes.');
assert.strictEqual(section.privacy.identifiersMasked, true);
assert.strictEqual(section.privacy.fullImeiExposed, false);
assert.strictEqual(section.privacy.telemetryTreatedAsGroundTruth, false);
assert.ok(section.summary.includes('Garmin/inReach debrief'));
assert.ok(!JSON.stringify(section).includes(fullImei), 'Public/shared debrief output must not expose full IMEI.');

section = buildGarminInreachDebriefSection({
  config: resolveGarminInreachConfig(),
  events,
});
assert.strictEqual(section, null, 'Disabled Garmin config should omit the Garmin debrief section.');

section = buildGarminInreachDebriefSection({
  config: enabledConfig('mapshare'),
  events: [],
  commandRequests: [],
});
assert.strictEqual(section, null, 'Enabled Garmin config with no data should omit the Garmin debrief section.');

const source = fs.readFileSync(
  path.join(process.cwd(), 'lib/garmin/garminInreachDebriefIntelligence.ts'),
  'utf8',
);
assert.ok(source.includes('telemetryTreatedAsGroundTruth: false'), 'Debrief output must not treat Garmin telemetry as perfect ground truth.');
assert.ok(source.includes('fullImeiExposed: false'), 'Debrief output must explicitly avoid full IMEI exposure.');

console.log('Garmin/inReach debrief intelligence tests passed.');
