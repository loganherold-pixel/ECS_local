const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { performance } = require('perf_hooks');
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
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
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

const EXPEDITION_ID = 'dispatch-canonical-harness';
const CONVOY_ID = '22000000-0000-4000-8000-000000000001';
const USER_A = '12000000-0000-4000-8000-000000000001';
const USER_B = '12000000-0000-4000-8000-000000000002';
const USER_OUTSIDER = '12000000-0000-4000-8000-000000000003';
const MEMBER_A = '32000000-0000-4000-8000-000000000001';
const MEMBER_B = '32000000-0000-4000-8000-000000000002';
const TABLES = [
  'dispatch_pings',
  'dispatch_queue_items',
  'dispatch_assignments',
  'dispatch_assist_requests',
  'dispatch_acknowledgments',
  'dispatch_timeline_events',
  'dispatch_restricted_locations',
];

function timestamp(index = 0) {
  return new Date(Date.UTC(2026, 6, 12, 18, 0, index)).toISOString();
}

function success(data) {
  return { ok: true, data };
}

function failure(code, error) {
  return { ok: false, code, error };
}

function snapshot(overrides = {}) {
  return {
    version: 2,
    expeditionId: EXPEDITION_ID,
    pings: [],
    queueItems: [],
    assignments: [],
    assistRequests: [],
    acknowledgments: [],
    timelineEvents: [],
    offlineActions: [],
    cadEvents: [],
    updatedAt: timestamp(),
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
  };
}

function ping(overrides = {}) {
  return {
    id: 'ping-canonical-1',
    idempotencyKey: 'dispatch:canonical:ping:1',
    version: 1,
    type: 'check_in',
    priority: 'high',
    status: 'queued',
    operationalState: 'awaiting_acknowledgment',
    message: 'Confirm convoy status.',
    createdAt: timestamp(1),
    updatedAt: timestamp(1),
    createdByMemberId: MEMBER_A,
    targetMemberIds: ['TWO'],
    linkedContext: {
      id: 'route-context-1',
      type: 'route',
      title: 'Route context',
      coordinates: { latitude: 38.5, longitude: -121.5 },
      metadata: {
        api_key: 'must-not-persist',
        providerToken: 'must-not-persist',
        clientSecret: 'must-not-persist',
        gps: { latitude: 38.5, longitude: -121.5 },
        note: 'safe',
      },
    },
    escalationState: 'none',
    requiresAcknowledgment: true,
    ...overrides,
  };
}

function acknowledgment(overrides = {}) {
  return {
    id: 'ack-canonical-1',
    idempotencyKey: 'dispatch:canonical:ack:1',
    version: 1,
    pingId: 'ping-canonical-1',
    memberId: MEMBER_B,
    status: 'acknowledged',
    acknowledgedAt: timestamp(5),
    updatedAt: timestamp(5),
    message: 'Status confirmed.',
    deliveryState: 'queued',
    ...overrides,
  };
}

function timeline(index) {
  return {
    id: `timeline-canonical-${index}`,
    idempotencyKey: `dispatch:canonical:timeline:${index}`,
    version: 1,
    type: 'log',
    title: `Timeline ${index}`,
    detail: `Bounded event ${index}`,
    occurredAt: timestamp(index % 60),
    priority: 'normal',
    memberIds: [MEMBER_A, MEMBER_B],
    deliveryState: 'local',
    escalationState: 'none',
  };
}

class SharedCanonicalState {
  constructor() {
    this.tables = new Map(TABLES.map((table) => [table, []]));
    this.members = [
      { id: MEMBER_A, userId: USER_A, callsign: 'LEAD', role: 'lead', revokedAt: null },
      { id: MEMBER_B, userId: USER_B, callsign: 'TWO', role: 'member', revokedAt: null },
    ];
    this.revision = 0;
    this.idCounter = 0;
    this.fetchCalls = 0;
    this.subscribers = new Set();
  }

  nextId() {
    this.idCounter += 1;
    return `42000000-0000-4000-8000-${String(this.idCounter).padStart(12, '0')}`;
  }

  emitChange() {
    this.subscribers.forEach((subscriber) => subscriber());
  }

