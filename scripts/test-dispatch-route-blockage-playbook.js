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
Module._load = function loadWithNativeStub(request, parent, isMain) {
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
const blockage = require(path.join(root, 'lib', 'dispatchRouteBlockagePlaybook.ts'));
const runtimeAdapter = require(path.join(root, 'lib', 'dispatchRouteBlockageRuntimeAdapter.ts'));
const playbooks = require(path.join(root, 'lib', 'dispatchOperationalPlaybookDomain.ts'));
const { dispatchPersistenceAdapter } = require(path.join(root, 'lib', 'dispatchPersistenceAdapter.ts'));

const BASE_TIME = '2026-07-14T18:00:00.000Z';
const ACTOR = { id: 'lead-one', label: 'Lead', role: 'owner' };
const REPORTER = { id: 'sweep-one', label: 'Sweep', roleId: 'member' };
const MEMBER = { id: 'trail-two', label: 'Trail 2', roleId: 'member' };
const CAPABILITIES = new Set([
  'mission_command',
  'mission_clock',
  'linked_context',
  'assignment',
  'acknowledgment',
  'offline_operation',
]);

function at(minutes) {
  return new Date(Date.parse(BASE_TIME) + minutes * 60_000).toISOString();
}

function source(id, overrides = {}) {
  return {
    id,
    origin: 'cached',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS fixture',
    authorityKind: 'ecs',
    observedAt: BASE_TIME,
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: [],
    ...overrides,
  };
}

function context(id, type, title, sourceTruth, coordinates) {
  return {
    id,
    type,
    title,
    coordinates,
    observedAt: sourceTruth.observedAt,
    sourceTruthPolicyKey: sourceTruth.policyKey,
    sourceTruth,
  };
}

function evidence(label, kind, sourceTruth, state = 'available') {
  return {
    label,
    kind,
    state,
    observedAt: sourceTruth.observedAt,
    sourceTruth: [sourceTruth],
  };
}

function baseInput(overrides = {}) {
  const reportSource = source('member-report', {
    origin: 'manual',
    authority: REPORTER.label,
    authorityKind: 'user',
    policyKey: 'manual_user_state',
    warningCodes: ['manual_source', 'not_official_closure_evidence'],
  });
  const routeSource = source('active-route', { authority: 'Navigate route session' });
  const officialSource = source('official-closure', {
    origin: 'live',
    authority: 'USFS closure order',
    authorityKind: 'official',
    policyKey: 'route_legal_access_evidence',
  });
  const conditionSource = source('condition-advisory', {
    origin: 'live',
    authority: 'Local ranger current-condition advisory',
    authorityKind: 'official',
    policyKey: 'condition_closure_advisory',
  });
  const alternateSource = source('alternate-route', { authority: 'Saved route asset' });
  return {
    expeditionId: 'expedition-route-blockage',
    actor: ACTOR,
    soloMode: false,
    online: true,
    reportSourceKind: 'member_report',
    reportedCondition: 'blocked',
    reporter: REPORTER,
    affectedMembers: [REPORTER, MEMBER],
    observationTime: BASE_TIME,
    confidence: 'medium',
    reportSourceTruth: [reportSource],
    locationContext: context(
      'blockage-pin',
      'pin',
      'Reported blockage',
      reportSource,
      { latitude: 39.7392, longitude: -104.9903 },
    ),
    locationPermitted: true,
    activeRouteContext: context('route-active', 'route', 'North Ridge Route', routeSource),
    activeRouteSegmentContext: {
      ...context('route-active:segment:2', 'route_segment', 'North Ridge segment 3', routeSource),
      routeSegmentId: 'route-active:segment:2',
    },
    routeImpactState: 'affects_active_route',
    routeImpactLabel: 'Reported location is 12 m from active route geometry.',
    legalAccessEvidence: evidence('Official closure order is active', 'official_closure', officialSource),
    currentConditionEvidence: evidence('Current washout advisory', 'current_condition_advisory', conditionSource),
    weatherFireEvidence: evidence(
      'Recent rain; fire closure status not inferred',
      'weather_fire_context',
      source('weather', { origin: 'live', authorityKind: 'provider', policyKey: 'weather_observation' }),
    ),
    alternateCandidates: [{
      id: 'route-alternate',
      label: 'South Fork Alternate',
      context: context('route-alternate', 'route', 'South Fork Alternate', alternateSource),
      comparisonOutcome: 'mixed',
      comparisonSummary: 'Distance improves, while legal access and current conditions remain unknown.',
      materialCategories: ['distance'],
      requiredUnknownCategories: ['legal_access', 'current_conditions'],
      sourceTruth: [alternateSource],
    }],
    bailoutContext: context(
      'bailout-one',
      'bailout',
      'West Trailhead Turnaround',
      source('bailout', { origin: 'cached' }),
      { latitude: 39.73, longitude: -105.01 },
    ),
    campReassessmentState: 'recommended',
    campImpactLabel: 'Distance change materially affects arrival assumptions for Backup Camp.',
    offlineReadinessState: 'ready',
    offlineReadinessLabel: 'All required active-route assets are ready.',
    reviewMinutes: 30,
    now: BASE_TIME,
    idempotencyKey: 'route-blockage:create:fixture',
    ...overrides,
  };
}

function runtime(denied = []) {
  return {
    availableCapabilities: CAPABILITIES,
    online: true,
    permissions: {
      can: (action) => denied.includes(action)
        ? { allowed: false, reason: 'Denied by fixture.' }
        : { allowed: true },
    },
  };
}

function expectChanged(result) {
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.changed, true);
  return result.instance;
}

