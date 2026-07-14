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
  createMissionCommandContextAdapter,
  getMissionCommandContextPrimaryActionLabel,
  missionCommandReturnRoute,
} = require(path.join(root, 'lib', 'dispatchMissionCommandContext.ts'));

const NOW = Date.parse('2026-07-14T18:00:00.000Z');
const iso = (value) => new Date(value).toISOString();

const allowAll = {
  roleLabel: 'Owner',
  disabledReason: 'Denied.',
  can: () => ({ allowed: true }),
};
const restrictedMember = {
  roleLabel: 'Member',
  disabledReason: 'Denied.',
  can: (action) => action === 'view_dispatch'
    ? { allowed: true }
    : { allowed: false, reason: 'Member location is restricted.' },
};

function sourceTruth(overrides = {}) {
  return {
    id: overrides.id ?? 'source-1',
    origin: overrides.origin ?? 'manual',
    authority: overrides.authority ?? 'ECS User',
    observedAt: overrides.observedAt ?? iso(NOW - 60_000),
    fetchedAt: overrides.fetchedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    confidence: overrides.confidence ?? 'medium',
    coverage: overrides.coverage ?? 'complete',
    availability: overrides.availability ?? 'usable',
    conflictState: overrides.conflictState ?? 'none',
    warningCodes: overrides.warningCodes ?? [],
  };
}

function context(type, overrides = {}) {
  return {
    id: overrides.id ?? `${type}-1`,
    type,
    title: overrides.title ?? `${type} context`,
    subtitle: overrides.subtitle,
    coordinates: overrides.coordinates,
    routeSegmentId: overrides.routeSegmentId,
    sourceTruthPolicyKey: overrides.sourceTruthPolicyKey,
    sourceTruth: overrides.sourceTruth ?? sourceTruth(),
    observedAt: overrides.observedAt,
    stale: overrides.stale,
    restricted: overrides.restricted,
    metadata: overrides.metadata ?? {},
  };
}

function harness() {
  const calls = { map: [], flows: [] };
  const pins = new Map([['pin-1', { id: 'pin-1' }]]);
  const routes = new Map([['route-1', { id: 'route-1' }]]);
  const bailouts = new Map([['bailout-1', { id: 'bailout-1' }]]);
  const vehicles = new Map([['vehicle-1', { id: 'vehicle-1' }]]);
  const events = new Map([['event-1', { id: 'event-1' }]]);
  const incidents = new Map([['incident-1', { id: 'incident-1' }]]);
  const adapter = createMissionCommandContextAdapter({
    getPinById: (id) => pins.get(id) ?? null,
    getRouteById: (id) => routes.get(id) ?? null,
    getActiveRoute: () => routes.get('route-1') ?? null,
    getBailoutById: (id) => bailouts.get(id) ?? null,
    getVehicleById: (id) => vehicles.get(id) ?? null,
    getDispatchEventById: (id) => events.get(id) ?? null,
    getIncidentById: (id) => incidents.get(id) ?? null,
    openNavigate: async (input) => {
      calls.map.push(input);
      return { status: 'staged', message: `Opening ${input.context.title} in Navigate.`, target: null };
    },
    stageFlow: async (flow) => {
      calls.flows.push(flow);
      return { ...flow, id: 'flow-1', createdAt: iso(NOW) };
    },
    now: () => NOW,
    recentActions: new Map(),
  });
  return { adapter, calls, pins, routes, bailouts, vehicles, events, incidents };
}

function open(adapter, linkedContext, overrides = {}) {
  return adapter.open({
    context: linkedContext,
    commandId: overrides.commandId ?? `command-${linkedContext.id}`,
    dispatchEventId: overrides.dispatchEventId,
    sourceEntityId: overrides.sourceEntityId,
    expeditionId: 'expedition-1',
    permissions: overrides.permissions ?? allowAll,
    currentMemberId: overrides.currentMemberId ?? 'member-current',
    returnRoute: overrides.returnRoute,
    actionId: overrides.actionId,
    rolloutEnabled: overrides.rolloutEnabled ?? true,
    mapContextEnabled: overrides.mapContextEnabled ?? true,
  });
}

