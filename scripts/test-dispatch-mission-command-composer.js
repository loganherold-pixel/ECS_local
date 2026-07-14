const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
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

const root = process.cwd();
function read(...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');
}
const composer = require(path.join(root, 'lib', 'dispatchMissionCommandComposer.ts'));
const domain = require(path.join(root, 'lib', 'dispatchMissionCommandDomain.ts'));
const { dispatchPersistenceAdapter } = require(path.join(root, 'lib', 'dispatchPersistenceAdapter.ts'));

const NOW = '2026-07-14T12:00:00.000Z';
const actor = { id: 'lead-1', label: 'Trail Lead', role: 'owner' };
const allowedPermissions = {
  roleLabel: 'Expedition lead',
  disabledReason: 'Permission denied.',
  can: () => ({ allowed: true, safetyCopy: 'ECS team coordination only.' }),
};
const deniedPermissions = {
  roleLabel: 'Viewer',
  disabledReason: 'Permission denied.',
  can: (action) => action === 'view_dispatch'
    ? { allowed: true }
    : { allowed: false, reason: `Denied ${action}.` },
};
const catalog = {
  members: [
    { id: 'lead-1', label: 'Trail Lead', roleId: 'lead', vehicleIds: ['vehicle-1'] },
    { id: 'member-2', label: 'Scout Two', roleId: 'scout' },
    { id: 'member-3', label: 'Sweep Three', roleId: 'scout' },
  ],
  roles: [
    { id: 'lead', label: 'Lead', memberIds: ['lead-1'] },
    { id: 'scout', label: 'Scouts', memberIds: ['member-2', 'member-3'] },
  ],
  vehicles: [
    { id: 'vehicle-1', label: 'Lead Rig', memberIds: ['lead-1'] },
  ],
  teamUnits: [
    { id: 'unit-scout', label: 'Scout Unit', memberIds: ['member-2', 'member-3'] },
  ],
  linkedContexts: [
    {
      id: 'current-location',
      label: 'Current location',
      context: {
        id: 'current-location',
        type: 'pin',
        title: 'Current location',
        coordinates: { latitude: 34.123, longitude: -117.456 },
        observedAt: NOW,
        sourceTruthPolicyKey: 'manual_user_state',
      },
    },
    {
      id: 'restricted-member-location',
      label: 'Restricted member location',
      context: {
        id: 'restricted-member-location',
        type: 'member',
        title: 'Restricted member location',
        coordinates: { latitude: 35.1, longitude: -118.2 },
        metadata: {
          requiresMemberLocationPermission: true,
          locationOwnerMemberId: 'member-2',
          rawProviderBody: { trace: [[35.1, -118.2]] },
        },
      },
    },
  ],
  milestones: [
    { id: 'check-in-1', label: 'Next check-in', deadlineAt: '2026-07-14T13:30:00.000Z' },
  ],
};

function makeForm(overrides = {}) {
  return {
    ...composer.createMissionCommandComposerForm({
      actorId: actor.id,
      soloMode: false,
      members: catalog.members,
      draftId: overrides.draftId ?? 'draft-1',
      seedType: overrides.type ?? 'general',
    }),
    title: 'Hold at trail junction',
    instructions: 'Stop at the signed junction and report status in Dispatch.',
    ...overrides,
  };
}

function build(form, overrides = {}) {
  return composer.buildMissionCommandFromComposer({
    form,
    expeditionId: 'expedition-1',
    actor,
    soloMode: false,
    catalog,
    permissions: allowedPermissions,
    queueDelivery: false,
    now: NOW,
    ...overrides,
  });
}

for (const type of composer.MISSION_COMMAND_COMPOSER_TYPES) {
  const result = build(makeForm({ type, draftId: `draft-${type}` }));
  assert.equal(result.ok, true, `${type} should create a canonical Mission Command.`);
  assert.equal(result.command.type, type);
  assert.equal(result.command.deliveryState, 'local');
  assert.equal(result.command.acknowledgmentState, 'not_required');
  assert.equal(result.event.type, 'created');
  assert.equal(result.command.audit.safetyScope, 'ecs_team_coordination_only');
}

