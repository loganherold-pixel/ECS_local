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
  get length() { return storage.size; },
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
const composer = require(path.join(root, 'lib', 'dispatchMissionCommandComposer.ts'));
const soloDomain = require(path.join(root, 'lib', 'dispatchMissionCommandSolo.ts'));
const commandDomain = require(path.join(root, 'lib', 'dispatchMissionCommandDomain.ts'));
const presentation = require(path.join(root, 'lib', 'dispatchMissionCommandPresentation.ts'));
const { dispatchPersistenceAdapter } = require(path.join(root, 'lib', 'dispatchPersistenceAdapter.ts'));

const NOW = '2026-07-14T12:00:00.000Z';
const actor = { id: 'solo-operator', label: 'Solo Operator', role: 'owner' };
const permissions = {
  roleLabel: 'Solo operator',
  disabledReason: 'Permission denied.',
  can: () => ({ allowed: true, safetyCopy: 'Local ECS coordination only.' }),
};
const catalog = {
  members: [], roles: [], vehicles: [], teamUnits: [], linkedContexts: [], milestones: [],
};
const defaults = {
  pings: [], queueItems: [], assignments: [], assistRequests: [], acknowledgments: [],
  timelineEvents: [], offlineActions: [], cadEvents: [], missionCommands: [],
  missionCommandEvents: [], operationalPlaybooks: [], guardianCheckIns: [],
};

function baseForm(draftId) {
  return composer.createMissionCommandComposerForm({
    actorId: actor.id,
    soloMode: true,
    members: [],
    draftId,
  });
}

function buildPersonalAction(form) {
  return composer.buildMissionCommandFromComposer({
    form,
    expeditionId: 'solo-local-workspace',
    actor,
    soloMode: true,
    catalog,
    permissions,
    queueDelivery: true,
    now: NOW,
  });
}

assert.deepEqual(
  soloDomain.SOLO_MISSION_COMMAND_TEMPLATES.map((template) => template.id),
  [
    'personal_action',
    'camp_diversion',
    'resource_review',
    'weather_recheck',
    'route_decision',
    'comms_plan_review',
  ],
);

for (const template of soloDomain.SOLO_MISSION_COMMAND_TEMPLATES) {
  const form = soloDomain.applySoloMissionCommandTemplate(baseForm(`solo-template:${template.id}`), template.id);
  assert.equal(form.targetKind, 'self');
  assert.equal(form.assignmentKind, 'unassigned');
  assert.equal(form.acknowledgmentMode, 'none');
  assert.equal(form.type, template.type);
  assert.ok(form.instructions.length > 0);
  const result = buildPersonalAction(form);
  assert.equal(result.ok, true, `${template.id} should build a personal action.`);
  assert.equal(result.command.target.kind, 'solo');
  assert.equal(result.command.deliveryState, 'local');
  assert.equal(result.command.acknowledgmentState, 'not_required');
  assert.equal(result.event.type, 'created');
  assert.doesNotMatch(result.event.summary, /sent|delivered|queued/i);
  if (template.deadlineMinutes == null) {
    assert.equal(result.command.deadlineAt, undefined);
  } else {
    assert.equal(
      result.command.deadlineAt,
      new Date(Date.parse(NOW) + template.deadlineMinutes * 60_000).toISOString(),
    );
  }
}

const staleRosterCatalog = {
  ...catalog,
  members: [{ id: 'stale-member', label: 'Stale Member' }],
};
const staleMemberTarget = composer.buildMissionCommandFromComposer({
  form: {
    ...soloDomain.applySoloMissionCommandTemplate(baseForm('solo-stale-member-target'), 'personal_action'),
    targetKind: 'member',
    targetMemberId: 'stale-member',
  },
  expeditionId: 'solo-local-workspace',
  actor,
  soloMode: true,
  catalog: staleRosterCatalog,
  permissions,
  queueDelivery: true,
  now: NOW,
});
assert.equal(staleMemberTarget.ok, false, 'A stale roster must not create a recipient in solo mode.');
assert.match(staleMemberTarget.issues[0].message, /only self-targeted local actions/i);