function transition(instance, next, minute) {
  return expectChanged(playbooks.transitionOperationalPlaybookState(
    blockage.ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION,
    instance,
    next,
    {
      actor: ACTOR,
      runtime: runtime(),
      occurredAt: at(minute),
      idempotencyKey: `route-blockage:state:${next}:${minute}`,
    },
  ));
}

let actionSequence = 0;
function execute(instance, action, minute) {
  actionSequence += 1;
  return playbooks.executeOperationalPlaybookStep(
    blockage.ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION,
    instance,
    {
      actor: ACTOR,
      action,
      occurredAt: at(minute),
      idempotencyKey: `route-blockage:action:${actionSequence}`,
    },
    runtime(),
  );
}

const definitionValidation = playbooks.validateOperationalPlaybookDefinition(
  blockage.ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION,
);
assert.equal(definitionValidation.valid, true, JSON.stringify(definitionValidation.issues));

const official = blockage.createRouteBlockagePlaybook(baseInput({ reportedCondition: 'unsafe_to_continue' }));
assert.equal(official.ok, true, official.reason);
const officialReview = blockage.selectRouteBlockageContextReview({
  instance: official.instance,
  members: [ACTOR, REPORTER, MEMBER],
  now: BASE_TIME,
});
assert.equal(officialReview.officialClosureState, 'current');
assert.equal(officialReview.reportSourceKind, 'member_report');
assert.notEqual(
  officialReview.legalAccessEvidence.sourceTruth[0].id,
  official.instance.inputSnapshot[blockage.ROUTE_BLOCKAGE_INPUT_KEYS.reportContext].sourceTruth[0].id,
  'Member report and official legal/access evidence must remain separate.',
);
assert.equal(officialReview.publicPublishingAllowed, false);
assert.match(officialReview.safetyStatement, /does not prove passability/i);

const memberOnly = blockage.createRouteBlockagePlaybook(baseInput({
  legalAccessEvidence: null,
  currentConditionEvidence: null,
  idempotencyKey: 'route-blockage:create:member-only',
}));
assert.equal(memberOnly.ok, true);
const memberReview = blockage.selectRouteBlockageContextReview({ instance: memberOnly.instance, now: BASE_TIME });
assert.equal(memberReview.officialClosureState, 'not_established');
assert.equal(memberReview.legalAccessEvidence.state, 'missing');
assert.match(memberReview.legalAccessEvidence.label, /unavailable/i);