const targetCases = [
  { targetKind: 'member', targetMemberId: 'member-2', expected: 'member' },
  { targetKind: 'selected_members', selectedMemberIds: ['member-2', 'member-3'], expected: 'team' },
  { targetKind: 'expedition', expected: 'team' },
  { targetKind: 'role', targetRoleId: 'scout', expected: 'role' },
  { targetKind: 'vehicle', targetVehicleId: 'vehicle-1', expected: 'vehicle' },
];
targetCases.forEach((targetCase, index) => {
  const result = build(makeForm({ ...targetCase, draftId: `target-${index}` }));
  assert.equal(result.ok, true, `${targetCase.targetKind} should be supported.`);
  assert.equal(result.command.target.kind, targetCase.expected);
});
const soloResult = build(makeForm({ targetKind: 'self', draftId: 'solo-target' }), {
  soloMode: true,
  catalog: { ...catalog, members: [] },
});
assert.equal(soloResult.ok, true);
assert.equal(soloResult.command.target.kind, 'solo');

const offlineSoloResult = build(makeForm({
  targetKind: 'self',
  draftId: 'solo-offline-local-reminder',
  acknowledgmentMode: 'all',
}), {
  soloMode: true,
  catalog: { ...catalog, members: [] },
  queueDelivery: true,
});
assert.equal(offlineSoloResult.ok, true);
assert.equal(
  offlineSoloResult.command.deliveryState,
  'local',
  'A self reminder must not enter a delivery queue when no recipient exists.',
);
assert.equal(offlineSoloResult.command.acknowledgmentPolicy.mode, 'none');
assert.equal(offlineSoloResult.command.acknowledgmentState, 'not_required');
assert.equal(offlineSoloResult.event.type, 'created');
assert.match(offlineSoloResult.event.summary, /created locally/i);

const assignmentCases = [
  { assignmentKind: 'unassigned', expected: undefined },
  { assignmentKind: 'member', assignmentMemberId: 'member-2', expected: 'member' },
  { assignmentKind: 'role', assignmentRoleId: 'scout', expected: 'role' },
  { assignmentKind: 'vehicle', assignmentVehicleId: 'vehicle-1', expected: 'vehicle' },
  { assignmentKind: 'team_unit', assignmentTeamUnitId: 'unit-scout', expected: 'team' },
];
assignmentCases.forEach((assignmentCase, index) => {
  const result = build(makeForm({ ...assignmentCase, draftId: `assignment-${index}` }));
  assert.equal(result.ok, true, `${assignmentCase.assignmentKind} assignment should be supported.`);
  assert.equal(result.command.assignment?.target.kind, assignmentCase.expected);
});

const roleAck = build(makeForm({
  targetKind: 'expedition',
  acknowledgmentMode: 'role',
  acknowledgmentRoleId: 'scout',
  draftId: 'role-ack',
}));
assert.equal(roleAck.ok, true);
assert.equal(roleAck.command.acknowledgmentPolicy.mode, 'all');
assert.equal(roleAck.command.acknowledgmentPolicy.roleId, 'scout');
assert.deepEqual(roleAck.command.acknowledgmentPolicy.targetMemberIds, ['member-2', 'member-3']);

let acknowledged = domain.recordMissionCommandAcknowledgment(roleAck.command, {
  id: 'ack-1',
  idempotencyKey: 'ack-1',
  memberId: 'member-2',
  response: 'acknowledged',
  respondedAt: '2026-07-14T12:05:00.000Z',
});
assert.equal(acknowledged.ok, true);
assert.equal(acknowledged.command.acknowledgmentState, 'partial');
acknowledged = domain.recordMissionCommandAcknowledgment(acknowledged.command, {
  id: 'ack-2',
  idempotencyKey: 'ack-2',
  memberId: 'member-3',
  response: 'acknowledged',
  respondedAt: '2026-07-14T12:06:00.000Z',
});
assert.equal(acknowledged.command.acknowledgmentState, 'complete');