  rows(table) {
    return this.tables.get(table);
  }
}

function comparable(row) {
  const copy = { ...row };
  delete copy.id;
  delete copy.server_revision;
  delete copy.server_observed_at;
  delete copy.created_at;
  delete copy.updated_at;
  return JSON.stringify(copy);
}

class InMemoryCanonicalBackend {
  constructor(shared, userId) {
    this.shared = shared;
    this.userId = userId;
  }

  activeMember() {
    return this.shared.members.find((member) => member.userId === this.userId && !member.revokedAt) ?? null;
  }

  isAvailable() {
    return true;
  }

  async getCurrentUserId() {
    return success(this.userId);
  }

  async listMembers(convoyId) {
    if (convoyId !== CONVOY_ID || !this.activeMember()) {
      return failure('permission_denied', 'row-level security denied convoy membership');
    }
    return success(this.shared.members.map((member) => ({ ...member })));
  }

  async getOwnMember(context) {
    const member = this.activeMember();
    if (!member || context.expeditionId !== EXPEDITION_ID || context.convoyId !== CONVOY_ID) {
      return failure('permission_denied', 'row-level security denied actor membership');
    }
    return success({ ...member });
  }

  async upsertRow(table, row, options) {
    const actor = this.activeMember();
    if (!actor || row.actor_user_id !== this.userId || row.actor_member_id !== actor.id) {
      return failure('permission_denied', 'row-level security denied actor identity');
    }
    if (row.expedition_id !== EXPEDITION_ID || row.convoy_id !== CONVOY_ID) {
      return failure('scope_mismatch', 'dispatch_scope_mismatch');
    }
    const memberIds = new Set(this.shared.members.filter((member) => !member.revokedAt).map((member) => member.id));
    const recipients = row.recipient_member_ids ?? row.member_ids ?? row.authorized_member_ids ?? [];
    if (recipients.some((memberId) => !memberIds.has(memberId))) {
      return failure('scope_mismatch', 'dispatch_recipient_membership_mismatch');
    }
    if (table === 'dispatch_assignments' && actor.role !== 'lead') {
      return failure('permission_denied', 'assignment requires command role');
    }

    const conflictColumns = options.conflictColumns.split(',');
    const rows = this.shared.rows(table);
    const existingIndex = rows.findIndex((candidate) => conflictColumns.every((column) => candidate[column] === row[column]));
    if (existingIndex >= 0) {
      const existing = rows[existingIndex];
      if (options.immutable || comparable(existing) === comparable(row)) {
        return success({ id: existing.id, serverRevision: existing.server_revision });
      }
      const incomingVersion = Number(row.state_version ?? 1);
      const currentVersion = Number(existing.state_version ?? 1);
      if (incomingVersion < currentVersion) return failure('stale_version', 'dispatch_stale_state_version');
      if (incomingVersion === currentVersion) return failure('conflict', 'dispatch_state_version_conflict');
      this.shared.revision += 1;
      rows[existingIndex] = {
        ...existing,
        ...row,
        server_revision: this.shared.revision,
        server_observed_at: timestamp(10 + this.shared.revision),
        updated_at: timestamp(10 + this.shared.revision),
      };
      this.shared.emitChange();
      return success({ id: existing.id, serverRevision: this.shared.revision });
    }

    this.shared.revision += 1;
    const stored = {
      ...row,
      id: this.shared.nextId(),
      server_revision: this.shared.revision,
      server_observed_at: timestamp(10 + this.shared.revision),
      created_at: timestamp(10 + this.shared.revision),
      updated_at: timestamp(10 + this.shared.revision),
    };
    rows.push(stored);
    this.shared.emitChange();
    return success({ id: stored.id, serverRevision: stored.server_revision });
  }

  async fetchRows(table, context, limit) {
    this.shared.fetchCalls += 1;
    if (!this.activeMember()) return failure('permission_denied', 'row-level security denied expedition read');
    if (context.expeditionId !== EXPEDITION_ID || context.convoyId !== CONVOY_ID) {
      return failure('scope_mismatch', 'dispatch_scope_mismatch');
    }
    return success(this.shared.rows(table)
      .filter((row) => row.expedition_id === context.expeditionId && row.convoy_id === context.convoyId)
      .sort((left, right) => left.server_revision - right.server_revision)
      .slice(0, limit)
      .map((row) => ({ ...row })));
  }

