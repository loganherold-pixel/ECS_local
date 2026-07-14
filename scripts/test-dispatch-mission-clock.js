const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const ts = require('typescript');

global.__DEV__ = false;

const root = process.cwd();

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(outputText, filename);
};

const originalLoad = Module._load;
Module._load = function loadWithReactNativeStub(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad.call(this, request, parent, isMain);
};

const clock = require(path.join(root, 'lib', 'dispatchMissionClock.ts'));
const clockScheduler = require(path.join(root, 'lib', 'dispatchMissionClockScheduler.ts'));

const DUE_AT = '2026-07-14T12:00:00.000Z';
const DUE_MS = Date.parse(DUE_AT);

function sourceTruth(id = 'clock-source') {
  return {
    id,
    origin: 'manual',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS member input',
    authorityKind: 'user',
    observedAt: '2026-07-14T11:30:00.000Z',
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: [],
  };
}

function deadline(id = 'deadline-1', overrides = {}) {
  return clock.createMissionClockDeadline({
    id,
    expeditionId: 'expedition-clock',
    source: 'command_deadline',
    title: `Deadline ${id}`,
    reason: 'A deterministic test deadline.',
    dueAt: DUE_AT,
    warningWindowMs: 10 * 60_000,
    criticalWindowMs: 2 * 60_000,
    sourceTruth: [sourceTruth(`source-${id}`)],
    ...overrides,
  });
}

function command(overrides = {}) {
  return {
    schemaVersion: 1,
    version: 1,
    id: 'command-clock',
    expeditionId: 'expedition-clock',
    creator: { id: 'lead-1', label: 'Lead', role: 'owner' },
    type: 'check_in',
    priority: 'high',
    title: 'Confirm team status',
    instructions: 'Confirm status at the next safe stop.',
    target: { kind: 'team', memberIds: ['member-1', 'member-2'], label: 'Team' },
    acknowledgmentPolicy: { mode: 'all', targetMemberIds: ['member-1', 'member-2'] },
    acknowledgmentState: 'partial',
    acknowledgments: [{
      id: 'ack-1',
      idempotencyKey: 'ack-1',
      memberId: 'member-1',
      response: 'acknowledged',
      respondedAt: '2026-07-14T11:40:00.000Z',
    }],
    deadlineAt: DUE_AT,
    sourceTruth: [sourceTruth('source-command')],
    operationalState: 'active',
    deliveryState: 'delivered',
    idempotencyKey: 'mission:clock',
    createdAt: '2026-07-14T11:00:00.000Z',
    updatedAt: '2026-07-14T11:45:00.000Z',
    audit: {
      schemaVersion: 1,
      sourceKind: 'native',
      safetyScope: 'ecs_team_coordination_only',
    },
    ...overrides,
  };
}

assert.equal(clock.evaluateMissionClockDeadline(deadline(), DUE_MS).status, 'due');
assert.equal(clock.evaluateMissionClockDeadline(deadline(), DUE_MS + 1).status, 'overdue');
assert.equal(clock.evaluateMissionClockDeadline(deadline(), DUE_MS - (2 * 60_000)).status, 'due');
assert.equal(clock.evaluateMissionClockDeadline(deadline(), DUE_MS - (2 * 60_000) - 1).status, 'due_soon');
assert.equal(clock.evaluateMissionClockDeadline(deadline(), DUE_MS - (10 * 60_000)).status, 'due_soon');
assert.equal(clock.evaluateMissionClockDeadline(deadline(), DUE_MS - (10 * 60_000) - 1).status, 'scheduled');

const completedDeadline = clock.evaluateMissionClockDeadline(
  deadline('completed', { completionState: 'completed' }),
  DUE_MS + 60_000,
);
const cancelledDeadline = clock.evaluateMissionClockDeadline(
  deadline('cancelled', { completionState: 'cancelled' }),
  DUE_MS + 60_000,
);
assert.equal(completedDeadline.status, 'completed');
assert.equal(cancelledDeadline.status, 'cancelled');
assert.equal(clock.formatMissionClockCountdown(completedDeadline), 'COMPLETED');
assert.equal(clock.formatMissionClockCountdown(cancelledDeadline), 'CANCELLED');