const storageSizeBeforeDenied = storage.size;
const denied = composer.buildMissionCommandFromComposer({
  form: makeForm({ draftId: 'denied' }),
  expeditionId: 'expedition-1',
  actor,
  soloMode: false,
  catalog,
  permissions: deniedPermissions,
  queueDelivery: false,
  now: NOW,
});
assert.equal(denied.ok, false);
assert.ok(denied.issues.some((issue) => issue.field === 'permission'));
assert.equal(storage.size, storageSizeBeforeDenied, 'A denied command build must not mutate persistence.');

const offline = build(makeForm({ draftId: 'offline' }), { queueDelivery: true });
assert.equal(offline.ok, true);
assert.equal(offline.command.deliveryState, 'queued');
assert.equal(offline.event.type, 'queued');
const replay = domain.beginMissionCommandReplay(offline.command, {
  actor,
  occurredAt: '2026-07-14T12:10:00.000Z',
  attemptCount: 1,
});
assert.equal(replay.ok, true);
assert.equal(replay.command.deliveryState, 'sending');
assert.equal(replay.event.type, 'replayed');
assert.match(replay.event.summary, /not yet confirmed/i);

const relativeDeadline = build(makeForm({
  deadlineMode: 'relative',
  relativeDeadlineMinutes: '45',
  draftId: 'relative-deadline',
}));
assert.equal(relativeDeadline.ok, true);
assert.equal(relativeDeadline.command.deadlineAt, '2026-07-14T12:45:00.000Z');
const milestoneDeadline = build(makeForm({
  deadlineMode: 'milestone',
  milestoneId: 'check-in-1',
  draftId: 'milestone-deadline',
}));
assert.equal(milestoneDeadline.ok, true);
assert.equal(milestoneDeadline.command.deadlineAt, '2026-07-14T13:30:00.000Z');
const missionClockDeadline = build(makeForm({
  deadlineMode: 'mission_clock',
  missionClockMinutes: '30',
  draftId: 'mission-clock-deadline',
}));
assert.equal(missionClockDeadline.ok, true);
assert.equal(missionClockDeadline.command.deadlineAt, '2026-07-14T12:30:00.000Z');

const restricted = build(makeForm({
  linkedContextId: 'restricted-member-location',
  draftId: 'restricted-context',
}));
assert.equal(restricted.ok, false);
assert.ok(restricted.issues.some((issue) => /Restricted location/.test(issue.message)));
const sanitizedRestricted = domain.sanitizeMissionCommandLinkedContext(catalog.linkedContexts[1].context);
assert.equal(sanitizedRestricted.restricted, true);
assert.equal(sanitizedRestricted.coordinates, undefined);
assert.equal(sanitizedRestricted.metadata, undefined);
const invalid = build(makeForm({ title: '', instructions: '', draftId: 'invalid' }));
assert.equal(invalid.ok, false);
assert.ok(invalid.issues.some((issue) => issue.field === 'title'));
assert.ok(invalid.issues.some((issue) => issue.field === 'instructions'));

const initial = build(makeForm({ draftId: 'exactly-once' }));
assert.equal(initial.ok, true);
const defaults = { pings: [], queueItems: [], assignments: [], timelineEvents: [] };
dispatchPersistenceAdapter.applyMissionCommandMutation(
  'expedition-1',
  defaults,
  initial.command,
  initial.event,
);
dispatchPersistenceAdapter.applyMissionCommandMutation(
  'expedition-1',
  defaults,
  initial.command,
  initial.event,
);
const persisted = dispatchPersistenceAdapter.load('expedition-1', defaults);
assert.equal(persisted.missionCommands.filter((item) => item.idempotencyKey === initial.command.idempotencyKey).length, 1);
assert.equal(persisted.missionCommandEvents.filter((item) => item.idempotencyKey === initial.event.idempotencyKey).length, 1);

