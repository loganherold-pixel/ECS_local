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

const {
  evaluateGarminInreachExpeditionRules,
} = loadTypeScriptModule('lib/garmin/garminInreachExpeditionIntelligence.ts');

const NOW = '2026-04-28T22:00:00Z';

function baseInput(overrides = {}) {
  return {
    expeditionId: 'expedition-1',
    deviceLabel: 'Lead inReach',
    memberLabel: 'Lead Vehicle',
    now: NOW,
    ...overrides,
  };
}

let result = evaluateGarminInreachExpeditionRules(baseInput({
  lastLocation: {
    latitude: 38.7807,
    longitude: -121.2076,
    timestamp: '2026-04-28T21:20:00Z',
  },
  expectedLocationIntervalMs: 20 * 60 * 1000,
  locationGraceMs: 10 * 60 * 1000,
}));
let stale = result.annotations.find((annotation) => annotation.ruleId === 'stale_location');
assert.ok(stale, 'Stale location rule should emit an annotation.');
assert.strictEqual(stale.level, 'watch');
assert.strictEqual(stale.expeditionEvent.event_type, 'COMMS');
assert.strictEqual(stale.automaticGarminCommandAllowed, false);
assert.strictEqual(result.mapAlerts.some((alert) => alert.ruleId === 'stale_location'), true);
assert.strictEqual(result.debriefEntries.some((entry) => entry.title === 'Garmin location stale'), true);

result = evaluateGarminInreachExpeditionRules(baseInput({
  checkIn: {
    dueAt: '2026-04-28T21:30:00Z',
    lastCheckInAt: '2026-04-28T20:45:00Z',
  },
  lastLocation: {
    latitude: 38.78,
    longitude: -121.2,
    timestamp: '2026-04-28T21:50:00Z',
  },
}));
const missed = result.annotations.find((annotation) => annotation.ruleId === 'missed_check_in');
assert.ok(missed, 'Missed check-in rule should emit an annotation.');
assert.strictEqual(missed.level, 'warning');
assert.ok(missed.recommendedOperatorAction.includes('approved ECS workflow'));

result = evaluateGarminInreachExpeditionRules(baseInput({
  lastLocation: {
    latitude: 38.79,
    longitude: -121.2076,
    timestamp: '2026-04-28T21:55:00Z',
  },
  routeDeviation: {
    thresholdMeters: 250,
    plannedRoute: [
      { latitude: 38.7800, longitude: -121.2076 },
      { latitude: 38.7810, longitude: -121.2076 },
      { latitude: 38.7820, longitude: -121.2076 },
    ],
  },
}));
const deviation = result.annotations.find((annotation) => annotation.ruleId === 'route_deviation');
assert.ok(deviation, 'Route deviation rule should emit an annotation.');
assert.strictEqual(deviation.expeditionEvent.event_type, 'NAV');
assert.ok(deviation.evidence.some((item) => item.includes('Route distance')));
assert.ok(result.mapAlerts.find((alert) => alert.ruleId === 'route_deviation').coordinate);

result = evaluateGarminInreachExpeditionRules(baseInput({
  sosSignals: [{
    status: 'declared',
    occurredAt: '2026-04-28T21:58:00Z',
    coordinate: { latitude: 38.8, longitude: -121.21 },
  }],
}));
const sos = result.annotations.find((annotation) => annotation.ruleId === 'sos_declared');
assert.ok(sos, 'SOS rule should emit an annotation.');
assert.strictEqual(sos.level, 'critical');
assert.strictEqual(sos.humanReviewRequired, true);
assert.strictEqual(sos.expeditionEvent.severity, 'CRITICAL');
assert.ok(sos.recommendedOperatorAction.includes('Open Incident & Recovery'));

result = evaluateGarminInreachExpeditionRules(baseInput({
  sosSignals: [{
    status: 'cancel_requested',
    occurredAt: '2026-04-28T21:59:00Z',
  }],
}));
const sosCancel = result.annotations.find((annotation) => annotation.ruleId === 'sos_cancel_review');
assert.ok(sosCancel, 'SOS cancel should emit a review annotation.');
assert.strictEqual(sosCancel.humanReviewRequired, true);
assert.ok(sosCancel.summary.includes('will not close an incident automatically'));

