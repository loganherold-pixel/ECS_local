const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

global.__DEV__ = false;

const root = process.cwd();

function read(...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');
}

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

function sourceTruth(id) {
  return {
    id,
    origin: 'manual',
    policyKey: 'manual_user_state',
    authority: 'ECS member input',
    authorityKind: 'user',
    observedAt: '2026-07-14T11:45:00.000Z',
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: [],
  };
}

function command(id, deadlineAt, overrides = {}) {
  return {
    schemaVersion: 1,
    version: 1,
    id,
    expeditionId: 'expedition-clock-characterization',
    creator: { id: 'lead-1', label: 'Lead', role: 'owner' },
    type: 'general',
    priority: 'normal',
    title: `Command ${id}`,
    instructions: 'Complete the assigned action.',
    target: { kind: 'team', memberIds: ['member-1'], label: 'Team' },
    acknowledgmentPolicy: { mode: 'none', targetMemberIds: [] },
    deadlineAt,
    sourceTruth: [sourceTruth(`source-${id}`)],
    operationalState: 'active',
    deliveryState: 'delivered',
    acknowledgmentState: 'not_required',
    acknowledgments: [],
    idempotencyKey: `mission:${id}`,
    createdAt: '2026-07-14T11:00:00.000Z',
    updatedAt: '2026-07-14T11:30:00.000Z',
    audit: {
      schemaVersion: 1,
      sourceKind: 'native',
      safetyScope: 'ecs_team_coordination_only',
    },
    ...overrides,
  };
}

const { buildMissionCommandBoardPresentation } = require(path.join(
  root,
  'lib',
  'dispatchMissionCommandPresentation.ts',
));

const model = buildMissionCommandBoardPresentation({
  commands: [
    command('later', '2026-07-14T13:00:00.000Z'),
    command('overdue', '2026-07-14T11:30:00.000Z'),
    command('resolved-earlier', '2026-07-14T11:00:00.000Z', { operationalState: 'resolved' }),
  ],
  events: [],
  now: '2026-07-14T12:00:00.000Z',
  hasActiveExpedition: true,
  soloMode: false,
  canViewCommands: true,
  canManageCommands: true,
  connectivity: {
    online: true,
    offlineMode: false,
    realtimeStatus: 'connected',
    queuedCount: 0,
  },
  convoy: { permitted: true, active: true, memberCount: 2, staleCount: 0 },
  persistenceStatus: 'ready',
});

assert.equal(
  model.summary.nextDeadlineAt,
  '2026-07-14T11:30:00.000Z',
  'The current board selects the earliest deadline from open commands, including an overdue deadline.',
);
assert.equal(
  model.summary.nextDeadlineTitle,
  'Command overdue',
  'The current board carries the selected command title into the Mission Clock summary.',
);

const boardSource = read('components', 'dispatch', 'DispatchMissionCommandBoard.tsx');
assert.match(boardSource, /useMissionClockScheduler/);
assert.equal(
  (boardSource.match(/setInterval\(/g) ?? []).length,
  0,
  'The Command Board must delegate timing to the shared Mission Clock scheduler.',
);
assert.match(
  boardSource,
  /<MissionClockHeaderMetric snapshot=\{missionClock\}/,
  'The Command Board header must continue to display the next deadline.',
);

console.log('Dispatch Mission Clock characterization checks passed.');