const currentOnly = blockage.createRouteBlockagePlaybook(baseInput({
  legalAccessEvidence: null,
  idempotencyKey: 'route-blockage:create:condition-only',
}));
assert.equal(currentOnly.ok, true);
const currentReview = blockage.selectRouteBlockageContextReview({ instance: currentOnly.instance, now: BASE_TIME });
assert.equal(currentReview.officialClosureState, 'not_established');
assert.equal(currentReview.currentConditionEvidence.kind, 'current_condition_advisory');

const conflictSource = source('official-conflict', {
  origin: 'live',
  authorityKind: 'official',
  policyKey: 'route_legal_access_evidence',
  conflictState: 'present',
  conflict: true,
  warningCodes: ['provider_conflict'],
});
const conflicting = blockage.createRouteBlockagePlaybook(baseInput({
  legalAccessEvidence: evidence('Official sources conflict', 'official_closure', conflictSource, 'conflicting'),
  idempotencyKey: 'route-blockage:create:conflict',
}));
assert.equal(conflicting.ok, true);
assert.equal(blockage.selectRouteBlockageContextReview({ instance: conflicting.instance, now: BASE_TIME }).officialClosureState, 'conflicting');

const staleSource = source('official-stale', {
  origin: 'cached',
  authorityKind: 'official',
  policyKey: 'route_legal_access_evidence',
  observedAt: at(-60 * 24 * 45),
});
const stale = blockage.createRouteBlockagePlaybook(baseInput({
  legalAccessEvidence: evidence('Old official closure record', 'official_closure', staleSource, 'stale'),
  idempotencyKey: 'route-blockage:create:stale',
}));
assert.equal(stale.ok, true);
assert.equal(blockage.selectRouteBlockageContextReview({ instance: stale.instance, now: BASE_TIME }).officialClosureState, 'stale');

const staleMemberReport = blockage.createRouteBlockagePlaybook(baseInput({
  observationTime: at(-48 * 60),
  reportSourceTruth: [source('stale-member-report', {
    origin: 'manual',
    authority: REPORTER.label,
    authorityKind: 'user',
    policyKey: 'condition_closure_advisory',
    observedAt: at(-48 * 60),
    warningCodes: ['manual_source', 'not_official_closure_evidence'],
  })],
  idempotencyKey: 'route-blockage:create:stale-member-report',
}));
assert.equal(staleMemberReport.ok, true);
const staleMemberReview = blockage.selectRouteBlockageContextReview({ instance: staleMemberReport.instance, now: BASE_TIME });
assert.ok(['stale', 'expired'].includes(staleMemberReview.reportFreshness));
assert.equal(staleMemberReview.officialClosureState, 'current', 'Stale report freshness must not rewrite separate official evidence.');

const noAlternate = blockage.createRouteBlockagePlaybook(baseInput({
  alternateCandidates: [],
  campReassessmentState: 'unknown',
  idempotencyKey: 'route-blockage:create:no-alternate',
}));
assert.equal(noAlternate.ok, true);
const noAlternateReview = blockage.selectRouteBlockageContextReview({ instance: noAlternate.instance, now: BASE_TIME });
assert.deepEqual(noAlternateReview.alternateCandidates, []);
assert.equal(blockage.validateRouteBlockageOutcome({
  instance: noAlternate.instance,
  outcome: 'alternate_route_selected',
  explicitOperatorChoice: true,
}).allowed, false);

