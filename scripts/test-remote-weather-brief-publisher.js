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

require.extensions['.ts'] = compileTypeScriptModule;

const publisherSource = fs.readFileSync(
  path.join(process.cwd(), 'lib/remote/remoteWeatherBriefPublisher.ts'),
  'utf8',
);
const cadLogSource = fs.readFileSync(
  path.join(process.cwd(), 'components/dashboard/MissionBriefCadLog.tsx'),
  'utf8',
);

const {
  REMOTE_WEATHER_BRIEF_DEDUPE_WINDOW_MS,
  publishRemoteWeatherBriefEvent,
  resetRemoteWeatherBriefPublisherForTests,
} = require(path.join(process.cwd(), 'lib/remote/remoteWeatherBriefPublisher.ts'));
const { briefCadLogStore } = require(path.join(process.cwd(), 'lib/briefCadLogStore.ts'));

assert.ok(!publisherSource.includes('fetch('), 'Remote weather publisher must not call network fetch.');
assert.ok(!publisherSource.includes('useState') && !publisherSource.includes('react'), 'Remote weather publisher must not import UI/React.');
assert.ok(
  publisherSource.includes('recordRemoteWeatherBriefEvent') &&
    publisherSource.includes('REMOTE_WEATHER_BRIEF_DEDUPE_WINDOW_MS = 10 * 60 * 1000') &&
    publisherSource.includes('severity_escalation') &&
    publisherSource.includes('meaningful_change'),
  'Publisher must bridge into ECS Brief with dedupe, escalation, and meaningful-change behavior.',
);
assert.ok(
  cadLogSource.includes('formatSeverityLabel') &&
    cadLogSource.includes('entry.title') &&
    cadLogSource.includes('entry.recommendedAction'),
  'ECS Brief CAD log must render severity, title, message, and recommended action for remote/weather events.',
);

function makeHazard(overrides = {}) {
  return {
    shouldEmit: true,
    severity: 'warning',
    type: 'remote_weather_exposure',
    title: 'Remote weather exposure',
    message: 'High remoteness combines with elevated weather risk 14 mi ahead.',
    recommendedAction: 'Cache route, verify power reserve, and identify bailout options.',
    confidence: 0.82,
    ...overrides,
  };
}

function publish(overrides = {}) {
  const { hazard, ...rest } = overrides;
  return publishRemoteWeatherBriefEvent({
    hazard: makeHazard(hazard),
    routeId: 'route-a',
    segmentId: 'segment-1',
    remotenessScore: 74,
    routeConfidence: 58,
    weatherRisk: 0.67,
    distanceAheadMi: 14,
    etaMinutes: 34,
    createdAt: 1_000_000,
    ...rest,
  });
}

resetRemoteWeatherBriefPublisherForTests();
briefCadLogStore.clear();

let result = publish();
assert.strictEqual(result.emitted, true);
assert.strictEqual(result.reason, 'emitted');
assert.ok(result.event, 'Publisher should return the ECS Brief event it emitted.');
assert.strictEqual(result.event.source, 'ecs-remote-weather');
assert.strictEqual(result.event.title, 'REMOTE WEATHER EXPOSURE');
assert.strictEqual(result.event.message.includes('Route confidence reduced to 58%.'), true);
assert.strictEqual(result.event.recommendedAction, 'Cache route, verify power reserve, and identify bailout options.');

let entries = briefCadLogStore.getEntries();
assert.strictEqual(entries.length, 1);
assert.strictEqual(entries[0].source, 'ecs-remote-weather');
assert.strictEqual(entries[0].severity, 'warning');
assert.strictEqual(entries[0].title, 'REMOTE WEATHER EXPOSURE');
assert.strictEqual(entries[0].recommendedAction, 'Cache route, verify power reserve, and identify bailout options.');
assert.ok(entries[0].message.includes('Route confidence reduced to 58%.'));

result = publish({ createdAt: 1_000_000 + 60_000 });
assert.strictEqual(result.emitted, false);
assert.strictEqual(result.reason, 'duplicate_suppressed');
assert.strictEqual(briefCadLogStore.getEntries().length, 1, 'Duplicate remote/weather events should not spam ECS Brief.');

