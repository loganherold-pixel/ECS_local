const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const servicePath = path.join(root, 'lib', 'convoy', 'convoyRealtimeService.ts');
const storePath = path.join(root, 'stores', 'convoyTrackingStore.ts');
const packagePath = path.join(root, 'package.json');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === '@supabase/supabase-js') {
    return {
      createClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              is: async () => ({ data: [], error: null }),
            }),
          }),
        }),
        channel: () => ({
          on() {
            return this;
          },
          subscribe() {},
        }),
        removeChannel: () => {},
      }),
    };
  }
  return originalLoad.apply(this, arguments);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function isoOffset(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

function makeMembers() {
  return [
    {
      id: 'lead-member',
      convoy_id: 'convoy-1',
      callsign: 'Lead Tacoma',
      role: 'lead',
      revoked_at: null,
    },
    {
      id: 'sweep-member',
      convoy_id: 'convoy-1',
      callsign: 'Sweep Jeep',
      role: 'sweep',
      revoked_at: null,
    },
  ];
}

function makeLocation(memberId, overrides = {}) {
  const now = Date.now();
  return {
    id: `${memberId}-location`,
    convoy_id: 'convoy-1',
    member_id: memberId,
    latitude: overrides.latitude ?? 38.781,
    longitude: overrides.longitude ?? -121.208,
    accuracy_meters: overrides.accuracy_meters ?? 8,
    heading_degrees: overrides.heading_degrees ?? 180,
    speed_mps: overrides.speed_mps ?? 2.2,
    movement_status: overrides.movement_status ?? 'moving',
    captured_at: overrides.captured_at ?? new Date(now).toISOString(),
    updated_at: overrides.updated_at ?? new Date(now).toISOString(),
  };
}

function createBackend({ members = makeMembers(), locations = [], available = true } = {}) {
  const backend = {
    members,
    locations,
    lastHandlers: null,
    unsubscribed: false,
    statuses: [],
    isAvailable: () => available,
    fetchMembers: async () => ({ data: backend.members, error: null }),
    fetchLocations: async () => ({ data: backend.locations, error: null }),
    subscribeToLocationChanges: (convoyId, handlers) => {
      backend.lastHandlers = handlers;
      handlers.onStatusChange('connecting');
      return {
        unsubscribe: () => {
          backend.unsubscribed = true;
          handlers.onStatusChange('disconnected');
        },
      };
    },
  };
  return backend;
}

async function main() {
  const {
    ConvoyRealtimeService,
    classifyConvoyLocationStaleness,
    normalizeConvoyLocationSnapshot,
    CONVOY_LOCATION_FRESH_UNDER_MS,
    CONVOY_LOCATION_WATCH_AFTER_MS,
    CONVOY_LOCATION_STALE_AFTER_MS,
  } = require(servicePath);
  const { createConvoyTrackingStore } = require(storePath);

  const now = Date.now();
  const initialBackend = createBackend({
    locations: [
      makeLocation('lead-member', {
        latitude: 38.1,
        longitude: -121.1,
        movement_status: 'moving',
        captured_at: isoOffset(now, -60_000),
      }),
      makeLocation('sweep-member', {
        latitude: 38.2,
        longitude: -121.2,
        movement_status: 'needs_assistance',
        captured_at: isoOffset(now, -16 * 60_000),
      }),
    ],
  });
  const service = new ConvoyRealtimeService(initialBackend);
  const initial = await service.fetchInitialConvoyLocations('convoy-1');
  assert.strictEqual(initial.ok, true, 'initial fetch should succeed.');
  assert.strictEqual(initial.data.snapshot.members.length, 2, 'initial fetch should map active members with locations.');
  assert.strictEqual(initial.data.snapshot.lead.callsign, 'Lead Tacoma');
  assert.strictEqual(initial.data.snapshot.sweep.callsign, 'Sweep Jeep');
  assert.strictEqual(initial.data.snapshot.assistanceCount, 1);
  assert.strictEqual(initial.data.snapshot.staleCount, 1);
  assert.strictEqual(initial.data.snapshot.members[0].memberId, 'lead-member');

  const fresh = classifyConvoyLocationStaleness(isoOffset(now, -(CONVOY_LOCATION_FRESH_UNDER_MS - 1000)), now);
  assert.strictEqual(fresh.staleness, 'fresh', 'under fresh threshold should be fresh.');
  assert.strictEqual(fresh.isStale, false);

  const watch = classifyConvoyLocationStaleness(isoOffset(now, -(CONVOY_LOCATION_WATCH_AFTER_MS + 1000)), now);
  assert.strictEqual(watch.staleness, 'watch', 'after watch threshold should be watch.');
  assert.strictEqual(watch.isStale, false);
  assert.ok(watch.staleReason.includes('needs a check'));

  const stale = classifyConvoyLocationStaleness(isoOffset(now, -(CONVOY_LOCATION_STALE_AFTER_MS + 1000)), now);
  assert.strictEqual(stale.staleness, 'stale', 'after stale threshold should be stale.');
  assert.strictEqual(stale.isStale, true);

  const mapReady = normalizeConvoyLocationSnapshot(makeMembers(), [
    makeLocation('lead-member', { latitude: 39.01, longitude: -120.01 }),
    makeLocation('missing-member', { latitude: 39.99, longitude: -120.99 }),
  ]);
  assert.strictEqual(mapReady.members.length, 1, 'normalizer should skip locations without an active member.');
  assert.strictEqual(mapReady.members[0].accuracyMeters, 8);

  const updateBackend = createBackend({
    locations: [
      makeLocation('lead-member', {
        latitude: 38.1,
        longitude: -121.1,
        captured_at: isoOffset(now, -60_000),
      }),
    ],
  });
  const updateService = new ConvoyRealtimeService(updateBackend);
  const store = createConvoyTrackingStore(updateService);
  const seenSnapshots = [];
  const unsubscribeStore = store.subscribe(() => seenSnapshots.push(store.getSnapshot()));
  await store.subscribeToConvoyLocations('convoy-1');
  assert.strictEqual(store.getSnapshot().members[0].latitude, 38.1);
  assert.strictEqual(store.getSnapshot().connectionStatus, 'connecting');

  updateBackend.lastHandlers.onStatusChange('connected');
  assert.strictEqual(
    store.getSnapshot().connectionStatus,
    'connected',
    'store should expose connected realtime status.',
  );

  store.applyRealtimeChangeForTest({
    type: 'upsert',
    row: makeLocation('lead-member', {
      latitude: 38.555,
      longitude: -121.555,
      movement_status: 'stopped',
      captured_at: new Date(now).toISOString(),
    }),
  });
  assert.strictEqual(store.getSnapshot().members[0].latitude, 38.555, 'realtime update should replace existing location.');
  assert.strictEqual(store.getSnapshot().members[0].movementStatus, 'stopped');
  assert.ok(seenSnapshots.length >= 2, 'store should notify listeners on initial load and realtime replacement.');

  updateBackend.lastHandlers.onStatusChange('degraded');
  assert.strictEqual(store.getSnapshot().connectionStatus, 'degraded');
  assert.strictEqual(store.getSnapshot().members[0].latitude, 38.555, 'degraded realtime should preserve last known data.');
  assert.ok(store.getSnapshot().error.includes('last known or manual convoy state'));

  store.stopConvoyLocationSubscription();
  assert.strictEqual(updateBackend.unsubscribed, true, 'store cleanup should unsubscribe realtime channel.');
  assert.strictEqual(store.getSnapshot().connectionStatus, 'disconnected');
  unsubscribeStore();

  const source = fs.readFileSync(servicePath, 'utf8');
  assert.ok(source.includes("'postgres_changes'"), 'service should subscribe with Supabase Postgres Changes.');
  assert.ok(source.includes("table: 'convoy_member_locations'"), 'service should target convoy_member_locations.');
  assert.ok(source.includes('filter: `convoy_id=eq.${convoyId}`'), 'service should filter by convoy_id.');
  assert.ok(source.includes("event: '*'"), 'service should handle insert/update/delete events.');

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.ok(pkg.scripts['test:convoy-realtime-store'], 'package.json should expose convoy realtime store tests.');

  console.log('convoy realtime store tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
