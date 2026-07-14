const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

global.__DEV__ = false;

const originalWarn = console.warn;
console.warn = (...args) => {
  if (String(args[0] ?? '').startsWith('[Supabase] Missing required environment variables')) return;
  originalWarn(...args);
};

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
Module._load = function loadWithNativeStubs(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
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
};

function load(relativePath) {
  return require(path.join(process.cwd(), relativePath));
}

const EXPEDITION_ID = 'mission-canonical-harness';
const CONVOY_ID = '24000000-0000-4000-8000-000000000001';
const USER_LEAD = '14000000-0000-4000-8000-000000000001';
const USER_MEMBER = '14000000-0000-4000-8000-000000000002';
const USER_VIEWER = '14000000-0000-4000-8000-000000000003';
const USER_OUTSIDER = '14000000-0000-4000-8000-000000000004';
const MEMBER_LEAD = '34000000-0000-4000-8000-000000000001';
const MEMBER_MEMBER = '34000000-0000-4000-8000-000000000002';
const MEMBER_VIEWER = '34000000-0000-4000-8000-000000000003';
const CREATED_AT = '2026-07-14T18:00:00.000Z';

const TABLES = [
  'dispatch_pings',
  'dispatch_queue_items',
  'dispatch_assignments',
  'dispatch_assist_requests',
  'dispatch_acknowledgments',
  'dispatch_timeline_events',
  'dispatch_restricted_locations',
  'dispatch_mission_commands',
  'dispatch_mission_command_targets',
  'dispatch_mission_command_acknowledgments',
  'dispatch_mission_command_events',
  'dispatch_mission_playbook_instances',
  'dispatch_mission_playbook_steps',
  'dispatch_mission_playbook_events',
  'dispatch_mission_deadlines',
  'dispatch_mission_incident_links',
];

function at(minutes) {
  return new Date(Date.parse(CREATED_AT) + (minutes * 60_000)).toISOString();
}

function sourceTruth() {
  return {
    id: 'mission-canonical-source',
    origin: 'manual',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS operator',
    authorityKind: 'user',
    observedAt: CREATED_AT,
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: ['manual_source'],
  };
}

