/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const enginePath = path.join(root, 'lib', 'convoy', 'convoyRegroupPlanner.ts');
const adapterPath = path.join(root, 'lib', 'convoy', 'convoyRegroupPlannerAdapter.ts');

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
global.__DEV__ = false;

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

const engine = require(enginePath);
const adapter = require(adapterPath);

const NOW = Date.parse('2026-07-12T19:00:00.000Z');
const iso = (value) => new Date(value).toISOString();
const minutesAgo = (minutes) => iso(NOW - minutes * 60_000);

function source(id, overrides = {}) {
  return {
    id,
    origin: overrides.origin ?? 'live',
    authority: overrides.authority ?? 'Verified test source',
    provider: overrides.provider ?? null,
    observedAt: Object.prototype.hasOwnProperty.call(overrides, 'observedAt')
      ? overrides.observedAt
      : minutesAgo(1),
    fetchedAt: overrides.fetchedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    confidence: overrides.confidence ?? 'high',
    coverage: overrides.coverage ?? 'complete',
    availability: overrides.availability ?? 'usable',
    conflict: overrides.conflict ?? false,
    warningCodes: overrides.warningCodes ?? [],
  };
}

const routeCoordinates = [
  { lat: 39, lng: -120 },
  { lat: 39, lng: -119.8 },
];

function member(id, role, lng, overrides = {}) {
  const capturedAt = Object.prototype.hasOwnProperty.call(overrides, 'capturedAt')
    ? overrides.capturedAt
    : minutesAgo(1);
  return {
    memberId: id,
    label: overrides.label ?? id.toUpperCase(),
    role,
    locationVisibility: overrides.locationVisibility ?? 'visible',
    coordinate: overrides.coordinate ?? { lat: 39, lng },
    capturedAt,
    accuracyMeters: Object.prototype.hasOwnProperty.call(overrides, 'accuracyMeters')
      ? overrides.accuracyMeters
      : 12,
    speedMps: overrides.speedMps ?? 10,
    movementStatus: overrides.movementStatus ?? 'moving',
    explicitlyStale: overrides.explicitlyStale ?? false,
    sourceTruth: overrides.sourceTruth ?? source(`member-${id}`, {
      observedAt: capturedAt,
      origin: overrides.origin ?? 'live',
    }),
  };
}

function candidate(id, lng, overrides = {}) {
  return {
    id,
    title: overrides.title ?? `Candidate ${id}`,
    type: overrides.type ?? 'rally',
    coordinate: overrides.coordinate ?? { lat: 39, lng },
    access: overrides.access ?? 'verified_open',
    stoppingSuitability: overrides.stoppingSuitability ?? 'verified',
    sourceTruth: overrides.sourceTruth ?? source(`candidate-${id}`, {
      origin: overrides.origin ?? 'manual',
      observedAt: overrides.observedAt ?? minutesAgo(3),
    }),
    sourceTruthPolicyKey: overrides.sourceTruthPolicyKey ?? 'manual_user_state',
    rationale: overrides.rationale ?? ['Known ECS test candidate.'],
    warningCodes: overrides.warningCodes ?? [],
    sourceEntity: overrides.sourceEntity ?? { store: 'dispatch', id },
  };
}

function baseInput(overrides = {}) {
  return {
    enabled: true,
    positionSharingEnabled: true,
    memberLocationPermissionAllowed: true,
    activeConvoyId: 'convoy-1',
    route: {
      id: 'route-1',
      title: 'Active Route',
      coordinates: routeCoordinates,
      averageSpeedMps: 10,
      sourceTruth: source('route-source', {
        origin: 'cached',
        observedAt: minutesAgo(30),
        confidence: 'medium',
      }),
      ...(overrides.route ?? {}),
    },
    members: overrides.members ?? [
      member('lead', 'lead', -119.89),
      member('sweep', 'sweep', -119.995),
    ],
    candidates: overrides.candidates ?? [candidate('alpha', -119.86)],
    hazards: overrides.hazards ?? [],
    now: NOW,
    ...overrides,
  };
}

function mapVehicle(id, role, lng, overrides = {}) {
  return {
    memberId: id,
    callsign: id.toUpperCase(),
    displayName: id.toUpperCase(),
    role,
    latitude: overrides.latitude ?? 39,
    longitude: lng,
    accuracyMeters: Object.prototype.hasOwnProperty.call(overrides, 'accuracyMeters')
      ? overrides.accuracyMeters
      : 12,
    headingDegrees: null,
    speedMps: 10,
    movementStatus: overrides.movementStatus ?? 'moving',
    capturedAt: overrides.capturedAt ?? minutesAgo(1),
    updatedAt: overrides.capturedAt ?? minutesAgo(1),
    isStale: overrides.isStale ?? false,
    staleness: overrides.staleness ?? 'fresh',
    staleReason: null,
  };
}