  subscribe(context, handlers) {
    if (!this.activeMember() || context.expeditionId !== EXPEDITION_ID || context.convoyId !== CONVOY_ID) {
      handlers.onStatus('degraded', 'row-level security denied subscription');
      return { unsubscribe() {} };
    }
    const subscriber = () => handlers.onChange();
    this.shared.subscribers.add(subscriber);
    handlers.onStatus('connected');
    return {
      unsubscribe: () => {
        this.shared.subscribers.delete(subscriber);
        handlers.onStatus('disconnected');
      },
    };
  }
}

async function main() {
  const repositoryModule = load('lib/dispatchCanonicalRepository.ts');
  const coordinatorModule = load('lib/dispatchCanonicalMigrationCoordinator.ts');
  const rollout = load('lib/dispatchRolloutConfig.ts');
  const { dispatchPersistenceAdapter } = load('lib/dispatchPersistenceAdapter.ts');
  const { replayQueuedDispatchActions } = load('lib/dispatchOfflineReplayAdapter.ts');

  assert.strictEqual(rollout.DEFAULT_DISPATCH_ROLLOUT_CONFIG.canonicalBackendPersistence, false);
  assert.strictEqual(
    rollout.resolveDispatchCanonicalBackendMode({
      ...rollout.DEFAULT_DISPATCH_ROLLOUT_CONFIG,
      canonicalBackendPersistence: true,
    }, undefined),
    'disabled',
    'Missing mode configuration must fail closed.',
  );

  const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260713054719_dispatch_canonical_persistence.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(process.cwd(), 'supabase/rollback/20260713054719_dispatch_canonical_persistence.sql'), 'utf8');
  assert.match(migration, /alter table public\.dispatch_pings enable row level security/i);
  assert.match(migration, /private\.dispatch_has_expedition_access/i);
  assert.match(migration, /dispatch_restricted_locations/i);
  assert.match(migration, /dispatch_reject_history_mutation/i);
  assert.match(migration, /dispatch_operation_receipts/i);
  assert.match(migration, /resolve_dispatch_actor_membership/i);
  assert.match(migration, /dispatch_can_append_late_ack/i);
  assert.match(migration, /dispatch_transition_allowed/i);
  assert.match(migration, /revoke all on sequence public\.dispatch_server_revision_seq from anon, authenticated/i);
  assert.doesNotMatch(migration, /grant usage, select on sequence public\.dispatch_server_revision_seq to authenticated/i);
  assert.match(rollback, /drop table if exists public\.dispatch_pings/i);
  assert.doesNotMatch(rollback, /drop column.*expedition_id/i);

  const shared = new SharedCanonicalState();
  const repositoryA = new repositoryModule.DispatchCanonicalRepository(new InMemoryCanonicalBackend(shared, USER_A));
  const repositoryB = new repositoryModule.DispatchCanonicalRepository(new InMemoryCanonicalBackend(shared, USER_B));
  const outsiderRepository = new repositoryModule.DispatchCanonicalRepository(new InMemoryCanonicalBackend(shared, USER_OUTSIDER));
  const contextA = { expeditionId: EXPEDITION_ID, convoyId: CONVOY_ID, actorUserId: USER_A };
  const contextB = { expeditionId: EXPEDITION_ID, convoyId: CONVOY_ID, actorUserId: USER_B };

  const created = await repositoryA.upsertEntity(contextA, { type: 'ping', value: ping() });
  assert.strictEqual(created.ok, true);
  const retried = await repositoryA.upsertEntity(contextA, { type: 'ping', value: ping() });
  assert.strictEqual(retried.ok, true);
  assert.strictEqual(shared.rows('dispatch_pings').length, 1, 'Idempotent retry must create one ping.');
  assert.strictEqual(shared.rows('dispatch_restricted_locations').length, 1, 'Exact location must be isolated.');
  const storedPing = shared.rows('dispatch_pings')[0];
  assert.strictEqual(storedPing.linked_context.coordinates, undefined);
  assert.strictEqual(storedPing.payload.linkedContext.coordinates, undefined);
  assert.strictEqual(storedPing.payload.linkedContext.metadata.api_key, undefined);
  assert.strictEqual(storedPing.payload.linkedContext.metadata.providerToken, undefined);
  assert.strictEqual(storedPing.payload.linkedContext.metadata.clientSecret, undefined);
  assert.strictEqual(storedPing.payload.linkedContext.metadata.gps, undefined);
  assert.strictEqual(storedPing.payload.linkedContext.metadata.note, 'safe');

  const versionTwo = await repositoryA.upsertEntity(contextA, {
    type: 'ping',
    value: ping({ version: 2, status: 'sent', updatedAt: timestamp(2) }),
  });
  assert.strictEqual(versionTwo.ok, true);
  const stale = await repositoryA.upsertEntity(contextA, {
    type: 'ping',
    value: ping({ version: 1, message: 'Out of order', updatedAt: timestamp(1) }),
  });
  assert.strictEqual(stale.ok, false);
  assert.strictEqual(stale.code, 'stale_version');

  const ackResult = await repositoryB.upsertEntity(contextB, { type: 'acknowledgment', value: acknowledgment() });
  assert.strictEqual(ackResult.ok, true, 'Second client must be able to persist its own late acknowledgment.');
  const clientAPull = await repositoryA.pullExpedition(contextA);
  assert.strictEqual(clientAPull.ok, true);
  assert.strictEqual(clientAPull.data.acknowledgments.length, 1);

  const outsiderWrite = await outsiderRepository.upsertEntity(
    { expeditionId: EXPEDITION_ID, convoyId: CONVOY_ID, actorUserId: USER_OUTSIDER },
    { type: 'ping', value: ping({ id: 'outsider-ping', idempotencyKey: 'outsider-key' }) },
  );
  assert.strictEqual(outsiderWrite.ok, false);
  assert.strictEqual(outsiderWrite.code, 'permission_denied');

  const shadow = new coordinatorModule.DispatchCanonicalMigrationCoordinator('shadow', repositoryA);
  const shadowResult = await shadow.hydrate(contextA, snapshot());
  assert.strictEqual(shadowResult.applied, false);
  assert.ok(shadowResult.shadowDifferenceCount >= 2);
  assert.strictEqual(shadowResult.snapshot.pings.length, 0, 'Shadow mode must not mutate local authority.');

  const dualRead = new coordinatorModule.DispatchCanonicalMigrationCoordinator('dual_read', repositoryA);
  const dualResult = await dualRead.hydrate(contextA, snapshot());
  assert.strictEqual(dualResult.applied, true);
  assert.strictEqual(dualResult.snapshot.pings.length, 1);
  assert.strictEqual(dualResult.snapshot.acknowledgments.length, 1);

  shared.rows('dispatch_pings')[0].deleted_at = timestamp(8);
  shared.rows('dispatch_pings')[0].state_version = 3;
  shared.rows('dispatch_pings')[0].server_revision = ++shared.revision;
  const tombstoneResult = await dualRead.hydrate(contextA, dualResult.snapshot);
  assert.strictEqual(tombstoneResult.snapshot.pings.length, 0, 'Server tombstone must remove the local active row.');

  const replayPing = ping({
    id: 'ping-outbox-replay',
    idempotencyKey: 'dispatch:canonical:ping:outbox',
    linkedContext: { id: 'manual-1', type: 'manual', title: 'Manual context' },
  });
  dispatchPersistenceAdapter.upsertPing(EXPEDITION_ID, defaults(), replayPing);
  const replayOrder = [];
  const replay = await replayQueuedDispatchActions({
    expeditionId: EXPEDITION_ID,
    defaults: defaults(),
    persistCanonicalEntity: async (entity) => {
      replayOrder.push('canonical');
      const result = await repositoryA.upsertEntity(contextA, entity);
      return result.ok;
    },
    publish: async () => {
      replayOrder.push('publish');
      return true;
    },
    now: () => Date.parse(timestamp(20)),
  });
  assert.deepStrictEqual(replayOrder.slice(0, 2), ['canonical', 'publish']);
  assert.strictEqual(replay.replayed, 1);
  assert.strictEqual(replay.snapshot.offlineActions[0].status, 'replayed');

  const bulkStart = performance.now();
  await Promise.all(Array.from({ length: 250 }, (_, index) => (
    repositoryA.upsertEntity(contextA, { type: 'timeline_event', value: timeline(index) })
  )));
  const bulkWriteMs = performance.now() - bulkStart;
  const mergeStart = performance.now();
  const bulkPull = await repositoryB.pullExpedition(contextB);
  assert.strictEqual(bulkPull.ok, true);
  const bulkMerge = coordinatorModule.reconcileCanonicalDispatchSnapshot(snapshot(), bulkPull.data);
  const pullAndMergeMs = performance.now() - mergeStart;
  assert.ok(bulkMerge.timelineEvents.length > 0);
  assert.ok(bulkWriteMs < 2000, `Simulated 250-event write exceeded budget: ${bulkWriteMs.toFixed(2)}ms`);
  assert.ok(pullAndMergeMs < 500, `Simulated pull/merge exceeded budget: ${pullAndMergeMs.toFixed(2)}ms`);

  const realtimeCoordinator = new coordinatorModule.DispatchCanonicalMigrationCoordinator('dual_read', repositoryA);
  const fetchCallsBefore = shared.fetchCalls;
  let realtimeHydrations = 0;
  const lease = realtimeCoordinator.subscribe({
    context: contextA,
    getLocalSnapshot: () => snapshot(),
    onHydrated: () => { realtimeHydrations += 1; },
  });
  for (let index = 0; index < 100; index += 1) shared.emitChange();
  await new Promise((resolve) => setTimeout(resolve, 450));
  lease.unsubscribe();
  const realtimeDiagnostics = realtimeCoordinator.getDiagnostics();
  assert.strictEqual(realtimeDiagnostics.realtimeNotifications, 100);
  assert.ok(realtimeDiagnostics.coalescedRealtimeNotifications >= 99);
  assert.strictEqual(realtimeHydrations, 1, 'A notification burst should produce one coalesced hydration.');
  assert.strictEqual(shared.fetchCalls - fetchCallsBefore, 7, 'One hydration should fetch each canonical table once.');
  assert.strictEqual(shared.subscribers.size, 0, 'Unsubscribe must release the realtime listener.');
  assert.strictEqual(realtimeDiagnostics.outstandingJobs, 0);

  const redactedFailureBackend = {
    ...new InMemoryCanonicalBackend(shared, USER_A),
    isAvailable: () => true,
    getCurrentUserId: async () => { throw new Error('Authorization: Bearer eyJsecret access_token=abc'); },
  };
  const failureRepository = new repositoryModule.DispatchCanonicalRepository(redactedFailureBackend);
  const failureCoordinator = new coordinatorModule.DispatchCanonicalMigrationCoordinator('shadow', failureRepository);
  await failureCoordinator.persistEntity({ expeditionId: EXPEDITION_ID, convoyId: CONVOY_ID }, { type: 'ping', value: ping() });
  const diagnostics = failureCoordinator.getDiagnostics();
  assert.doesNotMatch(diagnostics.lastError ?? '', /eyJsecret|access_token=abc/);

  const output = {
    suite: 'dispatch-canonical-backend',
    status: 'passed',
    evidence: 'deterministic two-client simulation; not live Supabase or device evidence',
    metrics: {
      simulatedTimelineWrites: 250,
      bulkWriteMs: Number(bulkWriteMs.toFixed(3)),
      pullAndMergeMs: Number(pullAndMergeMs.toFixed(3)),
      notificationBurst: 100,
      coalescedNotifications: realtimeDiagnostics.coalescedRealtimeNotifications,
      realtimeHydrations,
      outstandingJobs: realtimeDiagnostics.outstandingJobs,
    },
  };
  console.log(JSON.stringify(output));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