const staleAssignment = composer.buildMissionCommandFromComposer({
  form: {
    ...soloDomain.applySoloMissionCommandTemplate(baseForm('solo-stale-assignment'), 'personal_action'),
    assignmentKind: 'member',
    assignmentMemberId: 'stale-member',
    acknowledgmentMode: 'all',
  },
  expeditionId: 'solo-local-workspace',
  actor,
  soloMode: true,
  catalog: staleRosterCatalog,
  permissions,
  queueDelivery: true,
  now: NOW,
});
assert.equal(staleAssignment.ok, true);
assert.equal(staleAssignment.command.assignment, undefined);
assert.equal(staleAssignment.command.acknowledgmentPolicy.mode, 'none');

const reminderForm = soloDomain.applySoloMissionCommandTemplate(
  baseForm('solo-offline-restart'),
  'weather_recheck',
);
const reminderResult = buildPersonalAction(reminderForm);
assert.equal(reminderResult.ok, true);
dispatchPersistenceAdapter.applyMissionCommandMutation(
  'solo-local-workspace',
  defaults,
  reminderResult.command,
  reminderResult.event,
);
dispatchPersistenceAdapter.applyMissionCommandMutation(
  'solo-local-workspace',
  defaults,
  reminderResult.command,
  reminderResult.event,
);

const restored = dispatchPersistenceAdapter.loadResult('solo-local-workspace', defaults);
assert.equal(restored.snapshot.missionCommands.length, 1, 'Repeated offline writes must remain idempotent.');
assert.equal(restored.snapshot.missionCommandEvents.length, 1);
assert.equal(restored.snapshot.missionCommands[0].deliveryState, 'local');

const soloBoard = presentation.buildMissionCommandBoardPresentation({
  commands: restored.snapshot.missionCommands,
  events: restored.snapshot.missionCommandEvents,
  now: NOW,
  enabled: true,
  hasActiveExpedition: false,
  soloMode: true,
  canViewCommands: true,
  canManageCommands: true,
  canViewLinkedContext: true,
  connectivity: {
    online: false,
    offlineMode: true,
    realtimeStatus: 'closed',
    queuedCount: 3,
  },
  convoy: { permitted: false, active: false, memberCount: 0, staleCount: 0 },
  persistenceStatus: 'ready',
});
assert.equal(soloBoard.degradedState.kind, 'solo');
assert.match(soloBoard.degradedState.title, /personal mission command/i);
assert.doesNotMatch(soloBoard.degradedState.detail, /coordinate team commands/i);
assert.equal(soloBoard.summary.connectionLabel, 'Offline / local only');
assert.equal(soloBoard.summary.convoyLabel, 'Personal workspace');
assert.equal(soloBoard.sections.inProgress.title, 'Personal Actions');
const personalCard = soloBoard.sections.inProgress.items[0];
assert.match(personalCard.targetLabel, /you/i);
assert.equal(personalCard.deliveryLabel, 'Local device only');
assert.equal(personalCard.acknowledgmentLabel, 'Local completion');
assert.equal(personalCard.allowedActions.some((action) => action.label === 'Add Status Note'), true);
assert.equal(personalCard.allowedActions.some((action) => action.label === 'Reassign'), false);

const soloExpeditionBoard = presentation.buildMissionCommandBoardPresentation({
  commands: restored.snapshot.missionCommands,
  events: restored.snapshot.missionCommandEvents,
  now: NOW,
  enabled: true,
  hasActiveExpedition: true,
  soloMode: true,
  canViewCommands: true,
  canManageCommands: true,
  canViewLinkedContext: true,
  connectivity: { online: true, offlineMode: false, realtimeStatus: 'connected', queuedCount: 0 },
  convoy: { permitted: true, active: false, memberCount: 0, staleCount: 0 },
  persistenceStatus: 'ready',
});
assert.equal(soloExpeditionBoard.degradedState.kind, 'solo');
assert.equal(soloExpeditionBoard.summary.connectionLabel, 'Local only');

