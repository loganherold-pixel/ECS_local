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
const immobilized = require(path.join(root, 'lib', 'dispatchVehicleImmobilizedPlaybook.ts'));
const playbooks = require(path.join(root, 'lib', 'dispatchOperationalPlaybookDomain.ts'));
const commandDomain = require(path.join(root, 'lib', 'dispatchMissionCommandDomain.ts'));
const { dispatchPersistenceAdapter } = require(path.join(root, 'lib', 'dispatchPersistenceAdapter.ts'));

const BASE_TIME = '2026-07-14T18:00:00.000Z';
const ACTOR = { id: 'lead-operator', label: 'Expedition Lead', role: 'owner' };
const DRIVER = { id: 'driver-one', label: 'Trail 2', roleId: 'member' };
const LEAD = { id: 'recovery-lead', label: 'Recovery Lead', roleId: 'owner' };
const SPOTTER = { id: 'spotter-one', label: 'Spotter', roleId: 'member' };
const CAPABILITIES = new Set([
  'mission_command',
  'mission_clock',
  'linked_context',
  'assignment',
  'acknowledgment',
  'offline_operation',
]);

function at(minutes, milliseconds = 0) {
  return new Date(Date.parse(BASE_TIME) + minutes * 60_000 + milliseconds).toISOString();
}