const invalid = clock.evaluateMissionClockDeadline(deadline('invalid', { dueAt: 'not-a-date' }), DUE_MS);
assert.equal(invalid.status, 'unavailable');
assert.deepEqual(invalid.issueCodes, ['mission_clock_due_at_invalid']);
assert.equal(
  clock.evaluateMissionClockDeadline(deadline('local-time', { dueAt: '2026-07-14T12:00:00' }), DUE_MS).status,
  'unavailable',
  'A timestamp without an explicit UTC or offset zone must fail closed.',
);
const missingSource = clock.evaluateMissionClockDeadline(deadline('missing-source', { sourceTruth: [] }), DUE_MS);
assert.equal(missingSource.status, 'unavailable');
assert.ok(missingSource.issueCodes.includes('mission_clock_source_missing'));

const warningBoundary = deadline('warning-boundary', {
  dueAt: '2026-07-14T05:00:00.000-07:00',
});
assert.equal(
  clock.evaluateMissionClockDeadline(warningBoundary, '2026-07-14T11:50:00.000Z').status,
  'due_soon',
  'Equivalent absolute timestamps must not depend on timezone representation.',
);

const forward = clock.buildMissionClockSnapshot([deadline()], DUE_MS + 60_000);
const backward = clock.buildMissionClockSnapshot([deadline()], DUE_MS - (20 * 60_000));
assert.equal(forward.next.status, 'overdue');
assert.equal(backward.next.status, 'scheduled', 'Moving the clock backward must recalculate from absolute time.');

const restartedInput = JSON.parse(JSON.stringify(deadline('restart')));
assert.equal(
  clock.buildMissionClockSnapshot([restartedInput], DUE_MS - 60_000).next.status,
  'due',
  'A serialized absolute deadline must restore without a decrementing counter.',
);

const multiple = clock.buildMissionClockSnapshot([
  deadline('later', { dueAt: '2026-07-14T13:00:00.000Z' }),
  deadline('check-in', {
    source: 'scheduled_check_in',
    dueAt: '2026-07-14T12:09:00.000Z',
  }),
  deadline('camp-cutoff', {
    source: 'camp_diversion_cutoff',
    dueAt: '2026-07-14T12:08:00.000Z',
  }),
  deadline('overdue', { dueAt: '2026-07-14T11:55:00.000Z' }),
], DUE_MS);
assert.equal(multiple.next.id, 'overdue');
assert.equal(multiple.nextCheckIn.id, 'check-in');
assert.equal(multiple.nextOperationalCutoff.id, 'camp-cutoff');
assert.deepEqual(multiple.decisionSoon.map((item) => item.id), ['overdue', 'camp-cutoff', 'check-in']);

const sourceWindowOrdering = clock.buildMissionClockSnapshot([
  deadline('long-window-later', {
    source: 'camp_diversion_cutoff',
    dueAt: '2026-07-14T12:30:00.000Z',
    warningWindowMs: 60 * 60_000,
    criticalWindowMs: 15 * 60_000,
  }),
  deadline('short-window-earlier', {
    dueAt: '2026-07-14T12:08:00.000Z',
    warningWindowMs: 60_000,
    criticalWindowMs: 0,
  }),
], DUE_MS);
assert.deepEqual(
  sourceWindowOrdering.active.map((item) => item.id),
  ['short-window-earlier', 'long-window-later'],
  'Different warning policies must not override chronological due-time ordering.',
);

const commandDeadline = clock.missionClockDeadlineFromCommand(command());
assert.equal(commandDeadline.source, 'scheduled_check_in');
assert.equal(commandDeadline.linkedCommandId, 'command-clock');
assert.equal(commandDeadline.linkedContext.type, 'command');
assert.equal(
  clock.missionClockDeadlineFromCommand(command({ operationalState: 'blocked' })).source,
  'no_response_review',
);

const restrictedCommandDeadline = clock.missionClockDeadlineFromCommand(command({
  linkedContext: {
    id: 'restricted-member-position',
    type: 'member',
    title: 'Exact restricted member position',
    restricted: true,
    coordinates: { latitude: 39.7392, longitude: -104.9903 },
  },
}));
assert.deepEqual(restrictedCommandDeadline.linkedContext, {
  id: 'restricted-member-position',
  type: 'member',
  label: 'Restricted context',
  restricted: true,
});
assert.equal(JSON.stringify(restrictedCommandDeadline).includes('39.7392'), false);

const resolvedCommandDeadline = clock.missionClockDeadlineFromCommand(command({
  operationalState: 'resolved',
  resolution: {
    kind: 'resolved',
    summary: 'Complete.',
    occurredAt: '2026-07-14T11:50:00.000Z',
    actorId: 'lead-1',
  },
}));
const resolvedSnapshot = clock.buildMissionClockSnapshot([resolvedCommandDeadline], DUE_MS);
assert.equal(resolvedSnapshot.active.length, 0, 'Resolving a command must remove its deadline from the active clock.');
assert.equal(resolvedSnapshot.completed.length, 1);