const statusNote = commandDomain.requestMissionCommandFollowUp(reminderResult.command, {
  actor,
  message: 'Weather reviewed from the cached offline snapshot.',
  occurredAt: '2026-07-14T12:03:00.000Z',
  requestId: 'solo-manual-status-note',
});
assert.equal(statusNote.ok, true);
assert.equal(statusNote.command.deliveryState, 'local');
assert.match(statusNote.event.summary, /manual status note/i);
assert.doesNotMatch(statusNote.event.summary, /requested|sent|delivered/i);

const noTeamConversion = soloDomain.prepareSoloMissionCommandForTeam({
  command: reminderResult.command,
  actor,
  teamMemberIds: [actor.id],
  occurredAt: '2026-07-14T12:05:00.000Z',
});
assert.equal(noTeamConversion.ok, false);

const conversion = soloDomain.prepareSoloMissionCommandForTeam({
  command: reminderResult.command,
  actor,
  teamMemberIds: [actor.id, 'member-2', 'member-2'],
  occurredAt: '2026-07-14T12:05:00.000Z',
});
assert.equal(conversion.ok, true);
assert.equal(conversion.changed, true);
assert.equal(conversion.command.id, reminderResult.command.id, 'Team preparation must preserve command identity.');
assert.equal(conversion.command.target.kind, 'team');
assert.deepEqual(conversion.command.target.memberIds, ['member-2', actor.id]);
assert.equal(conversion.command.deliveryState, 'local');
assert.equal(conversion.command.operationalState, 'blocked');
assert.deepEqual(conversion.command.acknowledgmentPolicy.targetMemberIds, ['member-2']);
assert.match(conversion.event.summary, /no delivery has been claimed/i);

dispatchPersistenceAdapter.applyMissionCommandMutation(
  'solo-local-workspace', defaults, conversion.command, conversion.event,
);
dispatchPersistenceAdapter.applyMissionCommandMutation(
  'solo-local-workspace', defaults, conversion.command, conversion.event,
);
const joinedTeam = dispatchPersistenceAdapter.load('solo-local-workspace', defaults);
assert.equal(joinedTeam.missionCommands.length, 1, 'Joining a team must not duplicate the personal command.');
assert.equal(joinedTeam.missionCommandEvents.length, 2, 'Repeated conversion must not duplicate audit events.');
assert.equal(joinedTeam.missionCommands[0].deliveryState, 'local');
const repeatedConversion = soloDomain.prepareSoloMissionCommandForTeam({
  command: joinedTeam.missionCommands[0], actor, teamMemberIds: [actor.id, 'member-2'],
});
assert.equal(repeatedConversion.ok, true);
assert.equal(repeatedConversion.changed, false);

const boardSource = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchMissionCommandBoard.tsx'), 'utf8');
const composerSource = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchMissionCommandComposer.tsx'), 'utf8');
assert.match(boardSource, /Personal Board/);
assert.match(boardSource, /Comms Plan/);
assert.match(boardSource, /!soloMode\s*&&\s*canCreateCommands\s*&&\s*onOpenLostCommunications/);
assert.match(boardSource, /!soloMode\s*&&\s*canCreateCommands\s*&&\s*onOpenSmartRally/);
assert.match(boardSource, /onOpenVehicleImmobilized/);
assert.match(boardSource, /onOpenRouteBlockage/);
assert.match(boardSource, /onOpenIncidentRoom/);
assert.match(boardSource, /\(!hasActiveExpedition && !soloMode\)/);
assert.match(composerSource, /SOLO_MISSION_COMMAND_TEMPLATES/);
assert.match(composerSource, /Save Personal Action/);
assert.match(composerSource, /No other person is monitoring/);

console.log('Dispatch solo Mission Command checks passed.');
