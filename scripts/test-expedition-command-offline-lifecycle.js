const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const persistenceFiles = new Map();

const checklistTemplates = [{
  id: 'template-1',
  rules: {},
  items: [{ category: 'recovery', title: 'Inspect recovery kit', priority: 'high' }],
}];

function createOfflineBuilder(table) {
  const response = table === 'ecs_checklist_templates'
    ? { data: checklistTemplates, error: null }
    : { data: null, error: { message: 'offline fixture' } };
  const builder = {
    select() { return builder; },
    insert() { return builder; },
    update() { return builder; },
    eq() { return builder; },
    is() { return builder; },
    in() { return builder; },
    order() { return builder; },
    range() { return builder; },
    limit() { return builder; },
    gte() { return builder; },
    ilike() { return builder; },
    single() { return Promise.resolve({ data: null, error: { message: 'offline fixture' } }); },
    then(resolve) { return Promise.resolve(resolve(response)); },
  };
  return builder;
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './supabase' && parent?.filename.endsWith('expeditionCommandStore.ts')) {
    return {
      supabase: { from(table) { return createOfflineBuilder(table); } },
      isSupabaseConfigured: false,
    };
  }
  if (request === './syncActionQueue' && parent?.filename.endsWith('expeditionCommandStore.ts')) {
    const noop = () => null;
    return {
      queueExpeditionAction: noop,
      queueChecklistAction: noop,
      queueFieldLogAction: noop,
      queueWaypointAction: noop,
    };
  }
  if (request === './keyValuePersistence' && parent?.filename.endsWith('expeditionCommandStore.ts')) {
    return {
      createPersistedKeyValueCache(fileKey) {
        if (!persistenceFiles.has(fileKey)) persistenceFiles.set(fileKey, new Map());
        const file = persistenceFiles.get(fileKey);
        return {
          get(key) { return file.has(key) ? file.get(key) : null; },
          set(key, value) { file.set(key, String(value)); },
          delete(key) { file.delete(key); },
          clear() { file.clear(); },
          flush() { return Promise.resolve(); },
          waitForHydration() { return Promise.resolve(); },
          isHydrated() { return true; },
        };
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const storePath = path.join(root, 'lib/expeditionCommandStore.ts');
const lifecyclePath = path.join(root, 'lib/expedition/expeditionLifecycle.ts');
const lifecycle = require(lifecyclePath);

async function main() {
  let command = require(storePath);
  const created = await command.expeditionStore.create('user-1', {
    id: '11111111-1111-4111-8111-111111111111',
    idempotencyKey: 'offline-create-1',
    title: 'Offline lifecycle expedition',
    vehicle_id: 'vehicle-1',
    status: 'draft',
    canonicalState: 'planned',
  });
  assert(created, 'Offline creation should return a local Expedition record.');
  assert.strictEqual(command.getCanonicalExpeditionLifecycle(created).state, 'planned');
  const repeatedCreate = await command.expeditionStore.create('user-1', {
    id: created.id,
    idempotencyKey: 'offline-create-1',
    title: 'Duplicate finalize attempt',
    vehicle_id: 'vehicle-1',
    canonicalState: 'planned',
  });
  assert.strictEqual(repeatedCreate.id, created.id, 'Finalize retries must reuse the stable Expedition identity.');
  assert.strictEqual(repeatedCreate.title, created.title, 'Finalize retries must preserve the first durable plan.');

  const loadoutSnapshot = await command.snapshotStore.create('user-1', {
    vehicle_id: 'vehicle-1',
    expedition_id: created.id,
    label: 'Offline lifecycle snapshot',
    snapshot: { vehicle_id: 'vehicle-1' },
  });
  assert.strictEqual((await command.snapshotStore.getByExpedition(created.id)).id, loadoutSnapshot.id);

  assert.strictEqual(
    await command.checklistStore.generateFromTemplates('user-1', created.id, null, null),
    1,
  );
  assert.strictEqual(
    await command.checklistStore.generateFromTemplates('user-1', created.id, null, null),
    0,
    'Template checklist generation must be idempotent across finalize retries.',
  );
  assert.strictEqual((await command.checklistStore.list(created.id, 'user-1')).length, 1);

  const route = await command.routeCommandStore.create('user-1', {
    expedition_id: created.id,
    name: 'Offline route',
    source: 'manual',
    geojson: { type: 'LineString', coordinates: [[-120.1, 39.1], [-120.2, 39.2]] },
    distance_mi: 12,
  });
  assert(route, 'Offline Route Manager should retain the route locally for the lifecycle handoff.');
  let stored = await command.expeditionStore.getById(created.id, 'user-1');
  assert.strictEqual(command.getCanonicalExpeditionLifecycle(stored).state, 'ready');
  assert.strictEqual(command.getCanonicalExpeditionLifecycle(stored).plan.routeAssetId, route.id);

  const waypoint = await command.waypointCommandStore.create('user-1', {
    expedition_id: created.id,
    route_id: route.id,
    title: 'Offline camp',
    kind: 'camp',
    lat: 39.15,
    lng: -120.15,
  });
  stored = await command.expeditionStore.getById(created.id, 'user-1');
  const readyPlan = command.getCanonicalExpeditionLifecycle(stored).plan;
  assert(readyPlan.waypointIds.includes(waypoint.id));
  assert(readyPlan.campIds.includes(waypoint.id));

  assert.strictEqual(await command.expeditionStore.activate(created.id, 'user-1'), true);
  stored = await command.expeditionStore.getById(created.id, 'user-1');
  let canonical = command.getCanonicalExpeditionLifecycle(stored);
  assert.strictEqual(canonical.state, 'active');

  const snapshot = lifecycle.buildCanonicalExpeditionDebriefSnapshot({
    lifecycle: canonical,
    capturedAt: '2026-07-12T16:00:00.000Z',
    summary: { duration: { total_hours: 2 }, routes: { total_distance_mi: 12 } },
  });
  const completionKey = lifecycle.buildExpeditionCompletionIdempotencyKey(canonical);
  const begun = await command.expeditionStore.beginCompletion(created.id, {
    idempotencyKey: completionKey,
    fieldLogId: '22222222-2222-4222-8222-222222222222',
    snapshot,
    requestedAt: '2026-07-12T16:00:00.000Z',
    completedAt: '2026-07-12T16:00:00.000Z',
    undoWindowMs: 5000,
    userId: 'user-1',
  });
  assert.strictEqual(begun.ok, true);
  assert.strictEqual(begun.lifecycle.state, 'completing');

  delete require.cache[require.resolve(storePath)];
  command = require(storePath);
  stored = await command.expeditionStore.getById(created.id, 'user-1');
  canonical = command.getCanonicalExpeditionLifecycle(stored);
  assert.strictEqual(canonical.state, 'completing', 'Pending completion should survive a store restart.');
  assert.strictEqual(canonical.completion.idempotencyKey, completionKey);

  const undone = await command.expeditionStore.undoCompletion(created.id, {
    idempotencyKey: completionKey,
    reason: 'Offline undo test.',
    userId: 'user-1',
  });
  assert.strictEqual(undone.ok, true);
  assert.strictEqual(undone.lifecycle.state, 'active');
  assert.strictEqual(undone.lifecycle.corrections.length, 1);

  const secondKey = lifecycle.buildExpeditionCompletionIdempotencyKey(undone.lifecycle);
  const secondBegin = await command.expeditionStore.beginCompletion(created.id, {
    idempotencyKey: secondKey,
    fieldLogId: '33333333-3333-4333-8333-333333333333',
    snapshot,
    requestedAt: '2026-07-12T17:00:00.000Z',
    completedAt: '2026-07-12T17:00:00.000Z',
    undoWindowMs: 0,
    userId: 'user-1',
  });
  assert.strictEqual(secondBegin.ok, true);
  const committed = await command.expeditionStore.commitCompletion(created.id, {
    idempotencyKey: secondKey,
    outcomeId: 'trip-outcome-1',
    userId: 'user-1',
  });
  assert.strictEqual(committed.ok, true);
  assert.strictEqual(committed.lifecycle.state, 'completed');
  assert.strictEqual(committed.lifecycle.completion.outcomeId, 'trip-outcome-1');
  const duplicateCommit = await command.expeditionStore.commitCompletion(created.id, {
    idempotencyKey: secondKey,
    outcomeId: 'trip-outcome-1',
    userId: 'user-1',
  });
  assert.strictEqual(duplicateCommit.ok, true);
  assert.strictEqual(duplicateCommit.idempotent, true);

  const firstLog = await command.fieldLogStore.create('user-1', {
    id: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'completion-log-1',
    expedition_id: created.id,
    type: 'note',
    title: 'Completion log',
  });
  const repeatedLog = await command.fieldLogStore.create('user-1', {
    id: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'completion-log-1',
    expedition_id: created.id,
    type: 'note',
    title: 'Completion log retry',
  });
  assert.strictEqual(repeatedLog.id, firstLog.id, 'Offline retries should reuse the same field-log identity.');

  for (let index = 0; index < 505; index += 1) {
    await command.fieldLogStore.create('user-1', {
      id: `bounded-log-${index}`,
      idempotencyKey: `bounded-log-${index}`,
      expedition_id: created.id,
      type: 'note',
      title: `Bounded log ${index}`,
      lat: index === 504 ? 0 : null,
      lng: index === 504 ? 0 : null,
    });
  }
  const boundedLogs = await command.fieldLogStore.list(created.id, 'user-1');
  assert.strictEqual(boundedLogs.length, 500, 'Offline field-log retention should remain bounded.');
  assert.strictEqual(boundedLogs[0].id, 'bounded-log-504');
  assert.strictEqual(boundedLogs[0].lat, 0, 'Valid zero-degree coordinates must not be coerced to missing.');
  assert.strictEqual(boundedLogs[0].lng, 0, 'Valid zero-degree coordinates must not be coerced to missing.');

  const archivePage = await command.expeditionStore.listArchivePage('user-1', { limit: 1 });
  assert.strictEqual(archivePage.source, 'cache');
  assert.strictEqual(archivePage.records[0].id, created.id);

  assert.strictEqual(await command.expeditionStore.archive(created.id, 'user-1'), true);
  stored = await command.expeditionStore.getById(created.id, 'user-1');
  assert.strictEqual(command.getCanonicalExpeditionLifecycle(stored).state, 'archived');
  assert(
    persistenceFiles.get('ecs_expedition_command_store').has(`ecs_cmd_pending_expedition_${created.id}`),
    'Native-safe command persistence should retain the Expedition by stable ID.',
  );
  const wizardSource = fs.readFileSync(path.join(root, 'app/expedition-wizard.tsx'), 'utf8');
  assert(wizardSource.includes('id: draftExpeditionId'));
  assert(wizardSource.includes('idempotencyKey: `wizard-finalize:${draftExpeditionId}`'));

  console.log('Expedition command offline lifecycle checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