const offline = clock.missionClockDeadlineFromOfflineAction('expedition-clock', {
  id: 'offline-action-1',
  idempotencyKey: 'offline-action-1',
  entityType: 'ping',
  actionType: 'create',
  createdAt: '2026-07-14T11:00:00.000Z',
  updatedAt: '2026-07-14T11:30:00.000Z',
  nextAttemptAt: '2026-07-14T12:01:00.000Z',
  status: 'queued',
});
assert.equal(offline.source, 'offline_retry');
assert.equal(offline.sourceTruth[0].origin, 'cached');
assert.equal(clock.buildMissionClockSnapshot([offline], DUE_MS).active.length, 1);

let nowMs = DUE_MS - (20 * 60_000);
let nextTimerId = 0;
const timers = new Map();
let maximumTimerCount = 0;
const ticks = [];
const scheduler = clockScheduler.createMissionClockScheduler({
  now: () => nowMs,
  onTick: (snapshot) => ticks.push(snapshot),
  setTimeoutFn: (callback, delayMs) => {
    const handle = { id: ++nextTimerId };
    timers.set(handle, { callback, delayMs });
    maximumTimerCount = Math.max(maximumTimerCount, timers.size);
    return handle;
  },
  clearTimeoutFn: (handle) => timers.delete(handle),
});

scheduler.start([deadline('scheduler')]);
assert.equal(scheduler.getDiagnostics().activeTimerCount, 1);
assert.equal(timers.size, 1);
scheduler.update([deadline('scheduler'), deadline('scheduler-2', { dueAt: '2026-07-14T12:30:00.000Z' })]);
assert.equal(timers.size, 1, 'Updating deadlines must replace, not stack, the scheduler timer.');
assert.equal(maximumTimerCount, 1, 'Mission Clock must never own more than one timer.');
scheduler.setForeground(false);
assert.equal(timers.size, 0, 'Backgrounding must clear the active timer.');
nowMs = DUE_MS + 1;
scheduler.setForeground(true);
assert.equal(scheduler.getSnapshot().next.status, 'overdue');
assert.equal(timers.size, 1, 'Foreground restoration must recalculate and schedule exactly once.');
scheduler.stop();
assert.equal(timers.size, 0);
assert.equal(scheduler.getDiagnostics().activeTimerCount, 0);
assert.ok(ticks.length >= 3);

const boardSource = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchMissionCommandBoard.tsx'), 'utf8');
const panelSource = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchMissionClockPanel.tsx'), 'utf8');
const hookSource = fs.readFileSync(path.join(root, 'lib', 'useMissionClockScheduler.ts'), 'utf8');
assert.match(boardSource, /collectMissionClockDeadlines/);
assert.match(boardSource, /<MissionClockHeaderMetric snapshot=\{missionClock\}/);
assert.match(boardSource, /<DispatchMissionClockPanel/);
assert.match(panelSource, /MISSION CLOCK DETAIL/);
assert.match(panelSource, /Open Command/);
assert.match(panelSource, /does not send commands, escalate incidents, reroute, or contact anyone/);
assert.match(hookSource, /AppState\.addEventListener/);
assert.match(hookSource, /scheduler\.stop\(\)/);
assert.equal(boardSource.includes('setInterval('), false, 'The Board must not retain a second clock timer.');

const highVolumeDeadlines = Array.from({ length: 1_000 }, (_, index) => deadline(`volume-${index}`, {
  dueAt: new Date(DUE_MS + ((index - 250) * 60_000)).toISOString(),
}));
const highVolumeStartedAt = performance.now();
let highVolumeSnapshot;
for (let iteration = 0; iteration < 50; iteration += 1) {
  highVolumeSnapshot = clock.buildMissionClockSnapshot(highVolumeDeadlines, DUE_MS);
}
const highVolumeDurationMs = performance.now() - highVolumeStartedAt;
assert.equal(highVolumeSnapshot.deadlines.length, 1_000);
assert.ok(
  highVolumeDurationMs < 2_000,
  `Mission Clock high-volume selection took ${highVolumeDurationMs.toFixed(1)}ms.`,
);

console.log(JSON.stringify({
  status: 'passed',
  schedulerMaximumTimerCount: maximumTimerCount,
  highVolume: {
    deadlineCount: highVolumeDeadlines.length,
    iterations: 50,
    durationMs: Number(highVolumeDurationMs.toFixed(2)),
  },
}));