result = evaluateGarminInreachExpeditionRules(baseInput({
  command: {
    type: 'request_location',
    status: 'requested',
    requestedAt: '2026-04-28T21:20:00Z',
    expectedResponseWindowMs: 20 * 60 * 1000,
  },
}));
const silent = result.annotations.find((annotation) => annotation.ruleId === 'device_silent_after_command');
assert.ok(silent, 'Device silent after command should emit an annotation.');
assert.ok(silent.recommendedOperatorAction.includes('pending or unknown'));

result = evaluateGarminInreachExpeditionRules(baseInput({
  lowBattery: true,
  tracking: {
    expectedEnabled: true,
    enabled: false,
    changedAt: '2026-04-28T21:10:00Z',
  },
  movementExpected: true,
  stationarySince: '2026-04-28T21:00:00Z',
  lastLocation: {
    latitude: 38.7807,
    longitude: -121.2076,
    timestamp: '2026-04-28T21:55:00Z',
  },
}));
assert.ok(result.annotations.find((annotation) => annotation.ruleId === 'low_battery'));
assert.ok(result.annotations.find((annotation) => annotation.ruleId === 'tracking_disabled_unexpectedly'));
assert.ok(result.annotations.find((annotation) => annotation.ruleId === 'no_movement'));

result = evaluateGarminInreachExpeditionRules(baseInput({
  missionState: 'camped',
  previousLocation: {
    latitude: 38.7807,
    longitude: -121.2076,
    timestamp: '2026-04-28T21:20:00Z',
  },
  lastLocation: {
    latitude: 38.7850,
    longitude: -121.2076,
    timestamp: '2026-04-28T21:50:00Z',
  },
}));
assert.ok(result.annotations.find((annotation) => annotation.ruleId === 'unexpected_movement'));

for (const annotation of result.annotations) {
  assert.strictEqual(annotation.automaticGarminCommandAllowed, false);
}

const allRules = evaluateGarminInreachExpeditionRules(baseInput({
  lastLocation: {
    latitude: 38.79,
    longitude: -121.2076,
    timestamp: '2026-04-28T21:00:00Z',
  },
  expectedLocationIntervalMs: 20 * 60 * 1000,
  locationGraceMs: 10 * 60 * 1000,
  checkIn: { dueAt: '2026-04-28T21:30:00Z' },
  lowBattery: true,
  routeDeviation: {
    thresholdMeters: 250,
    plannedRoute: [{ latitude: 38.7800, longitude: -121.2076 }, { latitude: 38.7810, longitude: -121.2076 }],
  },
  command: { type: 'send_message', status: 'queued', requestedAt: '2026-04-28T21:00:00Z' },
  tracking: { expectedEnabled: true, enabled: false },
  sosSignals: [{ status: 'declared', occurredAt: '2026-04-28T21:58:00Z' }],
}));
assert.ok(allRules.aiRecommendations.length >= 5);
assert.ok(
  allRules.aiRecommendations.every((recommendation) =>
    recommendation.executesGarminCommand === false &&
    recommendation.requiresOperatorConfirmationForGarminCommand === true
  ),
  'AI recommendations must not execute Garmin commands automatically.',
);
assert.ok(
  allRules.debriefEntries.every((entry) =>
    JSON.stringify(entry.attachments).includes('automaticGarminCommandAllowed')
  ),
  'Debrief/timeline entries should preserve no-automation metadata.',
);

const promptRegistry = fs.readFileSync(path.join(process.cwd(), 'lib/ai/expeditionPromptRegistry.ts'), 'utf8');
assert.ok(promptRegistry.includes('Garmin/inReach context'), 'Agent prompts should include Garmin-aware evidence rules.');
assert.ok(promptRegistry.includes('Never send, queue, draft for automatic sending'), 'Agent prompts should forbid automated Garmin commands.');

console.log('Garmin/inReach expedition intelligence tests passed.');