function source(id, overrides = {}) {
  return {
    id,
    origin: 'cached',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS test fixture',
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

function evidence(label, state = 'available', id = label.toLowerCase().replace(/\W+/g, '-')) {
  return {
    label,
    state,
    observedAt: BASE_TIME,
    sourceTruth: [source(id, state === 'stale' ? { observedAt: at(-180) } : {})],
  };
}

function runtime(denied = []) {
  return {
    availableCapabilities: CAPABILITIES,
    online: true,
    permissions: {
      can: (action) => denied.includes(action)
        ? { allowed: false, reason: 'Denied by test policy.' }
        : { allowed: true },
    },
  };
}

function create(overrides = {}) {
  return immobilized.createVehicleImmobilizedPlaybook({
    expeditionId: 'expedition-immobilized',
    actor: ACTOR,
    soloMode: false,
    online: true,
    affectedVehicle: {
      id: 'vehicle-affected',
      label: 'Trail Truck',
      ownerMemberId: DRIVER.id,
      sourceTruth: [source('fleet-vehicle', { origin: 'manual' })],
      context: {
        id: 'vehicle-affected',
        type: 'vehicle',
        title: 'Trail Truck',
        sourceTruthPolicyKey: 'manual_user_state',
        sourceTruth: source('fleet-vehicle-context', { origin: 'manual' }),
      },
    },
    occupants: [DRIVER],
    initialStatus: {
      vehicleStopped: 'confirmed_stopped',
      peopleAccounted: 'accounted_for',
      immediateHazard: 'unknown',
      communication: 'available',
      routeObstruction: 'unknown',
    },
    locationContext: {
      id: 'vehicle-location',
      type: 'pin',
      title: 'Last verified vehicle location',
      coordinates: { latitude: 39.7392, longitude: -104.9903 },
      observedAt: at(-2),
      stale: false,
      sourceTruthPolicyKey: 'convoy_member_location',
      sourceTruth: source('vehicle-location', {
        origin: 'live',
        policyKey: 'convoy_member_location',
        observedAt: at(-2),
      }),
    },
    routeContext: {
      id: 'route-active',
      type: 'route',
      title: 'North Ridge Route',
      sourceTruthPolicyKey: 'manual_user_state',
      sourceTruth: source('route-context'),
    },
    routeSegmentContext: {
      id: 'route-active:4',
      type: 'route_segment',
      title: 'North Ridge segment 4',
      routeSegmentId: 'route-active:4',
      coordinates: { latitude: 39.74, longitude: -104.99 },
      sourceTruthPolicyKey: 'manual_user_state',
      sourceTruth: source('route-segment'),
    },
    bailoutOrCampContext: {
      id: 'camp-backup',
      type: 'camp',
      title: 'Backup Camp',
      coordinates: { latitude: 39.75, longitude: -105.01 },
      sourceTruthPolicyKey: 'route_legal_access_evidence',
      sourceTruth: source('camp-context', {
        origin: 'cached',
        policyKey: 'route_legal_access_evidence',
        confidence: 'medium',
        coverage: 'partial',
        warningCodes: ['legal_access_unknown'],
      }),
    },
    terrain: evidence('Cached route terrain: moderate planning risk', 'stale', 'terrain'),
    attitude: evidence('Live vehicle attitude unavailable', 'unavailable', 'attitude'),
    weather: evidence('Recent weather: light rain, 48 F', 'available', 'weather'),
    daylight: evidence('84 minutes of estimated daylight remain', 'available', 'daylight'),
    convoy: evidence('Active convoy with 4 members', 'available', 'convoy'),
    recoveryEquipment: evidence('Recovery gear readiness unknown', 'missing', 'recovery-equipment'),
    vehicleReadiness: evidence('Fleet profile is partial', 'available', 'vehicle-readiness'),
    communicationState: evidence('Dispatch connection available', 'available', 'communications'),
    recoveryCapableVehicles: [
      { id: 'vehicle-recovery', label: 'Support Rig', memberIds: [LEAD.id], sourceTruth: [source('support-rig', { origin: 'manual' })] },
    ],
    recoveryLeadCandidates: [LEAD],
    spotterCandidates: [SPOTTER],
    leadMemberId: ACTOR.id,
    sweepMemberId: SPOTTER.id,
    approvedRecoveryProtocols: [
      { id: 'winch-recovery', title: 'Winch Recovery' },
      { id: 'vehicle-assisted-pull', title: 'Vehicle-Assisted Pull' },
    ],
    statusReviewMinutes: 30,
    now: BASE_TIME,
    idempotencyKey: 'vehicle-immobilized:create:vehicle-affected',
    ...overrides,
  });
}

function expectChanged(result) {
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.changed, true);
  return result.instance;
}

function transition(instance, next, minute, denied = []) {
  return expectChanged(playbooks.transitionOperationalPlaybookState(
    immobilized.VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION,
    instance,
    next,
    {
      actor: ACTOR,
      runtime: runtime(denied),
      occurredAt: at(minute),
      idempotencyKey: `vehicle-immobilized:state:${next}:${minute}`,
    },
  ));
}

function execute(instance, action, minute, key, denied = []) {
  return playbooks.executeOperationalPlaybookStep(
    immobilized.VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION,
    instance,
    { actor: ACTOR, action, occurredAt: at(minute), idempotencyKey: `vehicle-immobilized:${key}` },
    runtime(denied),
  );
}

const created = create();
assert.equal(created.ok, true);
assert.equal(created.instance.definitionId, immobilized.VEHICLE_IMMOBILIZED_PLAYBOOK_ID);
assert.equal(created.instance.lastKnownConnectivity, 'online');
const initialReview = immobilized.selectVehicleImmobilizedContextReview({
  instance: created.instance,
  commands: [],
  now: BASE_TIME,
});
assert.equal(initialReview.vehicleLabel, 'Trail Truck');
assert.equal(initialReview.locationState, 'recent');
assert.equal(initialReview.recoveryEquipment.state, 'missing');
assert.match(initialReview.recoveryEquipment.label, /unknown/i);
assert.equal(initialReview.attitude.state, 'unavailable');
assert.deepEqual(initialReview.approvedRecoveryProtocols.map((item) => item.id), ['winch-recovery', 'vehicle-assisted-pull']);
assert.match(initialReview.safetyStatement, /does not begin a recovery/i);

const stale = create({
  locationContext: {
    ...create().instance.inputSnapshot[immobilized.VEHICLE_IMMOBILIZED_INPUT_KEYS.locationContext].linkedContext,
    stale: true,
    observedAt: at(-180),
    sourceTruth: source('stale-location', {
      origin: 'cached',
      policyKey: 'convoy_member_location',
      observedAt: at(-180),
    }),
  },
  idempotencyKey: 'vehicle-immobilized:create:stale-location',
});
assert.equal(stale.ok, true);
const staleReview = immobilized.selectVehicleImmobilizedContextReview({ instance: stale.instance, commands: [], now: BASE_TIME });
assert.ok(['stale', 'expired'].includes(staleReview.locationState));
assert.match(staleReview.locationLabel, /last verified/i);

const restricted = create({
  locationContext: {
    id: 'restricted-location',
    type: 'member',
    title: 'Restricted member location',
    restricted: true,
    coordinates: { latitude: 10, longitude: 20 },
    sourceTruthPolicyKey: 'convoy_member_location',
    sourceTruth: source('restricted-location', { policyKey: 'convoy_member_location' }),
  },
  idempotencyKey: 'vehicle-immobilized:create:restricted-location',
});
assert.equal(restricted.ok, true);
const persistedRestricted = JSON.stringify(restricted.instance);
assert.doesNotMatch(persistedRestricted, /"latitude":10|"longitude":20/);
assert.equal(restricted.instance.inputSnapshot[immobilized.VEHICLE_IMMOBILIZED_INPUT_KEYS.locationContext].state, 'restricted');

let flow = transition(transition(created.instance, 'ready', 0.1), 'active', 0.2);
flow = expectChanged(execute(flow, { kind: 'complete_review' }, 1, 'review-status'));
flow = expectChanged(execute(flow, {
  kind: 'confirm_action',
  confirmed: true,
  summary: 'Initial operator-entered status reviewed; unknown facts remain unknown.',
}, 2, 'confirm-status'));
flow = expectChanged(execute(flow, { kind: 'prepare_command_proposal' }, 3, 'prepare-regroup'));
const regroupProposal = flow.commandProposals.find((item) => item.stepId === immobilized.VEHICLE_IMMOBILIZED_STEP_IDS.proposeConvoyStop);
assert.ok(regroupProposal);
assert.equal(regroupProposal.status, 'proposed');
assert.equal(regroupProposal.type, 'rally');
assert.deepEqual(regroupProposal.acknowledgmentPolicy.targetMemberIds.sort(), [ACTOR.id, SPOTTER.id].sort());
flow = expectChanged(execute(flow, {
  kind: 'confirm_command_proposal',
  proposalId: regroupProposal.id,
  confirmed: true,
}, 4, 'confirm-regroup'));
assert.equal(flow.commandProposals[0].status, 'confirmed');
assert.equal(flow.commandProposals[0].commandId, undefined, 'Proposal confirmation must not create or send a command.');

flow = expectChanged(execute(flow, {
  kind: 'assign_role',
  roleId: 'recovery_lead',
  assigneeId: LEAD.id,
  label: LEAD.label,
}, 5, 'assign-lead'));
flow = expectChanged(execute(flow, {
  kind: 'assign_role',
  roleId: 'spotter',
  assigneeId: SPOTTER.id,
  label: SPOTTER.label,
}, 6, 'assign-spotter'));

const deniedAssignment = execute(
  transition(transition(create({ idempotencyKey: 'vehicle-immobilized:create:denied' }).instance, 'ready', 0.3), 'active', 0.4),
  { kind: 'complete_review' },
  1,
  'denied-review',
);
assert.equal(deniedAssignment.ok, true);
let deniedFlow = deniedAssignment.instance;
deniedFlow = expectChanged(execute(deniedFlow, { kind: 'confirm_action', confirmed: true, summary: 'Reviewed.' }, 2, 'denied-confirm'));
deniedFlow = expectChanged(execute(deniedFlow, { kind: 'prepare_command_proposal' }, 3, 'denied-proposal'));
const deniedProposal = deniedFlow.commandProposals[0];
deniedFlow = expectChanged(execute(deniedFlow, { kind: 'confirm_command_proposal', proposalId: deniedProposal.id, confirmed: true }, 4, 'denied-proposal-confirm'));
const deniedResult = execute(deniedFlow, { kind: 'assign_role', roleId: 'recovery_lead', assigneeId: LEAD.id }, 5, 'denied-lead', ['assign_member']);
assert.equal(deniedResult.ok, false);
assert.equal(deniedResult.safeCode, 'playbook_permission_denied');
assert.equal(deniedResult.changed, false);

const noConvoy = create({
  soloMode: true,
  convoy: evidence('No active convoy', 'unavailable', 'no-convoy'),
  leadMemberId: null,
  sweepMemberId: null,
  recoveryLeadCandidates: [],
  spotterCandidates: [],
  recoveryCapableVehicles: [],
  idempotencyKey: 'vehicle-immobilized:create:solo',
});
assert.equal(noConvoy.ok, true, 'Vehicle Immobilized remains useful in solo/local mode.');
const noConvoyReview = immobilized.selectVehicleImmobilizedContextReview({ instance: noConvoy.instance, commands: [], now: BASE_TIME });
assert.equal(noConvoyReview.convoyAvailable, false);
assert.equal(noConvoyReview.recoveryLeadCandidates.length, 0);
assert.equal(noConvoyReview.spotterSupported, false);

const blockedWithoutConfirmation = create({ idempotencyKey: 'vehicle-immobilized:create:blocked-unconfirmed' });
assert.equal(blockedWithoutConfirmation.ok, true);
const invalidBlocked = immobilized.validateVehicleImmobilizedOutcome({
  instance: blockedWithoutConfirmation.instance,
  outcome: 'route_blocked',
  explicitOperatorChoice: true,
});
assert.equal(invalidBlocked.allowed, false);
assert.equal(invalidBlocked.safeCode, 'vehicle_immobilized_route_blockage_unconfirmed');

const routeBlocked = create({
  initialStatus: {
    vehicleStopped: 'confirmed_stopped',
    peopleAccounted: 'accounted_for',
    immediateHazard: 'present',
    communication: 'available',
    routeObstruction: 'blocked',
  },
  idempotencyKey: 'vehicle-immobilized:create:route-blocked',
});
assert.equal(routeBlocked.ok, true);
assert.equal(immobilized.validateVehicleImmobilizedOutcome({
  instance: routeBlocked.instance,
  outcome: 'route_blocked',
  explicitOperatorChoice: true,
}).allowed, true);

const overnight = create({ idempotencyKey: 'vehicle-immobilized:create:overnight' });
assert.equal(overnight.ok, true);
assert.equal(immobilized.validateVehicleImmobilizedOutcome({
  instance: overnight.instance,
  outcome: 'camp_overnight_decision_required',
  explicitOperatorChoice: true,
}).allowed, true);
assert.equal(
  overnight.instance.inputSnapshot[immobilized.VEHICLE_IMMOBILIZED_INPUT_KEYS.bailoutOrCampContext].linkedContext.title,
  'Backup Camp',
);

const offline = create({ online: false, idempotencyKey: 'vehicle-immobilized:create:offline' });
assert.equal(offline.ok, true);
assert.equal(offline.instance.lastKnownConnectivity, 'offline');
assert.equal(offline.instance.inputSnapshot[immobilized.VEHICLE_IMMOBILIZED_INPUT_KEYS.communicationState].state, 'available');

let incidentFlow = routeBlocked.instance;
incidentFlow = transition(transition(incidentFlow, 'ready', 0.5), 'active', 0.6);
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'complete_review' }, 1, 'incident-review'));
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'confirm_action', confirmed: true, summary: 'Initial status reviewed.' }, 2, 'incident-confirm'));
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'prepare_command_proposal' }, 3, 'incident-proposal'));
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'skip', reason: 'Command proposal retained for separate operator review.' }, 4, 'incident-skip-proposal'));
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'assign_role', roleId: 'recovery_lead', assigneeId: LEAD.id, label: LEAD.label }, 5, 'incident-lead'));
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'assign_role', roleId: 'spotter', assigneeId: SPOTTER.id, label: SPOTTER.label }, 6, 'incident-spotter'));
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'open_context' }, 7, 'incident-fleet'));
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'complete_review' }, 8, 'incident-protocols'));
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'open_context' }, 9, 'incident-location'));
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'open_context' }, 10, 'incident-route'));
incidentFlow = expectChanged(execute(incidentFlow, { kind: 'open_context' }, 11, 'incident-camp'));
incidentFlow = expectChanged(execute(incidentFlow, {
  kind: 'record_decision',
  decision: 'route_blocked',
  reasonCode: 'operator_selected_vehicle_immobilized_outcome',
}, 12, 'incident-outcome'));
const prematureIncident = immobilized.buildVehicleImmobilizedIncidentHandoff({
  instance: incidentFlow,
  outcome: 'vehicle_remains_immobilized',
  explicitOperatorChoice: true,
  now: at(12),
});
assert.equal(prematureIncident.ok, false);
assert.equal(prematureIncident.safeCode, 'vehicle_immobilized_outcome_not_recorded');
const incident = immobilized.buildVehicleImmobilizedIncidentHandoff({
  instance: incidentFlow,
  outcome: 'route_blocked',
  explicitOperatorChoice: true,
  now: at(12),
});
assert.equal(incident.ok, true);
assert.equal(incident.prefill.type, 'route_blocked');
assert.equal(incident.prefill.safety.activeHazard, true);
assert.equal(incident.prefill.safety.vehicleStable, null, 'Stopped must not imply stable.');
assert.equal(incident.prefill.resources.vehicleDisabled, true);
assert.match(incident.prefill.notes, /does not diagnose mechanical failure/i);
assert.match(incident.prefill.notes, /does not contact external assistance/i);

