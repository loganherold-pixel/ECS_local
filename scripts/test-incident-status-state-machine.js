const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
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
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const { incidentRecoveryWorkflowStore } = loadTypeScriptModule('lib/incidentRecoveryWorkflowStore.ts');
const { buildIncidentRecoveryContainerState } = loadTypeScriptModule('lib/incidentRecoveryContainerState.ts');

function createBaseIncident() {
  return incidentRecoveryWorkflowStore.reportIncident({
    expeditionId: 'expedition-status',
    routeLabel: 'West Fork',
    type: 'route_blocked',
    manualLocationDescription: '',
    location: null,
    communicationStatus: 'unknown',
    safety: {
      anyoneInjured: null,
      anyoneMissing: false,
      anyoneTrapped: false,
      activeHazard: true,
      vehicleStable: true,
      groupSafe: true,
    },
    resources: {
      vehicleDisabled: false,
      terrain: 'wash',
      weather: 'windy',
      daylight: 'late afternoon',
      fuelConcern: false,
      waterConcern: false,
      foodConcern: false,
      shelterConcern: false,
      warmthConcern: false,
      medicalKitAvailable: true,
    },
    notes: 'Blocked by debris.',
    reportedBy: 'operator-1',
  });
}

incidentRecoveryWorkflowStore.clear();

const initial = createBaseIncident();
assert.strictEqual(initial.status, 'stabilizing');
assert.strictEqual(
  incidentRecoveryWorkflowStore.canTransitionIncidentStatus('active', 'stabilizing'),
  true,
);
assert.strictEqual(
  incidentRecoveryWorkflowStore.canTransitionIncidentStatus('active', 'resolved'),
  false,
);

const awaitingAssistance = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: initial.id,
  status: 'awaiting_assistance',
  reason: 'Recovery provider requested.',
  actor: 'operator-1',
});

assert(awaitingAssistance, 'Valid status transition should update the incident.');
assert.strictEqual(awaitingAssistance.status, 'awaiting_assistance');
assert.strictEqual(
  awaitingAssistance.recoveryAssessment.recommendedAction,
  'Prepare Communication Packet and keep Timeline current',
);
assert(
  awaitingAssistance.timeline.some((event) => (
    event.type === 'status_changed' &&
    event.status === 'awaiting_assistance' &&
    event.data.fromStatus === 'stabilizing'
  )),
  'Status changes must add a timeline event.',
);

const awaitingContainer = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-status',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
  now: Date.now(),
});

assert.strictEqual(awaitingContainer.displayMode, 'active_incident');
assert.strictEqual(awaitingContainer.status, 'awaiting_assistance');
assert.strictEqual(awaitingContainer.buttonStates.communicationPacket.warning, true);
assert.strictEqual(awaitingContainer.buttonStates.timeline.warning, true);

const resolved = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: initial.id,
  status: 'resolved',
  reason: 'Assistance completed.',
});

assert.strictEqual(resolved.status, 'resolved');

const resolvedContainer = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-status',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
  now: Date.now(),
});

assert.strictEqual(resolvedContainer.displayMode, 'resolved_recent');
assert.strictEqual(resolvedContainer.hasActiveIncident, false);
assert.strictEqual(resolvedContainer.nextRecommendedAction, 'Complete debrief when ready.');
assert.strictEqual(resolvedContainer.buttonStates.resolveDebrief.status, 'complete');

const closed = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: initial.id,
  status: 'closed',
  reason: 'Debrief captured and reviewed.',
});

assert.strictEqual(closed.status, 'closed');

incidentRecoveryWorkflowStore.clear();
const invalid = createBaseIncident();
assert.throws(
  () => incidentRecoveryWorkflowStore.transitionIncidentStatus({
    incidentId: invalid.id,
    status: 'closed',
    reason: 'Invalid skip.',
  }),
  /Invalid incident status transition: stabilizing -> closed/,
);
assert.strictEqual(incidentRecoveryWorkflowStore.getSnapshot()[0].status, 'stabilizing');

const selfRecovery = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: invalid.id,
  status: 'self_recovery_in_progress',
  reason: 'Operator is logging high-level recovery progress.',
});

assert.strictEqual(selfRecovery.status, 'self_recovery_in_progress');
const selfRecoveryContainer = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-status',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
  now: Date.now(),
});
assert.strictEqual(selfRecoveryContainer.nextRecommendedAction, 'Log conservative status updates only');
assert.strictEqual(selfRecoveryContainer.buttonStates.timeline.warning, true);
assert.strictEqual(selfRecoveryContainer.buttonStates.ecsAssessment.status, 'attention_needed');

incidentRecoveryWorkflowStore.clear();
const cancelledBase = createBaseIncident();
const cancelled = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: cancelledBase.id,
  status: 'cancelled',
  reason: 'Report was opened by mistake.',
});
assert.strictEqual(cancelled.status, 'cancelled');
const cancelledContainer = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-status',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
  now: Date.now(),
});
assert.strictEqual(cancelledContainer.displayMode, 'resolved_recent');
assert.strictEqual(cancelledContainer.hasActiveIncident, false);

incidentRecoveryWorkflowStore.clear();

console.log('Incident status state machine checks passed.');