result = publish({
  createdAt: 1_000_000 + 120_000,
  hazard: {
    severity: 'critical',
    message: 'High remoteness combines with worsening weather risk 14 mi ahead.',
  },
});
assert.strictEqual(result.emitted, true);
assert.strictEqual(result.reason, 'severity_escalation');
assert.strictEqual(result.event.severity, 'critical');
assert.strictEqual(briefCadLogStore.getEntries().length, 2, 'Severity escalation must emit immediately.');

result = publish({
  createdAt: 1_000_000 + 180_000,
  routeId: 'route-b',
  segmentId: 'segment-2',
  hazard: {
    type: 'remote_signal_loss',
    title: 'Signal loss ahead',
    message: 'Expected signal loss for 18 mi through a remote segment.',
    recommendedAction: 'Send check-in before entering segment.',
    severity: 'watch',
  },
  routeConfidence: 72,
});
assert.strictEqual(result.emitted, true);
assert.strictEqual(result.event.title, 'SIGNAL LOSS AHEAD');
assert.ok(result.event.message.includes('Route confidence reduced to 72%.'));

result = publish({
  createdAt: 1_000_000 + 240_000,
  routeId: 'route-c',
  segmentId: 'segment-3',
  hazard: {
    type: 'offline_readiness_gap',
    title: 'Offline readiness gap',
    message: 'Offline cache is not ready while remoteness is 67.',
    recommendedAction: 'Cache route, verify power reserve, and identify bailout options.',
  },
});
assert.strictEqual(result.emitted, true);
assert.strictEqual(result.event.title, 'OFFLINE READINESS GAP');

result = publish({
  createdAt: 1_000_000 + 300_000,
  routeId: 'route-d',
  segmentId: 'segment-4',
  hazard: {
    type: 'remote_fire_smoke',
    title: 'Critical remote fire risk',
    message: 'Fire risk is critical in remote terrain with limited bailout margin.',
    recommendedAction: 'Delay travel or reroute if conditions worsen.',
    severity: 'critical',
  },
});
assert.strictEqual(result.emitted, true);
assert.strictEqual(result.event.title, 'FIRE/SMOKE RISK AHEAD');

result = publish({
  createdAt: 1_000_000 + 360_000,
  routeId: 'route-e',
  segmentId: 'segment-5',
  hazard: { shouldEmit: false },
});
assert.strictEqual(result.emitted, false);
assert.strictEqual(result.reason, 'not_applicable');

resetRemoteWeatherBriefPublisherForTests();
briefCadLogStore.clear();
result = publish({ createdAt: 2_000_000 });
assert.strictEqual(result.emitted, true);
result = publish({
  createdAt: 2_000_000 + 60_000,
  hazard: {
    message: 'High remoteness combines with elevated weather risk and a closing bailout option.',
  },
});
assert.strictEqual(result.emitted, true);
assert.strictEqual(result.reason, 'meaningful_change');
assert.strictEqual(briefCadLogStore.getEntries().length, 2, 'Meaningfully changed messages should emit inside the dedupe window.');

resetRemoteWeatherBriefPublisherForTests();
briefCadLogStore.clear();
result = publish({ createdAt: 3_000_000 });
assert.strictEqual(result.emitted, true);
result = publish({ createdAt: 3_000_000 + REMOTE_WEATHER_BRIEF_DEDUPE_WINDOW_MS + 1 });
assert.strictEqual(result.emitted, true, 'Same hazard should emit after the 10 minute dedupe window expires.');

resetRemoteWeatherBriefPublisherForTests();
briefCadLogStore.clear();
result = publish({ createdAt: 4_000_000, userGenerated: true });
assert.strictEqual(result.emitted, true, 'User-generated events must not be suppressed by the remote/weather publisher.');
result = publish({ createdAt: 4_000_000 + 1, userGenerated: true });
assert.strictEqual(result.emitted, true, 'User-generated repeats must bypass publisher dedupe.');

console.log('Remote weather ECS Brief publisher checks passed.');
