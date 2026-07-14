const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const ts = require('typescript');

global.__DEV__ = false;

const storage = new Map();
global.localStorage = {
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => Array.from(storage.keys())[index] ?? null,
  removeItem: (key) => storage.delete(key),
  setItem: (key, value) => storage.set(key, String(value)),
  get length() {
    return storage.size;
  },
};

const originalLoad = Module._load;
Module._load = function loadWithReactNativeStub(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad.call(this, request, parent, isMain);
};

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

function read(...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');
}

function loadTsModule(...segments) {
  const filename = path.join(root, ...segments);
  const source = read(...segments);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

const NOW = '2026-07-14T12:00:00.000Z';

function sourceTruth(id = 'source-1', overrides = {}) {
  return {
    id,
    origin: 'manual',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS member input',
    authorityKind: 'user',
    observedAt: '2026-07-14T11:55:00.000Z',
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: [],
    ...overrides,
  };
}

function command(id, overrides = {}) {
  return {
    schemaVersion: 1,
    version: 1,
    id,
    expeditionId: 'expedition-1',
    creator: { id: 'lead-1', label: 'Lead', role: 'owner' },
    type: 'general',
    priority: 'normal',
    title: `Command ${id}`,
    instructions: 'Complete the assigned field action and report status.',
    target: { kind: 'team', memberIds: ['member-1', 'member-2'], label: 'Expedition team' },
    acknowledgmentPolicy: { mode: 'none', targetMemberIds: [] },
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

function buildInput(commands, overrides = {}) {
  return {
    commands,
    events: [],
    now: NOW,
    resolvedPage: 0,
    resolvedPageSize: 2,
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
    convoy: {
      permitted: true,
      active: true,
      memberCount: 4,
      staleCount: 0,
    },
    persistenceStatus: 'ready',
    ...overrides,
  };
}

const presentation = loadTsModule('lib', 'dispatchMissionCommandPresentation.ts');
const interaction = loadTsModule('lib', 'dispatchMissionCommandInteraction.ts');
const missionAdapters = loadTsModule('lib', 'dispatchMissionCommandAdapters.ts');
const { dispatchPersistenceAdapter } = loadTsModule('lib', 'dispatchPersistenceAdapter.ts');

const actionFlight = interaction.createMissionCommandActionFlightGuard();
assert.equal(actionFlight.tryAcquire('command-1:resolve'), true);
assert.equal(actionFlight.tryAcquire('command-1:resolve'), false, 'A duplicate tap must not acquire the active action.');
assert.equal(actionFlight.tryAcquire('command-2:cancel'), false, 'Competing command mutations must wait for the active action.');
assert.equal(actionFlight.release('command-2:cancel'), false, 'A different action cannot release the active flight.');
assert.equal(actionFlight.release('command-1:resolve'), true);
assert.equal(actionFlight.tryAcquire('command-2:cancel'), true);
actionFlight.reset();
assert.equal(actionFlight.getActiveKey(), null);

const partialAcknowledgment = command('awaiting', {
  type: 'check_in',
  acknowledgmentPolicy: { mode: 'all', targetMemberIds: ['member-1', 'member-2'] },
  acknowledgmentState: 'partial',
  acknowledgments: [{
    id: 'ack-1',
    idempotencyKey: 'ack-1',
    memberId: 'member-1',
    response: 'acknowledged',
    respondedAt: '2026-07-14T11:40:00.000Z',
  }],
  deadlineAt: '2026-07-14T12:30:00.000Z',
});
const overdue = command('overdue', {
  priority: 'critical',
  operationalState: 'blocked',
  deadlineAt: '2026-07-14T11:45:00.000Z',
});
const queued = command('queued', {
  deliveryState: 'queued',
  operationalState: 'in_progress',
});
const failedDelivery = command('failed-delivery', {
  deliveryState: 'failed',
  operationalState: 'in_progress',
});
const resolved = [0, 1, 2].map((index) => command(`resolved-${index}`, {
  operationalState: 'resolved',
  deadlineAt: index === 2 ? '2026-07-14T12:10:00.000Z' : undefined,
  resolution: {
    kind: 'resolved',
    summary: 'Command completed.',
    occurredAt: `2026-07-14T11:5${index}:00.000Z`,
    actorId: 'lead-1',
  },
  updatedAt: `2026-07-14T11:5${index}:00.000Z`,
}));

const initialModelStartedAt = performance.now();
const model = presentation.buildMissionCommandBoardPresentation(buildInput([
  command('decision', { operationalState: 'proposed' }),
  partialAcknowledgment,
  queued,
  overdue,
  ...resolved,
]));
const initialModelDurationMs = performance.now() - initialModelStartedAt;

assert.equal(model.sections.needsDecision.items.length, 2, 'Proposed and blocked commands need a decision.');
assert.equal(model.sections.awaitingAcknowledgment.items.length, 1, 'Partial acknowledgments remain awaiting acknowledgment.');
assert.equal(model.sections.inProgress.items.length, 1, 'Active work without pending acknowledgments remains in progress.');
assert.equal(model.sections.resolved.items.length, 2, 'Resolved history is paginated.');
assert.equal(model.sections.resolved.totalCount, 3);
assert.equal(model.sections.resolved.hasMore, true);
assert.equal(
  model.sections.resolved.items.find((item) => item.commandId === 'resolved-2').deadlineLabel,
  'Deadline completed',
  'Resolved commands must not relabel a terminal deadline as unavailable.',
);
assert.equal(model.summary.openCount, 4);
assert.equal(model.summary.awaitingAcknowledgmentCount, 1);
assert.equal(model.summary.decisionRequiredCount, 2);
assert.equal(model.summary.nextDeadlineAt, '2026-07-14T11:45:00.000Z');
assert.equal(model.summary.convoyLabel, '4 members / all current');
assert.equal(model.summary.connectionLabel, 'Realtime connected');

const windowedDecisionSection = presentation.windowMissionCommandBoardSection(
  model.sections.needsDecision,
  1,
);
assert.equal(windowedDecisionSection.items.length, 1, 'Open command sections must render through a bounded window.');
assert.equal(windowedDecisionSection.totalCount, 2);
assert.equal(windowedDecisionSection.hasMore, true);

const awaitingCard = model.sections.awaitingAcknowledgment.items[0];
assert.equal(awaitingCard.acknowledgmentLabel, '1 of 2 acknowledged');
assert.match(awaitingCard.accessibilityLabel, /1 of 2 acknowledged/i);
assert.match(awaitingCard.accessibilityLabel, /Target Expedition team/i);
assert.match(awaitingCard.accessibilityLabel, /Normal priority/i);
assert.equal(model.sections.needsDecision.items.find((item) => item.commandId === 'overdue').deadlineState, 'overdue');
assert.equal(model.sections.inProgress.items[0].deliveryLabel, 'Queued offline');
const failedDeliveryModel = presentation.buildMissionCommandBoardPresentation(buildInput([failedDelivery], {
  connectivity: {
    online: false,
    offlineMode: true,
    realtimeStatus: 'error',
    queuedCount: 1,
  },
}));
const failedDeliveryCard = [
  ...failedDeliveryModel.sections.needsDecision.items,
  ...failedDeliveryModel.sections.awaitingAcknowledgment.items,
  ...failedDeliveryModel.sections.inProgress.items,
].find((card) => card.commandId === failedDelivery.id);
assert.ok(failedDeliveryCard);
assert.equal(failedDeliveryCard.deliveryLabel, 'Delivery failed');
assert.equal(failedDeliveryCard.allowedActions[0].id, 'retry_delivery');
assert.match(failedDeliveryCard.accessibilityLabel, /Delivery failed/);

const longLabel = 'CHECK IN AT THE NORTHERN RIDGELINE TURNAROUND WITH TRAILER SUPPORT';
const longLabelModel = presentation.buildMissionCommandBoardPresentation(buildInput([command('long-label', {
  title: longLabel,
  target: { kind: 'vehicle', vehicleId: 'vehicle-long', label: 'Expedition Support Vehicle With Extended Callsign' },
})]));
assert.match(longLabelModel.sections.inProgress.items[0].accessibilityLabel, new RegExp(longLabel));
assert.match(longLabelModel.sections.inProgress.items[0].accessibilityLabel, /Expedition Support Vehicle With Extended Callsign/);

assert.deepEqual(
  presentation.resolveMissionCommandBoardLayout({ width: 360, height: 740, fontScale: 1 }),
  { isLandscape: false, compactHeader: true, outerShellOwnsScrolling: true, dynamicType: false },
);
assert.deepEqual(
  presentation.resolveMissionCommandBoardLayout({ width: 920, height: 430, fontScale: 1 }),
  { isLandscape: true, compactHeader: false, outerShellOwnsScrolling: false, dynamicType: false },
);
assert.equal(
  presentation.resolveMissionCommandBoardLayout({ width: 600, height: 900, fontScale: 1.6 }).compactHeader,
  true,
  'Dynamic type must select the non-compressing header layout even on a wider device.',
);

const restricted = presentation.buildMissionCommandBoardPresentation(buildInput([command('restricted')], {
  canViewCommands: false,
}));
assert.equal(restricted.degradedState.kind, 'permission_restricted');
assert.equal(restricted.visibleCommandCount, 0, 'Restricted commands must not leak through presentation models.');

const staleConvoy = presentation.buildMissionCommandBoardPresentation(buildInput([], {
  convoy: { permitted: true, active: true, memberCount: 5, staleCount: 2 },
}));
assert.equal(staleConvoy.summary.convoyLabel, '5 members / 2 stale');

const offline = presentation.buildMissionCommandBoardPresentation(buildInput([queued], {
  connectivity: {
    online: false,
    offlineMode: true,
    realtimeStatus: 'closed',
    queuedCount: 1,
  },
}));
assert.equal(offline.summary.connectionLabel, 'Offline / 1 queued');
assert.equal(offline.degradedState.kind, 'offline');

const empty = presentation.buildMissionCommandBoardPresentation(buildInput([]));
assert.equal(empty.degradedState.kind, 'empty');

const noExpedition = presentation.buildMissionCommandBoardPresentation(buildInput([], {
  hasActiveExpedition: false,
  soloMode: true,
}));
assert.equal(noExpedition.degradedState.kind, 'solo');
assert.match(noExpedition.degradedState.title, /personal mission command/i);

const noTeamExpedition = presentation.buildMissionCommandBoardPresentation(buildInput([], {
  hasActiveExpedition: false,
  soloMode: false,
}));
assert.equal(noTeamExpedition.degradedState.kind, 'no_active_expedition');

const migrationRecovered = presentation.buildMissionCommandBoardPresentation(buildInput([], {
  persistenceStatus: 'recovered',
}));
assert.equal(migrationRecovered.notices.some((notice) => notice.kind === 'migration_recovered'), true);

const cadEvent = {
  id: 'cad-rally-1',
  type: 'team_ping',
  severity: 'warning',
  title: 'Rally Request',
  message: 'Proceed to the confirmed rally and acknowledge.',
  source: 'user_report',
  createdAt: '2026-07-14T11:30:00.000Z',
  updatedAt: '2026-07-14T11:35:00.000Z',
  syncState: 'queued',
  dedupeKey: 'cad:rally:stable',
  coordinationType: 'rally',
  requiresAcknowledgment: true,
  createdBy: { userId: 'lead-1', displayName: 'Lead', callsign: 'LEAD' },
  location: {
    latitude: 39.1,
    longitude: -105.2,
    timestamp: '2026-07-14T11:30:00.000Z',
  },
};
const projectedCad = missionAdapters.projectDispatchSnapshotToMissionCommandState({
  pings: [],
  queueItems: [],
  assignments: [],
  acknowledgments: [{
    id: 'cad-ack-1',
    idempotencyKey: 'cad-ack-1',
    version: 1,
    pingId: cadEvent.id,
    memberId: 'member-1',
    status: 'acknowledged',
    acknowledgedAt: '2026-07-14T11:36:00.000Z',
    updatedAt: '2026-07-14T11:36:00.000Z',
    deliveryState: 'local',
  }],
  timelineEvents: [{
    id: 'cad-timeline-1',
    idempotencyKey: 'cad-timeline-1',
    version: 1,
    type: 'ping_acknowledged',
    title: 'Acknowledged',
    detail: 'Member acknowledged the rally.',
    occurredAt: '2026-07-14T11:36:00.000Z',
    priority: 'high',
    memberIds: ['member-1'],
    pingId: cadEvent.id,
    deliveryState: 'local',
  }],
  cadEvents: [cadEvent],
  missionCommands: [],
  missionCommandEvents: [],
}, {
  expeditionId: 'expedition-1',
  creatorLabel: 'Lead',
  soloMode: false,
});
assert.equal(projectedCad.commands.length, 1, 'A routed CAD command must appear once on the canonical board.');
assert.equal(projectedCad.commands[0].type, 'rally');
assert.equal(projectedCad.commands[0].deliveryState, 'queued');
assert.equal(projectedCad.commands[0].acknowledgmentState, 'complete');
assert.equal(projectedCad.events.length, 1, 'Legacy CAD timeline history should remain attached to the command.');

const restrictedMemberCad = missionAdapters.adaptDispatchCadEventToMissionCommand({
  ...cadEvent,
  id: 'cad-team-member-location',
  dedupeKey: 'cad:team-member-location',
  source: 'team_member',
}, {
  expeditionId: 'expedition-1',
  creatorLabel: 'Lead',
});
assert.equal(restrictedMemberCad.linkedContext?.restricted, true);
assert.equal(
  restrictedMemberCad.linkedContext?.coordinates,
  undefined,
  'Derived Mission Command context must not expose a restricted member coordinate.',
);

const canonicalCadMutation = {
  ...projectedCad.commands[0],
  version: 2,
  operationalState: 'in_progress',
  updatedAt: '2026-07-14T11:40:00.000Z',
};
const projectedCanonicalCad = missionAdapters.projectDispatchSnapshotToMissionCommandState({
  pings: [],
  queueItems: [],
  assignments: [],
  acknowledgments: [],
  timelineEvents: [],
  cadEvents: [cadEvent],
  missionCommands: [canonicalCadMutation],
  missionCommandEvents: [],
}, {
  expeditionId: 'expedition-1',
  creatorLabel: 'Lead',
});
assert.equal(projectedCanonicalCad.commands.length, 1, 'A canonical mutation must replace, not duplicate, its CAD adapter record.');
assert.equal(projectedCanonicalCad.commands[0].operationalState, 'in_progress');

storage.set('dispatch_state_corrupt-board', '{not-json');
const corruptLoad = dispatchPersistenceAdapter.loadResult('corrupt-board', {
  pings: [],
  queueItems: [],
  assignments: [],
  timelineEvents: [],
});
assert.equal(corruptLoad.status, 'recovered');
assert.equal(corruptLoad.safeCode, 'dispatch_persistence_corrupt');

let persistenceNotifications = 0;
const unsubscribePersistence = dispatchPersistenceAdapter.subscribe((expeditionId) => {
  if (expeditionId === 'expedition-1') persistenceNotifications += 1;
});
dispatchPersistenceAdapter.applyMissionCommandMutation(
  'expedition-1',
  { pings: [], queueItems: [], assignments: [], timelineEvents: [] },
  canonicalCadMutation,
  null,
);
unsubscribePersistence();
assert.equal(persistenceNotifications, 1, 'An atomic command mutation should publish one narrow persistence update.');

const highVolumeCommands = Array.from({ length: 250 }, (_, index) => command(`volume-${index}`, {
  operationalState: index % 4 === 0
    ? 'proposed'
    : index % 4 === 1
      ? 'active'
      : index % 4 === 2
        ? 'in_progress'
        : 'resolved',
  ...(index % 4 === 3 ? {
    resolution: {
      kind: 'resolved',
      summary: 'Complete.',
      occurredAt: NOW,
      actorId: 'lead-1',
    },
  } : {}),
}));
const highVolumeEvents = Array.from({ length: 5_000 }, (_, index) => ({
  commandId: highVolumeCommands[index % highVolumeCommands.length].id,
}));
const start = performance.now();
let highVolumeModel;
for (let iteration = 0; iteration < 40; iteration += 1) {
  highVolumeModel = presentation.buildMissionCommandBoardPresentation(buildInput(highVolumeCommands, {
    events: highVolumeEvents,
    resolvedPageSize: 20,
  }));
}
const durationMs = performance.now() - start;
assert.equal(highVolumeModel.visibleCommandCount, 208, 'Only the bounded resolved page should become card models.');
assert.ok(durationMs < 1500, `High-volume presentation selection took ${durationMs.toFixed(1)}ms.`);
const largeTimeline = Array.from({ length: 10_000 }, (_, index) => ({ id: `timeline-${index}` }));
const timelineStartedAt = performance.now();
let timelineWindow;
for (let iteration = 0; iteration < 1_000; iteration += 1) {
  timelineWindow = presentation.windowMissionCommandTimeline(largeTimeline, 20, 80);
}
const timelineWindowMs = performance.now() - timelineStartedAt;
assert.equal(timelineWindow.items.length, 20);
assert.equal(timelineWindow.totalCount, 10_000);
assert.equal(timelineWindow.hasMore, true);
assert.ok(timelineWindowMs < 250, `Large timeline windowing took ${timelineWindowMs.toFixed(1)}ms.`);

const renderBudgetCommands = Array.from({ length: 60 }, (_, index) => command(`render-${index}`, {
  operationalState: 'in_progress',
}));
const selectStableBoard = presentation.createMissionCommandBoardPresentationSelector();
const firstStableModel = selectStableBoard(buildInput(renderBudgetCommands));
const clonedStableModel = selectStableBoard(buildInput(renderBudgetCommands.map((item) => ({
  ...item,
  creator: { ...item.creator },
  sourceTruth: item.sourceTruth.map((source) => ({ ...source })),
}))));
const firstCards = new Map(firstStableModel.sections.inProgress.items.map((card) => [card.commandId, card]));
const stableCardInvalidations = clonedStableModel.sections.inProgress.items.filter((card) => (
  firstCards.get(card.commandId) !== card
)).length;
assert.equal(stableCardInvalidations, 0, 'Equivalent persistence projections must not invalidate any command card.');

const acknowledgedCommandId = 'render-17';
const acknowledgmentUpdated = renderBudgetCommands.map((item) => item.id === acknowledgedCommandId ? {
  ...item,
  version: item.version + 1,
  updatedAt: '2026-07-14T12:01:00.000Z',
  acknowledgmentPolicy: { mode: 'all', targetMemberIds: ['member-1', 'member-2'] },
  acknowledgmentState: 'partial',
  acknowledgments: [{
    id: 'render-ack-17',
    idempotencyKey: 'render-ack-17',
    memberId: 'member-1',
    response: 'acknowledged',
    respondedAt: '2026-07-14T12:01:00.000Z',
  }],
} : item);
const acknowledgmentModel = selectStableBoard(buildInput(acknowledgmentUpdated));
const clonedCards = new Map(clonedStableModel.sections.inProgress.items.map((card) => [card.commandId, card]));
const acknowledgmentCardInvalidations = acknowledgmentModel.sections.awaitingAcknowledgment.items
  .concat(acknowledgmentModel.sections.inProgress.items)
  .filter((card) => clonedCards.get(card.commandId) !== card)
  .length;
assert.equal(
  acknowledgmentCardInvalidations,
  1,
  'One acknowledgment update may invalidate only its owning command card.',
);

const screenSource = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const boardSource = read('components', 'dispatch', 'DispatchMissionCommandBoard.tsx');
const presentationSource = read('lib', 'dispatchMissionCommandPresentation.ts');

assert.ok(
  screenSource.includes("isDispatchFeatureEnabled(dispatchRollout, 'missionCommand')") &&
    screenSource.includes('!missionCommandEnabled ? convoyFeedSurface') &&
    screenSource.includes('<DispatchMissionCommandBoard') &&
    screenSource.includes('<DispatchConvoyCommandPanel') &&
    screenSource.includes('MissionCommandDispatchNavigation'),
  'Mission Command must be rollout-gated while preserving the existing convoy surface.',
);
assert.ok(
  boardSource.includes('MISSION COMMAND') &&
    boardSource.includes('COMMAND BOARD') &&
    presentationSource.includes("'Needs Decision'") &&
    presentationSource.includes("'Awaiting Acknowledgment'") &&
    presentationSource.includes("'In Progress'") &&
    presentationSource.includes("'Resolved'"),
  'The Board must expose the required flagship hierarchy and four distinct sections.',
);
assert.ok(
  boardSource.includes('ECSModalShell') &&
    boardSource.includes('SourceTruthInspectorTrigger') &&
    boardSource.includes('accessibilityRole="tab"') &&
    boardSource.includes('accessibilityRole="summary"') &&
    boardSource.includes('useWindowDimensions') &&
    boardSource.includes('MissionClockHeaderMetric') &&
    boardSource.includes('DispatchMissionClockPanel') &&
    boardSource.includes('useMissionClockScheduler'),
  'The Board must use the ECS detail sheet, source inspector, accessible internal tabs, responsive layout, and isolated Mission Clock.',
);
assert.ok(
  boardSource.includes('React.memo') &&
    boardSource.includes('OPEN_SECTION_WINDOW_SIZE') &&
    boardSource.includes('windowMissionCommandBoardSection') &&
    boardSource.includes('RESOLVED_PAGE_SIZE') &&
    boardSource.includes('incrementECSPerformanceCounter') &&
    boardSource.includes('mission_command_board_initial_render'),
  'The Board must memoize cards, window open commands, bound resolved history, and record development-only performance evidence.',
);
assert.ok(
  boardSource.includes('MissionCommandClockBoundary') &&
    (boardSource.match(/useMissionClockScheduler\(/g) ?? []).length === 1 &&
    boardSource.includes("recordECSPerformanceRender('dispatch_ready', 'mission_command_card')") &&
    boardSource.includes('ACTION_SINGLE_FLIGHT_HOLD_MS') &&
    boardSource.includes('COMMAND_EVENT_DETAIL_PAGE_SIZE'),
  'Clock ticks must remain isolated while card renders, duplicate actions, and history pages stay bounded and observable.',
);
assert.ok(
  screenSource.includes("React.lazy(() => import('./DispatchIncidentRoom'))") &&
    screenSource.includes("React.lazy(() => import('./DispatchMissionCommandComposer'))") &&
    screenSource.includes('<React.Suspense') &&
    !screenSource.includes("import DispatchIncidentRoom from './DispatchIncidentRoom'"),
  'Hidden Mission Command workspaces must load lazily rather than contributing to initial Dispatch evaluation.',
);
assert.ok(
  screenSource.includes('const renderEvent = useCallback<ListRenderItem<DispatchEvent>>') &&
    screenSource.includes('const EventRow = React.memo(function EventRow') &&
    screenSource.includes('initialNumToRender={12}') &&
    screenSource.includes('windowSize={7}'),
  'The Dispatch timeline must keep a stable virtualized renderer and memoized event rows.',
);

console.log(JSON.stringify({
  status: 'passed',
  initialPresentationModelMs: Number(initialModelDurationMs.toFixed(2)),
  renderInvalidations: {
    stableProjection: stableCardInvalidations,
    oneAcknowledgmentUpdate: acknowledgmentCardInvalidations,
  },
  highVolume: {
    commandCount: highVolumeCommands.length,
    eventCount: highVolumeEvents.length,
    iterations: 40,
    durationMs: Number(durationMs.toFixed(2)),
  },
  timelineWindow: {
    eventCount: largeTimeline.length,
    iterations: 1_000,
    durationMs: Number(timelineWindowMs.toFixed(2)),
    initialRows: timelineWindow.items.length,
  },
}));