const reassigned = domain.reassignMissionCommand(initial.command, {
  kind: 'member',
  memberId: 'member-2',
  label: 'Scout Two',
}, { actor, occurredAt: '2026-07-14T12:20:00.000Z' });
assert.equal(reassigned.ok, true);
assert.equal(reassigned.event.type, 'assigned');
const repeatedAssignment = domain.reassignMissionCommand(reassigned.command, {
  kind: 'member',
  memberId: 'member-2',
  label: 'Scout Two',
}, { actor, occurredAt: '2026-07-14T12:21:00.000Z' });
assert.equal(repeatedAssignment.changed, false);
const followUp = domain.requestMissionCommandFollowUp(reassigned.command, {
  actor,
  message: 'Report trail status in ten minutes.',
  occurredAt: '2026-07-14T12:22:00.000Z',
  requestId: 'follow-up-1',
});
assert.equal(followUp.ok, true);
assert.equal(followUp.event.type, 'follow_up_requested');

const resolved = domain.transitionMissionCommandOperationalState(initial.command, 'resolved', {
  actor,
  occurredAt: '2026-07-14T12:30:00.000Z',
  resolutionSummary: 'Trail junction cleared.',
});
assert.equal(resolved.ok, true);
const repeatedResolution = domain.transitionMissionCommandOperationalState(resolved.command, 'resolved', {
  actor,
  occurredAt: '2026-07-14T12:31:00.000Z',
});
assert.equal(repeatedResolution.changed, false);

assert.deepEqual(
  ['check_in', 'ping', 'assist', 'rally', 'hazard', 'resource']
    .map((entry) => composer.legacyDispatchComposerEntryToMissionCommandType(entry)),
  ['check_in', 'general', 'assist', 'rally', 'hazard', 'resource'],
  'Every routed legacy composer entry must map into the canonical command workflow.',
);

const composerUi = read('components', 'dispatch', 'DispatchMissionCommandComposer.tsx');
const routedDispatch = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const boardUi = read('components', 'dispatch', 'DispatchMissionCommandBoard.tsx');
assert.match(composerUi, /MISSION_COMMAND_COMPOSER_TYPES\.map/);
assert.match(composerUi, /Check-In[\s\S]*Rally[\s\S]*Assist[\s\S]*Hazard[\s\S]*Resource[\s\S]*Route[\s\S]*Recovery[\s\S]*General/);
assert.match(composerUi, /Selected[\s\S]*Expedition[\s\S]*Vehicle[\s\S]*Self/);
assert.match(composerUi, /Not Required[\s\S]*Any One[\s\S]*All Targets[\s\S]*Role Required[\s\S]*Exact Count/);
assert.match(composerUi, /No Deadline[\s\S]*Absolute[\s\S]*Relative[\s\S]*Mission Clock[\s\S]*Milestone/);
assert.match(composerUi, /ECS team coordination only\. This does not contact emergency services/);
assert.match(routedDispatch, /legacyDispatchComposerEntryToMissionCommandType\(command\)/);
assert.match(routedDispatch, /missionCommandEnabled[\s\S]*openMissionCommandComposer\('recovery'\)[\s\S]*openCommand\('hazard'\)/);
assert.match(routedDispatch, /!missionCommandEnabled && activeCommand === 'hazard'/);
assert.match(routedDispatch, /<DispatchMissionCommandComposer[\s\S]*submitMissionCommandComposer/);
assert.match(routedDispatch, /request_assist'[\s\S]*broadcast_hazard'[\s\S]*send_follow_up'[\s\S]*openMissionCommandComposer/);
assert.match(boardUi, /label=\{soloMode \? 'New Personal Action' : 'New Command'\}/);
assert.match(boardUi, /onReassignCommand/);
assert.match(boardUi, /onRequestFollowUp/);

console.log('Dispatch Mission Command composer domain checks passed.');