function routeSession(overrides = {}) {
  return {
    sessionId: 'session-1',
    lifecycle: 'active',
    source: 'run',
    routeId: 'route-1',
    routeTitle: 'Active Route',
    routeSubtitle: null,
    statusLabel: 'Active',
    instruction: null,
    routePoints: routeCoordinates,
    progressPoints: [],
    currentLocation: null,
    headingDeg: null,
    remainingDistanceM: 16000,
    remainingDurationS: 1600,
    etaIso: null,
    progressPercent: 20,
    nextInstructionDistanceM: null,
    isRerouting: false,
    isOffRoute: false,
    offRouteDistanceM: null,
    routeStatusKind: 'nominal',
    updatedAt: minutesAgo(2),
    ...overrides,
  };
}

function importedRoute() {
  return {
    id: 'route-1',
    user_id: null,
    device_id: 'device-1',
    name: 'Active Route',
    description: null,
    source_format: 'gpx',
    source_app: 'local_import',
    total_distance_miles: 12,
    elevation_gain_ft: null,
    waypoint_count: 1,
    segment_count: 1,
    waypoints: [{
      lat: 39,
      lon: -119.86,
      ele: null,
      name: 'Known Rally Alpha',
      time: null,
      waypointType: 'junction',
    }],
    segments: [],
    is_active: true,
    sync_status: 'local',
    created_at: minutesAgo(60),
    updated_at: minutesAgo(10),
  };
}