function command(overrides = {}) {
  return {
    schemaVersion: 1,
    version: 1,
    id: 'mission-command-canonical-1',
    expeditionId: EXPEDITION_ID,
    creator: { id: MEMBER_LEAD, label: 'LEAD', role: 'owner' },
    type: 'route',
    priority: 'high',
    title: 'Review route blockage',
    instructions: 'Hold at the current safe position and acknowledge.',
    target: { kind: 'team', memberIds: [MEMBER_MEMBER], label: 'Affected team' },
    assignment: {
      id: 'mission-assignment-1',
      target: { kind: 'member', memberId: MEMBER_MEMBER, label: 'TWO' },
      assigneeMemberId: MEMBER_MEMBER,
      status: 'accepted',
      assignedAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    acknowledgmentPolicy: { mode: 'all', targetMemberIds: [MEMBER_MEMBER] },
    deadlineAt: at(60),
    linkedContext: {
      id: 'route-segment-1',
      type: 'route_segment',
      title: 'Blocked route segment',
      coordinates: { latitude: 38.5, longitude: -121.5 },
      observedAt: CREATED_AT,
      accuracyMeters: 12,
      metadata: {
        providerToken: 'must-not-persist',
        note: 'operator report',
      },
    },
    sourceTruth: [sourceTruth()],
    operationalState: 'active',
    deliveryState: 'queued',
    acknowledgmentState: 'pending',
    acknowledgments: [],
    idempotencyKey: 'dispatch:mission_command:canonical-one',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    audit: {
      schemaVersion: 1,
      sourceKind: 'native',
      safetyScope: 'ecs_team_coordination_only',
    },
    ...overrides,
  };
}

function eventFor(value, overrides = {}) {
  return {
    schemaVersion: 1,
    id: `event-${value.id}`,
    idempotencyKey: `dispatch:mission_command_event:${value.id}:created`,
    commandId: value.id,
    expeditionId: value.expeditionId,
    type: 'created',
    actor: value.creator,
    occurredAt: value.createdAt,
    summary: 'Mission Command created.',
    operationalState: value.operationalState,
    deliveryState: value.deliveryState,
    acknowledgmentState: value.acknowledgmentState,
    ...overrides,
  };
}

function defaults() {
  return {
    pings: [],
    queueItems: [],
    assignments: [],
    assistRequests: [],
    acknowledgments: [],
    timelineEvents: [],
    offlineActions: [],
    cadEvents: [],
    missionCommands: [],
    missionCommandEvents: [],
    guardianCheckIns: [],
    operationalPlaybooks: [],
  };
}

function snapshot(overrides = {}) {
  return {
    version: 7,
    expeditionId: EXPEDITION_ID,
    ...defaults(),
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function success(data) {
  return { ok: true, data };
}

function failure(code, error) {
  return { ok: false, code, error };
}

function comparable(row) {
  const copy = { ...row };
  delete copy.id;
  delete copy.client_operation_id;
  delete copy.server_revision;
  delete copy.server_observed_at;
  delete copy.created_at;
  delete copy.updated_at;
  return JSON.stringify(copy);
}

class SharedState {
  constructor() {
    this.tables = new Map(TABLES.map((table) => [table, []]));
    this.members = [
      { id: MEMBER_LEAD, userId: USER_LEAD, callsign: 'LEAD', role: 'lead', missionCommandAccess: 'inherit', revokedAt: null },
      { id: MEMBER_MEMBER, userId: USER_MEMBER, callsign: 'TWO', role: 'member', missionCommandAccess: 'member', revokedAt: null },
      { id: MEMBER_VIEWER, userId: USER_VIEWER, callsign: 'VIEW', role: 'member', missionCommandAccess: 'viewer', revokedAt: null },
    ];
    this.revision = 0;
    this.idCounter = 0;
    this.subscribers = new Set();
  }

  rows(table) {
    return this.tables.get(table);
  }

  nextId() {
    this.idCounter += 1;
    return `54000000-0000-4000-8000-${String(this.idCounter).padStart(12, '0')}`;
  }

  emit() {
    this.subscribers.forEach((listener) => listener());
  }
}

class InMemoryBackend {
  constructor(shared, userId) {
    this.shared = shared;
    this.userId = userId;
  }

  activeMember() {
    return this.shared.members.find((item) => item.userId === this.userId && !item.revokedAt) ?? null;
  }

  effectiveAccess(member) {
    if (member.missionCommandAccess !== 'inherit') return member.missionCommandAccess;
    return ['lead', 'sweep', 'support'].includes(member.role) ? 'command' : 'member';
  }

  isAvailable() {
    return true;
  }

  async getCurrentUserId() {
    return success(this.userId);
  }

  async listMembers(convoyId) {
    if (convoyId !== CONVOY_ID || !this.activeMember()) return failure('permission_denied', 'RLS membership denied');
    return success(this.shared.members.map((item) => ({ ...item })));
  }

  async getOwnMember(context) {
    const member = this.activeMember();
    if (!member || context.expeditionId !== EXPEDITION_ID || context.convoyId !== CONVOY_ID) {
      return failure('permission_denied', 'RLS actor denied');
    }
    return success({ ...member });
  }

  async findRowByClientId(table, context, clientId) {
    if (!this.activeMember()) return failure('permission_denied', 'RLS read denied');
    const row = this.shared.rows(table).find((item) => (
      item.expedition_id === context.expeditionId
      && item.convoy_id === context.convoyId
      && item.client_id === clientId
    ));
    return success(row ? { ...row } : null);
  }

  async upsertRow(table, row, options) {
    const actor = this.activeMember();
    if (!actor || row.actor_user_id !== this.userId || row.actor_member_id !== actor.id) {
      return failure('permission_denied', 'RLS actor identity denied');
    }
    if (row.expedition_id !== EXPEDITION_ID || row.convoy_id !== CONVOY_ID) {
      return failure('scope_mismatch', 'Mission scope mismatch');
    }
    const access = this.effectiveAccess(actor);
    if (access === 'viewer' && table.startsWith('dispatch_mission_')) {
      return failure('permission_denied', 'Mission viewer is read-only');
    }
    if (table === 'dispatch_restricted_locations' && row.source_kind === 'mission_command' && access === 'viewer') {
      return failure('permission_denied', 'Mission viewer cannot write a restricted location');
    }
    if (table === 'dispatch_mission_commands' && access !== 'command') {
      if (!['check_in', 'assist'].includes(row.command_type) || row.assignment_kind) {
        return failure('permission_denied', 'Mission member cannot issue or assign this command');
      }
    }
    if (
      table !== 'dispatch_mission_commands'
      && table !== 'dispatch_mission_command_acknowledgments'
      && table !== 'dispatch_mission_command_events'
      && table !== 'dispatch_restricted_locations'
      && access !== 'command'
    ) {
      return failure('permission_denied', 'Mission command role required');
    }
    if (table === 'dispatch_mission_command_acknowledgments' && row.member_id !== actor.id) {
      return failure('permission_denied', 'Acknowledgments are own-member only');
    }
    if (
      table === 'dispatch_mission_command_events'
      && access !== 'command'
      && !['acknowledged', 'declined'].includes(row.event_type)
    ) {
      return failure('permission_denied', 'Member event type denied');
    }

    const rows = this.shared.rows(table);
    const conflictColumns = options.conflictColumns.split(',');
    const existingIndex = rows.findIndex((candidate) => (
      conflictColumns.every((column) => candidate[column] === row[column])
    ));
    if (existingIndex >= 0) {
      const existing = rows[existingIndex];
      if (options.immutable || comparable(existing) === comparable(row)) {
        return success({ id: existing.id, serverRevision: existing.server_revision });
      }
      const incomingVersion = Number(row.state_version ?? 1);
      const existingVersion = Number(existing.state_version ?? 1);
      if (incomingVersion < existingVersion) return failure('stale_version', 'stale Mission version');
      if (incomingVersion === existingVersion) return failure('conflict', 'Mission version conflict');
      this.shared.revision += 1;
      rows[existingIndex] = {
        ...existing,
        ...row,
        server_revision: this.shared.revision,
        server_observed_at: at(this.shared.revision),
        updated_at: at(this.shared.revision),
      };
      this.shared.emit();
      return success({ id: existing.id, serverRevision: this.shared.revision });
    }

    this.shared.revision += 1;
    const stored = {
      ...row,
      id: this.shared.nextId(),
      server_revision: this.shared.revision,
      server_observed_at: at(this.shared.revision),
      created_at: at(this.shared.revision),
      updated_at: at(this.shared.revision),
    };
    rows.push(stored);
    this.shared.emit();
    return success({ id: stored.id, serverRevision: stored.server_revision });
  }

  async fetchRows(table, context, limit) {
    if (!this.activeMember()) return failure('permission_denied', 'RLS read denied');
    if (context.expeditionId !== EXPEDITION_ID || context.convoyId !== CONVOY_ID) {
      return failure('scope_mismatch', 'Mission scope mismatch');
    }
    return success(this.shared.rows(table).slice(0, limit).map((item) => ({ ...item })));
  }

  subscribe(context, handlers) {
    if (!this.activeMember() || context.expeditionId !== EXPEDITION_ID || context.convoyId !== CONVOY_ID) {
      handlers.onStatus('degraded', 'RLS subscription denied');
      return { unsubscribe() {} };
    }
    const listener = () => handlers.onChange();
    this.shared.subscribers.add(listener);
    handlers.onStatus('connected');
    return {
      unsubscribe: () => {
        this.shared.subscribers.delete(listener);
        handlers.onStatus('disconnected');
      },
    };
  }
}

function playbook(domain) {
  const definition = {
    schemaVersion: 1,
    id: 'mission-canonical-test-playbook',
    version: 1,
    title: 'Canonical Test Playbook',
    description: 'Deterministic test playbook.',
    supportedScenario: 'canonical_test',
    requiredCapabilities: [],
    requiredPermissions: ['view_dispatch'],
    requiredInputs: [],
    optionalInputs: [],
    steps: [{
      id: 'confirm-action',
      type: 'confirm_action',
      title: 'Confirm action',
      instructions: 'Confirm the operator-reviewed action.',
      requiredInputKeys: [],
      requiredPermissions: ['view_dispatch'],
      dependsOnStepIds: [],
      skippable: false,
      confirmationLabel: 'Confirm operator-reviewed action',
    }],
    completionRules: { mode: 'all_required_steps', requiredStepIds: ['confirm-action'] },
    cancellationRules: { allowedStates: ['draft', 'ready', 'active'], requireReason: true },
    safetyScope: 'ecs_team_coordination_only',
  };
  return domain.createOperationalPlaybookInstance(definition, {
    expeditionId: EXPEDITION_ID,
    actor: { id: MEMBER_LEAD, label: 'LEAD', role: 'owner' },
    sourceTruth: [sourceTruth()],
    idempotencyKey: 'dispatch:mission_playbook:canonical-one',
    createdAt: CREATED_AT,
    online: false,
  });
}

async function main() {
  const repositoryModule = load('lib/dispatchCanonicalRepository.ts');
  const coordinatorModule = load('lib/dispatchCanonicalMigrationCoordinator.ts');
  const adapter = load('lib/dispatchMissionCommandCanonicalAdapter.ts');
  const playbookDomain = load('lib/dispatchOperationalPlaybookDomain.ts');
  const rollout = load('lib/dispatchRolloutConfig.ts');
  const { dispatchPersistenceAdapter } = load('lib/dispatchPersistenceAdapter.ts');
  const { replayQueuedDispatchActions } = load('lib/dispatchOfflineReplayAdapter.ts');

  assert.strictEqual(rollout.DEFAULT_DISPATCH_ROLLOUT_CONFIG.missionCommandCanonicalPersistence, false);
  assert.strictEqual(
    rollout.resolveDispatchMissionCanonicalBackendMode({
      ...rollout.DEFAULT_DISPATCH_ROLLOUT_CONFIG,
      missionCommand: true,
      canonicalBackendPersistence: true,
      missionCommandCanonicalPersistence: true,
    }, undefined),
    'disabled',
    'Missing Mission backend mode must fail closed.',
  );
  assert.strictEqual(
    rollout.resolveDispatchMissionCanonicalBackendMode({
      ...rollout.DEFAULT_DISPATCH_ROLLOUT_CONFIG,
      missionCommand: true,
      canonicalBackendPersistence: true,
      missionCommandCanonicalPersistence: true,
    }, 'shadow'),
    'shadow',
  );
  assert.strictEqual(
    rollout.resolveDispatchMissionCanonicalBackendMode({
      ...rollout.DEFAULT_DISPATCH_ROLLOUT_CONFIG,
      missionCommand: true,
      canonicalBackendPersistence: true,
      missionCommandCanonicalPersistence: true,
    }, 'dual_read'),
    'disabled',
    'Mission backend cannot influence product reads in this rollout.',
  );

  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260714195656_mission_command_canonical_persistence.sql'),
    'utf8',
  );
  const rollback = fs.readFileSync(
    path.join(process.cwd(), 'supabase/rollback/20260714195656_mission_command_canonical_persistence.sql'),
    'utf8',
  );
  for (const table of TABLES.filter((item) => item.startsWith('dispatch_mission_'))) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /mission_command_access[\s\S]+viewer/);
  assert.match(migration, /dispatch_mission_has_command_role/);
  assert.match(migration, /dispatch_mission_can_participate/);
  assert.match(migration, /dispatch_mission_location_insert_non_viewer/);
  assert.match(migration, /dispatch_mission_state_version_conflict/);
  assert.match(migration, /dispatch_mission_immutable_command_event/);
  assert.match(migration, /client_operation_id/);
  assert.doesNotMatch(migration, /service[_-]?role[_-]?key|eyJ[a-z0-9._-]+/i);
  assert.match(rollback, /drop table if exists public\.dispatch_mission_commands/);
  assert.match(rollback, /drop column if exists mission_command_access/);
  assert.doesNotMatch(rollback, /drop table if exists public\.dispatch_pings/);

  const shared = new SharedState();
  const leadRepository = new repositoryModule.DispatchCanonicalRepository(new InMemoryBackend(shared, USER_LEAD));
  const memberRepository = new repositoryModule.DispatchCanonicalRepository(new InMemoryBackend(shared, USER_MEMBER));
  const viewerRepository = new repositoryModule.DispatchCanonicalRepository(new InMemoryBackend(shared, USER_VIEWER));
  const outsiderRepository = new repositoryModule.DispatchCanonicalRepository(new InMemoryBackend(shared, USER_OUTSIDER));
  const leadContext = { expeditionId: EXPEDITION_ID, convoyId: CONVOY_ID, actorUserId: USER_LEAD };
  const memberContext = { expeditionId: EXPEDITION_ID, convoyId: CONVOY_ID, actorUserId: USER_MEMBER };
  const viewerContext = { expeditionId: EXPEDITION_ID, convoyId: CONVOY_ID, actorUserId: USER_VIEWER };

  const localCommand = command();
  const plan = adapter.buildMissionCommandCanonicalPlan({
    expeditionId: EXPEDITION_ID,
    convoyId: CONVOY_ID,
    actorUserId: USER_LEAD,
    actorMember: shared.members[0],
    members: shared.members,
    command: localCommand,
    sanitize: repositoryModule.redactDispatchCanonicalPayload,
  });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.data.parent.row.client_operation_id, localCommand.idempotencyKey);
  assert.strictEqual(plan.data.parent.row.linked_context.coordinates, undefined);
  assert.strictEqual(plan.data.parent.row.linked_context.metadata.providerToken, undefined);
  assert.strictEqual(plan.data.restrictedLocation('canonical-parent').latitude, 38.5);
  assert.deepStrictEqual(
    plan.data.restrictedLocation('canonical-parent').authorizedMemberIds.sort(),
    [MEMBER_LEAD, MEMBER_MEMBER].sort(),
  );

  const created = await leadRepository.upsertEntity(
    leadContext,
    { type: 'mission_command', value: localCommand },
    'offline-operation-mission-command-1',
  );
  assert.strictEqual(created.ok, true);
  const repeated = await leadRepository.upsertEntity(
    leadContext,
    { type: 'mission_command', value: localCommand },
    'offline-operation-mission-command-1',
  );
  assert.strictEqual(repeated.ok, true);
  assert.strictEqual(shared.rows('dispatch_mission_commands').length, 1);
  assert.strictEqual(
    shared.rows('dispatch_mission_commands')[0].client_operation_id,
    'offline-operation-mission-command-1',
  );
  assert.strictEqual(shared.rows('dispatch_restricted_locations').length, 1);
  assert.strictEqual(shared.rows('dispatch_mission_command_targets').length, 1);
  assert.strictEqual(shared.rows('dispatch_mission_deadlines').length, 1);

  const memberAcknowledgment = {
    ...localCommand,
    version: 2,
    updatedAt: at(5),
    acknowledgments: [{
      id: 'mission-ack-member',
      idempotencyKey: 'dispatch:mission_ack:member',
      memberId: MEMBER_MEMBER,
      response: 'acknowledged',
      respondedAt: at(5),
    }],
    acknowledgmentState: 'complete',
  };
  const acknowledged = await memberRepository.upsertEntity(memberContext, {
    type: 'mission_command',
    value: memberAcknowledgment,
  });
  assert.strictEqual(acknowledged.ok, true);
  assert.strictEqual(shared.rows('dispatch_mission_command_acknowledgments').length, 1);
  assert.strictEqual(shared.rows('dispatch_mission_commands')[0].state_version, 1, 'Member acknowledgment cannot replace command state.');

  const viewerAck = await viewerRepository.upsertEntity(viewerContext, {
    type: 'mission_command',
    value: {
      ...memberAcknowledgment,
      acknowledgments: [{
        id: 'mission-ack-viewer',
        idempotencyKey: 'dispatch:mission_ack:viewer',
        memberId: MEMBER_VIEWER,
        response: 'acknowledged',
        respondedAt: at(6),
      }],
    },
  });
  assert.strictEqual(viewerAck.ok, false);
  assert.strictEqual(viewerAck.code, 'permission_denied');

  const outsiderWrite = await outsiderRepository.upsertEntity(
    { expeditionId: EXPEDITION_ID, convoyId: CONVOY_ID, actorUserId: USER_OUTSIDER },
    { type: 'mission_command', value: localCommand },
  );
  assert.strictEqual(outsiderWrite.ok, false);
  assert.strictEqual(outsiderWrite.code, 'permission_denied');
  const wrongScope = await leadRepository.upsertEntity(
    { expeditionId: 'wrong-expedition', convoyId: CONVOY_ID, actorUserId: USER_LEAD },
    { type: 'mission_command', value: localCommand },
  );
  assert.strictEqual(wrongScope.ok, false);
  assert.strictEqual(wrongScope.code, 'scope_mismatch');

  const memberEvent = eventFor(memberAcknowledgment, {
    id: 'event-member-ack',
    idempotencyKey: 'dispatch:mission_event:member-ack',
    type: 'acknowledged',
    actor: { id: MEMBER_MEMBER, label: 'TWO', role: 'member' },
    occurredAt: at(5),
    summary: 'TWO acknowledged.',
  });
  const eventStored = await memberRepository.upsertEntity(memberContext, {
    type: 'mission_command_event',
    value: memberEvent,
  });
  assert.strictEqual(eventStored.ok, true);
  const eventRepeated = await memberRepository.upsertEntity(memberContext, {
    type: 'mission_command_event',
    value: memberEvent,
  });
  assert.strictEqual(eventRepeated.ok, true);
  assert.strictEqual(shared.rows('dispatch_mission_command_events').length, 1);

  const instance = playbook(playbookDomain);
  const playbookStored = await leadRepository.upsertEntity(leadContext, {
    type: 'mission_playbook_instance',
    value: instance,
  });
  assert.strictEqual(playbookStored.ok, true);
  assert.strictEqual(shared.rows('dispatch_mission_playbook_instances').length, 1);
  assert.strictEqual(shared.rows('dispatch_mission_playbook_events').length, 1);

  const pulled = await leadRepository.pullExpedition(leadContext);
  assert.strictEqual(pulled.ok, true);
  assert.strictEqual(pulled.data.missionCommands.length, 1);
  assert.strictEqual(pulled.data.missionCommandEvents.length, 1);
  assert.strictEqual(pulled.data.operationalPlaybooks.length, 1);
  assert.strictEqual(
    pulled.data.missionCommands[0].linkedContext.coordinates,
    undefined,
    'Restricted coordinates must not leak into the canonical command aggregate.',
  );
  assert.strictEqual(shared.rows('dispatch_restricted_locations')[0].latitude, 38.5);

  const shadowCoordinator = new coordinatorModule.DispatchCanonicalMigrationCoordinator(
    'disabled',
    leadRepository,
    'shadow',
  );
  const shadowHydration = await shadowCoordinator.hydrate(leadContext, snapshot());
  assert.strictEqual(shadowHydration.applied, false);
  assert.strictEqual(shadowHydration.snapshot.missionCommands.length, 0);
  assert.ok(shadowHydration.shadowDifferenceCount >= 3);
  const explicitMerge = coordinatorModule.reconcileCanonicalDispatchSnapshot(
    snapshot(),
    pulled.data,
    { includeMissionCommand: true },
  );
  assert.strictEqual(explicitMerge.missionCommands.length, 1);
  assert.strictEqual(explicitMerge.operationalPlaybooks.length, 1);

  const migrationResult = await shadowCoordinator.migrateLocalMissionSnapshot(
    leadContext,
    snapshot({
      missionCommands: [localCommand],
      missionCommandEvents: [eventFor(localCommand)],
      operationalPlaybooks: [instance],
    }),
  );
  assert.strictEqual(migrationResult.failed, 0);
  assert.strictEqual(migrationResult.applied, 3);
  assert.strictEqual(shadowCoordinator.getDiagnostics().missionMode, 'shadow');

  const replayCommand = command({
    id: 'mission-command-shadow-replay',
    idempotencyKey: 'dispatch:mission_command:shadow-replay',
    assignment: undefined,
    type: 'check_in',
  });
  dispatchPersistenceAdapter.applyMissionCommandMutation(
    EXPEDITION_ID,
    defaults(),
    replayCommand,
    eventFor(replayCommand, {
      id: 'event-shadow-replay',
      idempotencyKey: 'dispatch:mission_event:shadow-replay',
    }),
  );
  let canonicalAttempts = 0;
  let canonicalInFlight = 0;
  let maxCanonicalInFlight = 0;
  let resolveCanonicalShadow;
  const canonicalShadowSettled = new Promise((resolve) => {
    resolveCanonicalShadow = resolve;
  });
  const canonicalShadowOrder = [];
  const published = [];
  const replayResult = await replayQueuedDispatchActions({
    expeditionId: EXPEDITION_ID,
    defaults: defaults(),
    publish: async (draft) => {
      published.push(draft.type);
      return true;
    },
    persistCanonicalEntity: async (entity) => {
      canonicalAttempts += 1;
      canonicalShadowOrder.push(entity.type);
      canonicalInFlight += 1;
      maxCanonicalInFlight = Math.max(maxCanonicalInFlight, canonicalInFlight);
      await Promise.resolve();
      canonicalInFlight -= 1;
      if (canonicalAttempts === 2) resolveCanonicalShadow();
      throw new Error('synthetic shadow backend outage');
    },
    entityTypes: ['mission_command', 'mission_command_event'],
    now: () => Date.parse(at(20)),
  });
  await Promise.race([
    canonicalShadowSettled,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('Mission shadow writes did not settle.')),
      250,
    )),
  ]);
  assert.strictEqual(replayResult.failed, 0, 'Shadow persistence failure cannot fail operational delivery.');
  assert.strictEqual(replayResult.replayed, 2);
  assert.deepStrictEqual(published, ['mission_command_upsert', 'mission_command_event_added']);
  assert.strictEqual(canonicalAttempts, 2);
  assert.deepStrictEqual(
    canonicalShadowOrder,
    ['mission_command', 'mission_command_event'],
    'Shadow writes must preserve command-before-event dependency order.',
  );
  assert.strictEqual(maxCanonicalInFlight, 1, 'Mission shadow writes must not overlap per expedition.');

  const playbookSnapshot = dispatchPersistenceAdapter.upsertOperationalPlaybook(
    EXPEDITION_ID,
    defaults(),
    instance,
  );
  assert.strictEqual(
    playbookSnapshot.offlineActions.filter((action) => action.entityType === 'mission_playbook_instance').length,
    1,
    'Playbook writes must have one durable canonical/realtime outbox operation.',
  );
  assert.strictEqual(playbookSnapshot.version, 7);

  console.log(JSON.stringify({
    suite: 'dispatch-mission-command-canonical-backend',
    status: 'passed',
    evidence: 'deterministic in-memory multi-identity simulation; real pgTAP remains separate',
    metrics: {
      canonicalTables: TABLES.filter((item) => item.startsWith('dispatch_mission_')).length,
      shadowDifferences: shadowHydration.shadowDifferenceCount,
      replayedOperations: replayResult.replayed,
      canonicalShadowAttempts: canonicalAttempts,
    },
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