async function expectNavigate(linkedContext, overrides = {}) {
  const test = harness();
  const snapshot = JSON.stringify(linkedContext);
  const result = await open(test.adapter, linkedContext, overrides);
  assert.strictEqual(result.status, 'staged');
  assert.strictEqual(result.destination, linkedContext.type === 'camp' ? 'navigate' : 'navigate');
  assert.strictEqual(result.route, '/navigate');
  assert.strictEqual(test.calls.map.length, 1);
  assert.strictEqual(test.calls.flows.length, 0);
  assert.strictEqual(JSON.stringify(linkedContext), snapshot, 'Opening context must not mutate command context.');
  assert.strictEqual(test.calls.map[0].returnRoute, missionCommandReturnRoute(overrides.commandId ?? `command-${linkedContext.id}`));
  return { ...test, result };
}

async function main() {
  await expectNavigate(context('pin', {
    metadata: { source: 'pinStore', pinId: 'pin-1' },
  }));
  await expectNavigate(context('waypoint', {
    coordinates: { latitude: 39.1, longitude: -120.1 },
    metadata: { source: 'routeStore', routeId: 'route-1', waypointIndex: 0 },
  }));
  await expectNavigate(context('route_segment', {
    routeSegmentId: 'route-1:0',
    metadata: { source: 'routeStore', routeId: 'route-1', segmentIndex: 0 },
  }));
  await expectNavigate(context('route', {
    id: 'route-1',
    metadata: { source: 'routeStore', routeId: 'route-1' },
  }));
  await expectNavigate(context('route', {
    id: 'active-route',
    metadata: { source: 'routeStore', activeRoute: true },
  }));
  const camp = await expectNavigate(context('camp', {
    coordinates: { latitude: 39.2, longitude: -120.2 },
  }));
  assert.strictEqual(camp.result.inspection.primaryAction.id, 'open_camp');
  assert.strictEqual(getMissionCommandContextPrimaryActionLabel(context('camp', {
    coordinates: { latitude: 39.2, longitude: -120.2 },
  })), 'Open Camp');
  await expectNavigate(context('rally', {
    coordinates: { latitude: 39.3, longitude: -120.3 },
  }));
  await expectNavigate(context('bailout', {
    metadata: { source: 'bailoutStore', bailoutId: 'bailout-1' },
  }));
  await expectNavigate(context('incident', {
    coordinates: { latitude: 39.4, longitude: -120.4 },
    sourceTruthPolicyKey: 'condition_closure_advisory',
  }));
  await expectNavigate(context('resource', {
    coordinates: { latitude: 39.5, longitude: -120.5 },
  }));

  {
    const test = harness();
    const linkedContext = context('vehicle', {
      id: 'vehicle-1',
      metadata: { source: 'vehicleStore', vehicleId: 'vehicle-1' },
    });
    const result = await open(test.adapter, linkedContext, {
      commandId: 'command-vehicle',
      returnRoute: '/alert?missionCommandId=command-vehicle',
    });
    assert.strictEqual(result.status, 'staged');
    assert.strictEqual(result.destination, 'fleet');
    assert.strictEqual(result.route, '/fleet');
    assert.strictEqual(test.calls.map.length, 0);
    assert.strictEqual(test.calls.flows.length, 1);
    assert.strictEqual(test.calls.flows[0].target, 'fleet');
    assert.strictEqual(test.calls.flows[0].intent, 'fleet_edit_vehicle');
    assert.strictEqual(test.calls.flows[0].context.vehicleId, 'vehicle-1');
    assert.strictEqual(test.calls.flows[0].context.returnRoute, '/alert?missionCommandId=command-vehicle');
  }

  {
    const test = harness();
    const result = await open(test.adapter, context('incident', {
      metadata: { source: 'dispatchEventStore', dispatchEventId: 'event-1' },
      coordinates: { latitude: 39.6, longitude: -120.6 },
    }));
    assert.strictEqual(result.status, 'local_target');
    assert.strictEqual(result.destination, 'dispatch_incident');
    assert.strictEqual(result.targetId, 'event-1');
    assert.strictEqual(test.calls.map.length, 0);

    const mapResult = await open(test.adapter, context('incident', {
      id: 'incident-map-action',
      metadata: { source: 'dispatchEventStore', dispatchEventId: 'event-1' },
      coordinates: { latitude: 39.6, longitude: -120.6 },
    }), { actionId: 'open_navigate' });
    assert.strictEqual(mapResult.status, 'staged');
    assert.strictEqual(test.calls.map.length, 1);

    const workflowOnly = context('incident', {
      id: 'incident-1',
      metadata: { source: 'incidentRecoveryWorkflowStore', incidentId: 'incident-1' },
    });
    const workflowInspection = test.adapter.inspect(workflowOnly, { permissions: allowAll });
    assert.strictEqual(workflowInspection.primaryAction.id, 'inspect');
    const workflowResult = await open(test.adapter, workflowOnly);
    assert.strictEqual(workflowResult.status, 'inspected');
    assert.strictEqual(workflowResult.destination, 'command');
  }

  {
    const test = harness();
    const result = await open(test.adapter, context('manual', {
      title: 'Manual note',
      subtitle: 'Verify bridge clearance before proceeding.',
    }));
    assert.strictEqual(result.status, 'inspected');
    assert.strictEqual(result.destination, 'command');
    assert.strictEqual(test.calls.map.length, 0);
    assert.strictEqual(test.calls.flows.length, 0);
  }

  {
    const test = harness();
    const staleMember = context('member', {
      coordinates: { latitude: 39.7, longitude: -120.7 },
      sourceTruthPolicyKey: 'convoy_member_location',
      sourceTruth: sourceTruth({ origin: 'cached', observedAt: iso(NOW - 16 * 60_000) }),
      metadata: {
        locationOwnerMemberId: 'member-other',
        requiresMemberLocationPermission: true,
      },
    });
    const result = await open(test.adapter, staleMember);
    assert.strictEqual(result.status, 'staged');
    assert.strictEqual(result.inspection.state, 'stale');
    assert.strictEqual(result.inspection.stale, true);
    assert.strictEqual(result.inspection.sourceTruth.origin, 'cached');
  }

  {
    const test = harness();
    const linkedContext = context('member', {
      coordinates: { latitude: 39.8, longitude: -120.8 },
      metadata: {
        locationOwnerMemberId: 'member-other',
        requiresMemberLocationPermission: true,
      },
    });
    const result = await open(test.adapter, linkedContext, { permissions: restrictedMember });
    assert.strictEqual(result.status, 'restricted');
    assert.match(result.message, /restricted/i);
    assert.strictEqual(test.calls.map.length, 0);

    const ownResult = await open(test.adapter, {
      ...linkedContext,
      id: 'member-self',
      metadata: {
        locationOwnerMemberId: 'member-current',
        requiresMemberLocationPermission: true,
      },
    }, { permissions: restrictedMember, currentMemberId: 'member-current' });
    assert.strictEqual(ownResult.status, 'staged');

    const metadataRestricted = await open(test.adapter, context('member', {
      id: 'member-metadata-restricted',
      coordinates: { latitude: 39.81, longitude: -120.81 },
      metadata: { restricted: true },
    }));
    assert.strictEqual(metadataRestricted.status, 'restricted');
  }

  {
    const test = harness();
    test.pins.delete('pin-1');
    const result = await open(test.adapter, context('pin', {
      coordinates: { latitude: 39, longitude: -120 },
      metadata: { source: 'pinStore', pinId: 'pin-1' },
    }));
    assert.strictEqual(result.status, 'deleted');
    assert.match(result.message, /no longer available/i);
  }

  {
    const test = harness();
    const unavailable = await open(test.adapter, context('member'));
    assert.strictEqual(unavailable.status, 'unavailable');
    assert.strictEqual(test.calls.map.length, 0);

    const invalid = await open(test.adapter, context('pin', {
      coordinates: { latitude: 999, longitude: -120 },
    }));
    assert.strictEqual(invalid.status, 'invalid');
  }

  {
    const test = harness();
    const linkedContext = context('vehicle', {
      id: 'vehicle-1',
      metadata: { vehicleId: 'vehicle-1' },
    });
    const first = await open(test.adapter, linkedContext, { commandId: 'duplicate-command' });
    const second = await open(test.adapter, linkedContext, { commandId: 'duplicate-command' });
    assert.strictEqual(first.status, 'staged');
    assert.strictEqual(second.status, 'duplicate');
    assert.strictEqual(test.calls.flows.length, 1);
  }

  {
    const test = harness();
    const result = await open(test.adapter, context('route', {
      id: 'route-1',
      metadata: { routeId: 'route-1' },
    }), { mapContextEnabled: false });
    assert.strictEqual(result.status, 'rollout_disabled');
    assert.strictEqual(test.calls.map.length, 0);
  }

  assert.strictEqual(missionCommandReturnRoute('command:1'), '/alert?missionCommandId=command%3A1');
  assert.strictEqual(missionCommandReturnRoute('not valid id'), '/alert');

  console.log('Mission Command linked-context tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