const adapterInput = runtimeAdapter.buildRouteBlockageRuntimeInput({
  expeditionId: 'expedition-runtime',
  actor: ACTOR,
  soloMode: false,
  online: false,
  reportSourceKind: 'member_report',
  reportedCondition: 'blocked',
  reporter: REPORTER,
  affectedMembers: [REPORTER],
  observationTime: BASE_TIME,
  confidence: 'medium',
  locationPermitted: true,
  locationContext: context(
    'runtime-pin',
    'pin',
    'Runtime blockage',
    source('runtime-report', { origin: 'manual', authorityKind: 'user' }),
    { latitude: 39.7392, longitude: -104.9903 },
  ),
  activeRouteSession: {
    sessionId: 'session-active', lifecycle: 'active', source: 'trail', routeId: 'route-active',
    routeTitle: 'North Ridge', routeSubtitle: null, statusLabel: 'Guidance active', instruction: null,
    routePoints: [{ lat: 39.7392, lng: -104.9902 }, { lat: 39.75, lng: -105.0 }],
    progressPoints: [], currentLocation: null, headingDeg: null, remainingDistanceM: 10000,
    remainingDurationS: 3600, etaIso: at(60), progressPercent: 30, nextInstructionDistanceM: null,
    isRerouting: false, isOffRoute: false, offRouteDistanceM: null, routeStatusKind: 'nominal', updatedAt: BASE_TIME,
  },
  savedRoutes: [],
  bailouts: [],
  offlineManifest: null,
  offlineAudit: null,
  now: BASE_TIME,
});
assert.equal(adapterInput.routeImpactState, 'affects_active_route');
assert.equal(adapterInput.offlineReadinessState, 'missing');
assert.equal(adapterInput.online, false);
assert.deepEqual(adapterInput.alternateCandidates, []);

const restrictedAdapterInput = runtimeAdapter.buildRouteBlockageRuntimeInput({
  ...adapterInput,
  locationContext: context(
    'restricted-runtime-pin',
    'pin',
    'Restricted blockage',
    source('restricted-runtime-report', { origin: 'manual', authorityKind: 'user' }),
    { latitude: 38.1, longitude: -106.2 },
  ),
  locationPermitted: false,
});
assert.equal(restrictedAdapterInput.locationContext.restricted, true);
assert.equal(restrictedAdapterInput.locationContext.coordinates, undefined);
assert.doesNotMatch(JSON.stringify(restrictedAdapterInput), /38\.1|-106\.2/);

const activeGuidance = {
  lifecycle: 'active',
  routeId: 'route-active',
  sessionId: 'session-active',
  routeTitle: 'North Ridge',
};
const guidanceGuard = blockage.evaluateRouteBlockageGuidanceHandoff({
  payload: { id: 'route-alternate', routeMetadata: {} },
  activeGuidance,
  explicitOperatorChoice: true,
});
assert.equal(guidanceGuard.allowed, false);
assert.equal(guidanceGuard.requiresConfirmation, true);
assert.equal(guidanceGuard.mutationAllowed, false);
assert.equal(activeGuidance.routeId, 'route-active', 'Guard evaluation must not mutate active guidance.');