function run() {
  const noConvoy = engine.planConvoyRegroup(baseInput({ activeConvoyId: null }));
  assert.equal(noConvoy.status, 'unavailable');
  assert.equal(noConvoy.reasonCode, 'no_active_convoy');

  const noRoute = engine.planConvoyRegroup(baseInput({ route: null }));
  assert.equal(noRoute.status, 'unavailable');
  assert.equal(noRoute.reasonCode, 'no_active_route');

  const freshSpread = engine.planConvoyRegroup(baseInput());
  assert.equal(freshSpread.status, 'proposal');
  assert.equal(freshSpread.posture, 'dispersed');
  assert.ok(freshSpread.spreadMeters >= engine.CONVOY_REGROUP_DISPERSED_SPREAD_METERS);
  assert.equal(freshSpread.includedMembers.length, 2);
  assert.ok(freshSpread.leadToSweepMeters > 0);
  assert.ok(freshSpread.proposal.candidate.etaWindow.latestSeconds >= freshSpread.proposal.candidate.etaWindow.earliestSeconds);

  const staleSweep = engine.planConvoyRegroup(baseInput({
    members: [
      member('lead', 'lead', -119.89),
      member('sweep', 'sweep', -119.995, { capturedAt: minutesAgo(20) }),
    ],
  }));
  assert.equal(staleSweep.status, 'unavailable');
  assert.equal(staleSweep.reasonCode, 'insufficient_current_positions');
  assert.equal(staleSweep.excludedSummary.staleOrAging, 1);

  const poorAccuracy = engine.planConvoyRegroup(baseInput({
    members: [
      member('lead', 'lead', -119.89),
      member('sweep', 'sweep', -119.995, { accuracyMeters: 150 }),
    ],
  }));
  assert.equal(poorAccuracy.status, 'unavailable');
  assert.equal(poorAccuracy.excludedSummary.inaccurateOrUnknown, 1);

  const restrictedMember = engine.planConvoyRegroup(baseInput({
    members: [
      member('lead', 'lead', -119.89),
      member('restricted-secret-id', 'sweep', -119.995, {
        label: 'SECRET CALLSIGN',
        locationVisibility: 'restricted',
      }),
    ],
  }));
  const restrictedSerialized = JSON.stringify(restrictedMember);
  assert.equal(restrictedMember.status, 'restricted');
  assert.equal(restrictedMember.excludedSummary.restricted, 1);
  assert.ok(!restrictedSerialized.includes('restricted-secret-id'));
  assert.ok(!restrictedSerialized.includes('SECRET CALLSIGN'));
  assert.ok(!restrictedSerialized.includes('-119.995'));

  const offRoute = engine.planConvoyRegroup(baseInput({
    members: [
      member('lead', 'lead', -119.89),
      member('sweep', 'sweep', -119.995, { coordinate: { lat: 39.006, lng: -119.995 } }),
    ],
  }));
  assert.equal(offRoute.status, 'proposal');
  assert.equal(offRoute.offRouteCount, 1);
  assert.ok(offRoute.warnings.includes('member_off_route'));
  assert.equal(offRoute.proposal.candidate.etaWindow, null);

  const noCandidate = engine.planConvoyRegroup(baseInput({ candidates: [] }));
  assert.equal(noCandidate.status, 'unavailable');
  assert.equal(noCandidate.reasonCode, 'no_known_regroup_candidates');

  const multipleCandidates = engine.planConvoyRegroup(baseInput({
    candidates: [candidate('far', -119.82), candidate('near', -119.87)],
  }));
  assert.equal(multipleCandidates.status, 'proposal');
  assert.equal(multipleCandidates.proposal.candidate.candidate.id, 'near');

  const afterKnownHazard = engine.planConvoyRegroup(baseInput({
    candidates: [candidate('beyond-blocker', -119.84)],
    hazards: [{
      id: 'known-blocker',
      title: 'Known Trail Blockage',
      coordinate: { lat: 39, lng: -119.87 },
      blocking: true,
      sourceTruth: source('known-blocker-source'),
    }],
  }));
  assert.equal(afterKnownHazard.status, 'unavailable');
  assert.equal(afterKnownHazard.reasonCode, 'no_suitable_regroup_candidate');
  assert.equal(afterKnownHazard.candidateEvaluations[0].posture, 'unsuitable');
  assert.ok(afterKnownHazard.candidateEvaluations[0].warningCodes.includes('candidate_beyond_blocking_hazard'));

  const previewInput = baseInput();
  const previewInputBefore = JSON.stringify(previewInput);
  const previewResult = engine.planConvoyRegroup(previewInput);
  assert.equal(JSON.stringify(previewInput), previewInputBefore, 'planner must not mutate input state');
  assert.deepEqual(previewResult.automaticActions, []);
  assert.equal(previewResult.proposal.previewOnly, true);
  assert.equal(previewResult.proposal.operatorActionRequired, true);

  const repeatResult = engine.planConvoyRegroup(previewInput);
  assert.equal(repeatResult.proposal.fingerprint, previewResult.proposal.fingerprint);

  const featureOff = engine.planConvoyRegroup(baseInput({ enabled: false }));
  assert.equal(featureOff.status, 'disabled');
  assert.equal(featureOff.reasonCode, 'feature_disabled');

  const sharingOff = engine.planConvoyRegroup(baseInput({ positionSharingEnabled: false }));
  assert.equal(sharingOff.status, 'restricted');
  assert.equal(sharingOff.reasonCode, 'position_sharing_gate_disabled');

  const permissionDenied = engine.planConvoyRegroup(baseInput({ memberLocationPermissionAllowed: false }));
  assert.equal(permissionDenied.status, 'restricted');
  assert.equal(permissionDenied.inputSources.length, 0);

  const cachedSweep = engine.planConvoyRegroup(baseInput({
    members: [
      member('lead', 'lead', -119.89),
      member('sweep', 'sweep', -119.995, { origin: 'cached' }),
    ],
  }));
  assert.equal(cachedSweep.status, 'unavailable');
  assert.ok(cachedSweep.excludedMembers.some((item) => item.reason === 'non_live_origin'));

  const adapterResult = adapter.selectConvoyRegroupPlannerResult({
    enabled: true,
    positionSharingEnabled: true,
    memberLocationPermissionAllowed: true,
    activeConvoyId: 'convoy-1',
    routeSession: routeSession(),
    trackingConnectionStatus: 'connected',
    members: [
      mapVehicle('lead', 'lead', -119.89),
      mapVehicle('sweep', 'sweep', -119.995),
    ],
    localContext: {
      route: importedRoute(),
      routeContext: null,
      pins: [],
      bailouts: [],
    },
    expeditionId: 'expedition-1',
    now: NOW,
  });
  assert.equal(adapterResult.status, 'proposal');
  assert.equal(adapterResult.proposal.candidate.candidate.title, 'Known Rally Alpha');
  assert.equal(adapterResult.inputSources[0].origin, 'cached', 'offline route geometry must remain cached, not live');

  const mappedContext = adapter.buildConvoyRegroupCandidateContext({
    expeditionId: 'expedition-1',
    localContext: {
      route: importedRoute(),
      routeContext: {
        id: 'route-context-1',
        trailId: 'route-1',
        trailheadAnchor: { coordinate: { lat: 39, lng: -120 }, source: 'route' },
        supplyCandidates: [{
          id: 'supply-1',
          category: 'gas',
          name: 'Known Fuel Stop',
          lat: 39,
          lng: -119.85,
          openStatus: 'open',
          confidence: { value: 90, reasons: [] },
          score: 90,
          warnings: [],
          providerMetadata: { apiKey: 'TOP-SECRET-DO-NOT-RENDER' },
        }],
        selectedSupplyPlan: null,
        routeGeometry: null,
        campCandidates: [{
          id: 'camp-1',
          name: 'Known Camp',
          lat: 39,
          lng: -119.84,
          source: 'normalized camp provider',
          accessStatus: 'open',
          legalStatus: 'explicitly_allowed',
          confidence: { value: 90, reasons: [] },
          warnings: [],
          providerMetadata: { token: 'TOP-SECRET-DO-NOT-RENDER' },
        }],
        bailoutCandidates: [{
          id: 'bailout-1',
          label: 'Known Bailout',
          lat: 39,
          lng: -119.83,
          source: 'normalized bailout provider',
          category: 'road_access',
          reachableByVehicle: true,
          confidence: { value: 80, reasons: [] },
          warnings: [],
          providerMetadata: { authorization: 'TOP-SECRET-DO-NOT-RENDER' },
        }],
        confidence: { value: 85, reasons: [] },
        status: 'ready',
        warnings: [],
        createdAt: minutesAgo(15),
        updatedAt: minutesAgo(5),
        expiresAt: iso(NOW + 60 * 60_000),
        providerMetadata: { rawPayload: 'TOP-SECRET-DO-NOT-RENDER' },
      },
      pins: [{
        id: 'pin-camp-1',
        type: 'camp',
        category: 'waypoint',
        title: 'Local Camp Pin',
        notes: '',
        lat: 39,
        lng: -119.82,
        created_at: minutesAgo(10),
        created_by: 'local',
        expedition_id: 'expedition-1',
        vehicle_id: null,
        severity: null,
        resolved: false,
        photo_url: null,
        icon_key: 'bonfire-outline',
      }],
      bailouts: [{
        id: 'local-bailout-1',
        user_id: null,
        title: 'Local Staging Point',
        type: 'staging',
        lat: 39,
        lng: -119.81,
        notes: null,
        priority: 1,
        is_shared: false,
        created_at: minutesAgo(20),
      }],
    },
  });
  assert.ok(mappedContext.candidates.some((item) => item.type === 'waypoint'));
  assert.ok(mappedContext.candidates.some((item) => item.type === 'camp'));
  assert.ok(mappedContext.candidates.some((item) => item.type === 'resupply'));
  assert.ok(mappedContext.candidates.some((item) => item.type === 'bailout'));
  assert.ok(mappedContext.candidates.some((item) => item.type === 'staging'));
  assert.ok(!JSON.stringify(mappedContext).includes('TOP-SECRET-DO-NOT-RENDER'));
  const verifiedCamp = mappedContext.candidates.find((item) => item.id === 'route-context-camp:camp-1');
  assert.equal(verifiedCamp.access, 'verified_open');
  assert.equal(verifiedCamp.stoppingSuitability, 'verified');
  assert.equal(verifiedCamp.sourceTruth.origin, 'inferred', 'engine output must not be relabeled live without an explicit provider-origin contract');

  let sendCount = 0;
  const rallyDraft = adapter.createConvoyRegroupRallyDraft(adapterResult.proposal);
  assert.equal(sendCount, 0, 'creating a Rally draft must not send anything');
  assert.equal(rallyDraft.requireAcknowledgment, true);
  assert.equal(rallyDraft.rallyLocation, 'waypoint');
  assert.ok(rallyDraft.message.includes('Acknowledge when en route.'));
  assert.ok(rallyDraft.message.includes('ECS team coordination only.'));
  assert.ok(!Object.prototype.hasOwnProperty.call(rallyDraft, 'send'));

  const dispatchContext = adapter.createConvoyRegroupDispatchContext(adapterResult.proposal);
  const contextSerialized = JSON.stringify(dispatchContext);
  assert.equal(dispatchContext.type, 'waypoint');
  assert.equal(dispatchContext.metadata.previewOnly, true);
  assert.ok(!contextSerialized.includes('LEAD'));
  assert.ok(!contextSerialized.includes('SWEEP'));

  const deniedAdapterResult = adapter.selectConvoyRegroupPlannerResult({
    enabled: true,
    positionSharingEnabled: true,
    memberLocationPermissionAllowed: false,
    activeConvoyId: 'convoy-1',
    routeSession: routeSession(),
    trackingConnectionStatus: 'connected',
    members: [mapVehicle('private-member', 'sweep', -119.995)],
    localContext: {
      route: importedRoute(),
      routeContext: null,
      pins: [],
      bailouts: [],
    },
    now: NOW,
  });
  assert.equal(deniedAdapterResult.status, 'restricted');
  assert.ok(!JSON.stringify(deniedAdapterResult).includes('private-member'));

  console.log('Convoy Regroup Planner domain tests passed.');
}

try {
  run();
} finally {
  Module._load = originalLoad;
}
