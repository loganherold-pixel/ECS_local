const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
      AppState: { addEventListener: () => ({ remove() {} }), currentState: 'active' },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
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

const {
  createDispatchNavigateContextAdapter,
  dispatchLinkedContextFromLiveEvent,
  isDispatchContextNavigationPayload,
  parseDispatchContextNavigationPayload,
} = require(path.join(root, 'lib', 'dispatchNavigateContextHandoff.ts'));

const NOW = Date.parse('2026-07-12T19:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
const minutesAgo = (minutes) => iso(NOW - minutes * 60_000);

const allowAllPermissions = {
  roleLabel: 'Owner',
  disabledReason: 'Denied.',
  can: () => ({ allowed: true }),
};
const memberPermissions = {
  roleLabel: 'Member',
  disabledReason: 'Denied.',
  can: (action) => action === 'view_dispatch'
    ? { allowed: true }
    : { allowed: false, reason: 'Member location is restricted.' },
};
const deniedPermissions = {
  roleLabel: 'Denied',
  disabledReason: 'No Dispatch access.',
  can: () => ({ allowed: false, reason: 'No Dispatch access.' }),
};

const route = {
  id: 'route-1',
  user_id: null,
  device_id: 'device-1',
  name: 'Offline Ridge Route',
  description: null,
  source_format: 'gpx',
  source_app: 'local_import',
  total_distance_miles: 12,
  elevation_gain_ft: 1200,
  waypoint_count: 2,
  segment_count: 1,
  waypoints: [
    { lat: 39.1, lon: -120.1, ele: null, name: 'Alpha', time: null },
    { lat: 39.2, lon: -120.2, ele: null, name: 'Bravo', time: null },
  ],
  segments: [{ points: [
    { lat: 39.15, lon: -120.15, ele: null },
    { lat: 39.25, lon: -120.25, ele: null },
  ] }],
  is_active: false,
  sync_status: 'local',
  created_at: minutesAgo(30),
  updated_at: minutesAgo(5),
};

function sourceTruth(overrides = {}) {
  return {
    id: overrides.id ?? 'dispatch-source',
    origin: overrides.origin ?? 'manual',
    authority: overrides.authority ?? 'ECS User',
    provider: overrides.provider ?? 'local',
    observedAt: overrides.observedAt ?? minutesAgo(2),
    fetchedAt: overrides.fetchedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    confidence: overrides.confidence ?? 'medium',
    coverage: overrides.coverage ?? 'complete',
    availability: overrides.availability ?? 'usable',
    conflict: overrides.conflict ?? false,
    warningCodes: overrides.warningCodes ?? [],
  };
}

function context(type, overrides = {}) {
  return {
    id: overrides.id ?? `${type}-context`,
    type,
    title: overrides.title ?? `${type} target`,
    subtitle: overrides.subtitle,
    coordinates: overrides.coordinates,
    routeSegmentId: overrides.routeSegmentId,
    observedAt: overrides.observedAt,
    stale: overrides.stale,
    restricted: overrides.restricted,
    sourceTruthPolicyKey: overrides.sourceTruthPolicyKey ?? 'manual_user_state',
    sourceTruth: overrides.sourceTruth ?? sourceTruth(),
    metadata: overrides.metadata ?? {},
  };
}

function makeHarness(overrides = {}) {
  const calls = { saves: [], flows: [], clears: 0 };
  const pins = new Map([['pin-1', {
    id: 'pin-1', title: 'Local Pin', category: 'waypoint', type: 'poi',
    lat: 38.5, lng: -119.5, created_at: minutesAgo(20),
  }]]);
  const bailouts = new Map([['bailout-1', {
    id: 'bailout-1', title: 'Local Exit', type: 'bailout',
    lat: 38.7, lng: -119.7, created_at: minutesAgo(30),
  }]]);
  const routes = new Map([['route-1', route]]);
  const vehicles = new Map([['vehicle-1', { id: 'vehicle-1', name: 'Scout' }]]);
  const adapter = createDispatchNavigateContextAdapter({
    getPinById: (id) => pins.get(id) ?? null,
    getRouteById: (id) => routes.get(id) ?? null,
    getActiveRoute: () => route,
    getBailoutById: (id) => bailouts.get(id) ?? null,
    getVehicleById: (id) => vehicles.get(id) ?? null,
    saveHandoff: async (payload) => { calls.saves.push(payload); },
    stageFlow: async (flow) => {
      calls.flows.push(flow);
      return { ...flow, id: 'flow-1', createdAt: iso(NOW) };
    },
    clearHandoff: async () => { calls.clears += 1; },
    now: () => NOW,
    recentActions: new Map(),
    ...overrides.dependencies,
  });
  return { adapter, calls, pins, bailouts, routes, vehicles };
}

async function open(harness, linkedContext, overrides = {}) {
  return harness.adapter.open({
    context: linkedContext,
    dispatchEventId: overrides.dispatchEventId ?? `event-${linkedContext.id}`,
    sourceEntityId: overrides.sourceEntityId ?? `source-${linkedContext.id}`,
    expeditionId: overrides.expeditionId ?? 'expedition-1',
    permissions: overrides.permissions ?? allowAllPermissions,
    currentMemberId: overrides.currentMemberId ?? 'member-current',
    returnRoute: overrides.returnRoute ?? `/alert?dispatchEventId=event-${linkedContext.id}`,
    rolloutEnabled: overrides.rolloutEnabled ?? true,
  });
}

async function expectStaged(linkedContext, expectedCoordinate) {
  const harness = makeHarness();
  const result = await open(harness, linkedContext);
  assert.strictEqual(result.status, 'staged', `${linkedContext.type} should stage.`);
  assert.strictEqual(harness.calls.saves.length, 1);
  assert.strictEqual(harness.calls.flows.length, 1);
  assert.strictEqual(harness.calls.flows[0].intent, 'dispatch_context');
  assert.strictEqual(harness.calls.saves[0].routeSource, 'dispatch_context');
  assert.strictEqual(harness.calls.saves[0].requiresOnlineRouting, false);
  assert.strictEqual(harness.calls.saves[0].roadDestinationCoordinate, null);
  assert.deepStrictEqual(harness.calls.saves[0].coordinate, expectedCoordinate);
  assert.strictEqual(isDispatchContextNavigationPayload(harness.calls.saves[0]), true);
  return { harness, result, payload: harness.calls.saves[0] };
}

async function main() {
  {
    const liveContext = dispatchLinkedContextFromLiveEvent({
      id: 'recovery-event-1',
      type: 'recovery',
      severity: 'critical',
      title: 'Recovery Assist',
      message: 'Last-known position attached.',
      source: 'team_member',
      createdAt: minutesAgo(14),
      createdBy: { userId: 'member-other', displayName: 'Other Member' },
      location: {
        latitude: 39.02,
        longitude: -120.02,
        timestamp: minutesAgo(14),
        source: 'last_known_gps',
      },
    });
    assert.strictEqual(liveContext.type, 'incident');
    assert.strictEqual(liveContext.stale, true);
    assert.strictEqual(liveContext.sourceTruth.origin, 'cached');
    assert.strictEqual(liveContext.metadata.requiresMemberLocationPermission, true);
  }

  await expectStaged(context('pin', {
    coordinates: { latitude: 0, longitude: 0 },
    metadata: { source: 'pinStore', pinId: 'pin-1' },
  }), { lat: 38.5, lng: -119.5 });

  await expectStaged(context('waypoint', {
    coordinates: { latitude: 0, longitude: 0 },
    metadata: { source: 'routeStore', routeId: 'route-1', waypointIndex: 1 },
    sourceTruthPolicyKey: 'offline_map_route_package',
  }), { lat: 39.2, lng: -120.2 });

  await expectStaged(context('route_segment', {
    routeSegmentId: 'route-1:0',
    metadata: { source: 'routeStore', routeId: 'route-1', segmentIndex: 0 },
    sourceTruthPolicyKey: 'offline_map_route_package',
  }), { lat: 39.15, lng: -120.15 });

  const savedRoute = await expectStaged(context('route', {
    metadata: { source: 'routeStore', routeId: 'route-1' },
    sourceTruthPolicyKey: 'offline_map_route_package',
  }), { lat: 39.1, lng: -120.1 });
  assert.deepStrictEqual(savedRoute.harness.routes.get('route-1'), route, 'Offline route should not be mutated.');
  await expectStaged(context('route', {
    id: 'active-route-context',
    metadata: { source: 'routeStore', activeRoute: true },
    sourceTruthPolicyKey: 'offline_map_route_package',
  }), { lat: 39.1, lng: -120.1 });

  await expectStaged(context('camp', {
    coordinates: { latitude: 39.3, longitude: -120.3 },
  }), { lat: 39.3, lng: -120.3 });
  await expectStaged(context('rally', {
    coordinates: { latitude: 39.4, longitude: -120.4 },
  }), { lat: 39.4, lng: -120.4 });
  await expectStaged(context('bailout', {
    metadata: { source: 'bailoutStore', bailoutId: 'bailout-1' },
  }), { lat: 38.7, lng: -119.7 });
  await expectStaged(context('incident', {
    coordinates: { latitude: 39.5, longitude: -120.5 },
    sourceTruthPolicyKey: 'condition_closure_advisory',
  }), { lat: 39.5, lng: -120.5 });
  await expectStaged(context('resource', {
    coordinates: { latitude: 39.6, longitude: -120.6 },
  }), { lat: 39.6, lng: -120.6 });
  await expectStaged(context('vehicle', {
    metadata: { source: 'vehicleStore', vehicleId: 'vehicle-1' },
  }), null);
  await expectStaged(context('member', {
    coordinates: { latitude: 39.7, longitude: -120.7 },
    sourceTruthPolicyKey: 'convoy_member_location',
    metadata: { locationOwnerMemberId: 'member-other', requiresMemberLocationPermission: true },
  }), { lat: 39.7, lng: -120.7 });

  const manual = await expectStaged(context('manual', {
    title: 'Manual note only',
    coordinates: undefined,
  }), null);
  assert.match(manual.result.message, /No map location is attached/i);

  {
    const harness = makeHarness();
    const result = await open(harness, context('camp', { coordinates: undefined }));
    assert.strictEqual(result.status, 'unavailable');
    assert.strictEqual(harness.calls.saves.length, 0);
    assert.strictEqual(harness.calls.flows.length, 0);
  }

  {
    const harness = makeHarness();
    const ownLocation = context('member', {
      coordinates: { latitude: 39.75, longitude: -120.75 },
      metadata: { locationOwnerMemberId: 'member-current', requiresMemberLocationPermission: true },
      sourceTruthPolicyKey: 'convoy_member_location',
    });
    const result = await open(harness, ownLocation, { permissions: memberPermissions });
    assert.strictEqual(result.status, 'staged', 'Members may open their own staged location context.');
  }

  {
    const harness = makeHarness();
    const restricted = context('member', {
      coordinates: { latitude: 39.8, longitude: -120.8 },
      metadata: { locationOwnerMemberId: 'member-other', requiresMemberLocationPermission: true },
      sourceTruthPolicyKey: 'convoy_member_location',
    });
    const result = await open(harness, restricted, { permissions: memberPermissions });
    assert.strictEqual(result.status, 'restricted');
    assert.strictEqual(result.message, 'Member location is restricted.');
    assert.strictEqual(harness.calls.saves.length, 0);
    assert.strictEqual(harness.calls.flows.length, 0);
  }

  {
    const stale = context('member', {
      coordinates: { latitude: 39.9, longitude: -120.9 },
      sourceTruthPolicyKey: 'convoy_member_location',
      sourceTruth: sourceTruth({ origin: 'cached', observedAt: minutesAgo(12) }),
      metadata: { locationOwnerMemberId: 'member-other', requiresMemberLocationPermission: true },
    });
    const { result, payload } = await expectStaged(stale, { lat: 39.9, lng: -120.9 });
    assert.strictEqual(result.target.stale, true);
    assert.strictEqual(result.target.freshness, 'stale');
    assert.strictEqual(result.target.sourceTruth.origin, 'cached');
    const parsed = parseDispatchContextNavigationPayload(payload, NOW);
    assert.strictEqual(parsed.stale, true);
    assert.strictEqual(parsed.sourceTruth.origin, 'cached');
  }

  {
    const harness = makeHarness();
    const linkedContext = context('pin', {
      coordinates: { latitude: 39, longitude: -120 },
      metadata: { source: 'pinStore', pinId: 'pin-1' },
    });
    const first = await open(harness, linkedContext);
    const second = await open(harness, linkedContext);
    assert.strictEqual(first.status, 'staged');
    assert.strictEqual(second.status, 'duplicate');
    assert.strictEqual(harness.calls.saves.length, 1);
    assert.strictEqual(harness.calls.flows.length, 1);
  }

  {
    const harness = makeHarness();
    const result = await open(
      harness,
      context('manual', { title: 'Return route check' }),
      { returnRoute: '/alert?dispatchQueueItemId=queue-1' },
    );
    const parsed = parseDispatchContextNavigationPayload(harness.calls.saves[0], NOW);
    assert.strictEqual(result.status, 'staged');
    assert.strictEqual(parsed.returnRoute, '/alert?dispatchQueueItemId=queue-1');
    assert.strictEqual(parsed.coordinate, null);
  }

  {
    const harness = makeHarness();
    await open(
      harness,
      context('manual', { id: 'unsafe-return' }),
      { returnRoute: 'https://example.com/leave-ecs' },
    );
    const parsed = parseDispatchContextNavigationPayload(harness.calls.saves[0], NOW);
    assert.strictEqual(parsed.returnRoute, '/alert');
  }

  {
    const harness = makeHarness();
    const result = await open(harness, { id: 'bad', type: 'unknown', title: 'Bad', metadata: {} });
    assert.strictEqual(result.status, 'invalid');
    assert.strictEqual(harness.calls.saves.length, 0);
  }

  {
    const harness = makeHarness();
    harness.pins.delete('pin-1');
    const result = await open(harness, context('pin', {
      coordinates: { latitude: 39, longitude: -120 },
      metadata: { source: 'pinStore', pinId: 'pin-1' },
    }));
    assert.strictEqual(result.status, 'unavailable');
    assert.match(result.message, /no longer available/i);
    assert.strictEqual(harness.calls.saves.length, 0);
  }

  {
    const harness = makeHarness();
    const result = await open(harness, context('manual'), { permissions: deniedPermissions });
    assert.strictEqual(result.status, 'permission_denied');
    assert.strictEqual(harness.calls.saves.length, 0);
    assert.strictEqual(harness.calls.flows.length, 0);
    assert.strictEqual(harness.calls.clears, 0);
  }

  {
    const harness = makeHarness();
    const result = await open(harness, context('manual'), { rolloutEnabled: false });
    assert.strictEqual(result.status, 'rollout_disabled');
    assert.strictEqual(harness.calls.saves.length, 0);
  }

  {
    const harness = makeHarness();
    const linkedContext = context('incident', {
      title: 'token=secret-value',
      coordinates: { latitude: 39, longitude: -120 },
      sourceTruth: sourceTruth({
        provider: 'api_key=secret-value',
        conflict: true,
        warningCodes: ['provider_conflict'],
      }),
      metadata: {
        rawProviderResponse: { apiKey: 'must-not-render' },
        serviceRoleKey: 'must-not-render',
        conflictState: 'needs_review',
      },
    });
    const result = await open(harness, linkedContext);
    assert.strictEqual(result.status, 'staged');
    assert.ok(result.target.warningCodes.includes('dispatch_context_conflict'));
    const serialized = JSON.stringify(harness.calls.saves[0]);
    assert.ok(!serialized.includes('must-not-render'));
    assert.ok(!serialized.includes('secret-value'));
    assert.strictEqual(harness.calls.saves[0].raw, null);
    assert.strictEqual(harness.calls.saves[0].routeMetadata.overrideActiveNavigation, undefined);
    assert.strictEqual(harness.calls.saves[0].routeMetadata.autoStartNavigation, undefined);
  }

  console.log('Dispatch context handoff tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