let flow = transition(transition(official.instance, 'ready', 0.1), 'active', 0.2);
flow = expectChanged(execute(flow, { kind: 'complete_review' }, 1));
flow = expectChanged(execute(flow, { kind: 'open_context' }, 2));
flow = expectChanged(execute(flow, { kind: 'complete_review' }, 3));
flow = expectChanged(execute(flow, { kind: 'prepare_command_proposal' }, 4));
const proposal = flow.commandProposals[0];
assert.equal(proposal.type, 'hazard');
assert.equal(proposal.status, 'proposed');
assert.deepEqual(proposal.target.memberIds.sort(), [REPORTER.id, MEMBER.id].sort());
assert.equal(proposal.acknowledgmentPolicy.mode, 'all');
assert.equal(proposal.commandId, undefined);
flow = expectChanged(execute(flow, {
  kind: 'confirm_command_proposal',
  proposalId: proposal.id,
  confirmed: true,
}, 4.5));
assert.equal(flow.commandProposals[0].status, 'confirmed');
assert.equal(flow.commandProposals[0].commandId, undefined, 'Confirmation must not create or send the command.');
flow = expectChanged(execute(flow, { kind: 'complete_review' }, 5));
const alternate = blockage.selectRouteBlockageContextReview({ instance: flow, now: at(5) }).alternateCandidates[0];
const selectedInput = {
  schemaVersion: 1,
  key: blockage.ROUTE_BLOCKAGE_INPUT_KEYS.selectedAlternateRouteId,
  kind: 'text',
  state: 'available',
  scalarValue: alternate.id,
  sourceTruth: flow.inputSnapshot[blockage.ROUTE_BLOCKAGE_INPUT_KEYS.alternateCandidates].sourceTruth,
  observedAt: at(6),
  capturedAt: at(6),
  capturedBy: ACTOR,
  manual: true,
};
flow = expectChanged(execute(flow, { kind: 'provide_input', input: selectedInput }, 6));
flow = expectChanged(execute(flow, { kind: 'open_context' }, 7));
flow = expectChanged(execute(flow, { kind: 'complete_review' }, 8));
flow = expectChanged(execute(flow, { kind: 'complete_review' }, 9));
assert.equal(blockage.validateRouteBlockageOutcome({
  instance: flow,
  outcome: 'alternate_route_selected',
  explicitOperatorChoice: true,
}).allowed, true);
flow = expectChanged(execute(flow, {
  kind: 'record_decision',
  decision: 'incident_created',
  reasonCode: 'operator_selected_route_blockage_outcome',
}, 10));
flow = expectChanged(execute(flow, {
  kind: 'start_deadline',
  dueAt: at(30),
  title: 'Route blockage review',
  reason: 'Review acknowledgments and evidence.',
}, 11));
flow = expectChanged(execute(flow, {
  kind: 'request_acknowledgment',
  targetIds: [REPORTER.id, MEMBER.id],
  requiredCount: 2,
}, 12));
const acknowledgment = flow.stepResults.find((result) => result.data.kind === 'acknowledgment_requested');
assert.ok(acknowledgment);
assert.equal(acknowledgment.data.requiredCount, 2);
assert.deepEqual(acknowledgment.data.targetIds.sort(), [REPORTER.id, MEMBER.id].sort());
const incidentHandoff = blockage.buildRouteBlockageIncidentHandoff({
  instance: flow,
  explicitOperatorChoice: true,
  now: at(12),
});
assert.equal(incidentHandoff.ok, true, incidentHandoff.reason);
assert.equal(
  incidentHandoff.prefill.safety.activeHazard,
  null,
  'A reported unsafe condition must remain a sourced report, not become a confirmed incident safety conclusion.',
);
assert.match(incidentHandoff.prefill.notes, /user report/i);

const incidentValidation = blockage.validateRouteBlockageOutcome({
  instance: official.instance,
  outcome: 'incident_created',
  explicitOperatorChoice: true,
});
assert.equal(incidentValidation.allowed, true);
const prematureIncident = blockage.buildRouteBlockageIncidentHandoff({
  instance: official.instance,
  explicitOperatorChoice: true,
});
assert.equal(prematureIncident.ok, false, 'Incident form must not open before the outcome is explicitly recorded.');

const persistenceDefaults = {
  pings: [], queueItems: [], assignments: [], assistRequests: [], acknowledgments: [],
  timelineEvents: [], offlineActions: [], cadEvents: [],
};
dispatchPersistenceAdapter.upsertOperationalPlaybook('expedition-route-blockage', persistenceDefaults, memberOnly.instance);
const restored = dispatchPersistenceAdapter.load('expedition-route-blockage', persistenceDefaults)
  .operationalPlaybooks.find((item) => item.id === memberOnly.instance.id);
assert.ok(restored);
assert.equal(restored.definitionId, blockage.ROUTE_BLOCKAGE_PLAYBOOK_ID);

const domainSource = fs.readFileSync(path.join(root, 'lib', 'dispatchRouteBlockagePlaybook.ts'), 'utf8');
assert.match(domainSource, /ROUTE_BLOCKAGE_PUBLIC_PUBLISHING_ENABLED = false/);
assert.doesNotMatch(domainSource, /publishHazardPublicly|contactEmergencyServices|sendSms|placePhoneCall|setInterval/);
assert.doesNotMatch(domainSource, /routeStore\.setActive|startGuidance|replaceActiveGuidance/);

console.log('Dispatch Route Blockage Operational Playbook checks passed.');