const sourceText = fs.readFileSync(path.join(root, 'lib', 'dispatchVehicleImmobilizedPlaybook.ts'), 'utf8');
assert.doesNotMatch(sourceText, /\.reportIncident\(|contactEmergencyServices|sendSms|placePhoneCall/);
assert.doesNotMatch(sourceText, /attach (?:a )?(?:strap|line)|apply (?:steady|gentle) throttle|select a strong (?:tree|anchor)|dig (?:an|the) anchor/i);
assert.doesNotMatch(sourceText, /setInterval|setTimeout/);

const persistenceDefaults = {
  pings: [], queueItems: [], assignments: [], assistRequests: [], acknowledgments: [],
  timelineEvents: [], offlineActions: [], cadEvents: [],
};
dispatchPersistenceAdapter.upsertOperationalPlaybook('expedition-immobilized', persistenceDefaults, offline.instance);
const restored = dispatchPersistenceAdapter.load('expedition-immobilized', persistenceDefaults)
  .operationalPlaybooks.find((item) => item.id === offline.instance.id);
assert.ok(restored);
assert.equal(restored.definitionId, immobilized.VEHICLE_IMMOBILIZED_PLAYBOOK_ID);
assert.equal(restored.lastKnownConnectivity, 'offline');

console.log('Dispatch Vehicle Immobilized Operational Playbook checks passed.');
