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

incidentRecoveryWorkflowStore.clear();

const incident = incidentRecoveryWorkflowStore.reportIncident({
  expeditionId: 'expedition-closeout',
  routeLabel: 'High Ridge Connector',
  type: 'vehicle_breakdown',
  manualLocationDescription: 'North switchback turnout',
  location: null,
  communicationStatus: 'available',
  safety: {
    anyoneInjured: false,
    anyoneMissing: false,
    anyoneTrapped: false,
    activeHazard: false,
    vehicleStable: true,
    groupSafe: true,
  },
  resources: {
    vehicleDisabled: true,
    terrain: 'graded forest road',
    weather: 'clear',
    daylight: 'afternoon',
    fuelConcern: false,
    waterConcern: false,
    foodConcern: false,
    shelterConcern: false,
    warmthConcern: false,
    medicalKitAvailable: true,
  },
  notes: 'Starter failure, vehicle immobilized.',
  reportedBy: 'operator-1',
});

const stabilizing = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: incident.id,
  expeditionId: 'expedition-closeout',
  status: 'stabilizing',
  reason: 'Safety checklist review started before closeout.',
  actor: 'operator-1',
});

assert.strictEqual(stabilizing.status, 'stabilizing');

const readyToResolve = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: incident.id,
  expeditionId: 'expedition-closeout',
  status: 'self_recovery_in_progress',
  reason: 'Recovery provider is on scene and the incident is ready for closeout.',
  actor: 'operator-1',
});

assert.strictEqual(readyToResolve.status, 'self_recovery_in_progress');

const resolved = incidentRecoveryWorkflowStore.resolveIncident({
  incidentId: incident.id,
  expeditionId: 'expedition-closeout',
  resolvedHow: 'Recovery provider towed the vehicle to the trailhead.',
  anyoneInjured: false,
  vehicleDamaged: true,
  outsideAssistanceUsed: true,
  emergencyServicesContacted: false,
  finalNotes: 'No injuries. Vehicle moved off route before dusk.',
  actor: 'operator-1',
});

assert(resolved, 'Resolve Incident should return the updated incident.');
assert.strictEqual(resolved.status, 'resolved');
assert.strictEqual(resolved.debrief.status, 'in_progress');
assert.strictEqual(resolved.debrief.resolutionStatus, 'resolved');
assert.strictEqual(resolved.debrief.resolutionSummary, 'Recovery provider towed the vehicle to the trailhead.');
assert.strictEqual(resolved.debrief.anyoneInjured, false);
assert.strictEqual(resolved.debrief.vehicleDamaged, true);
assert.strictEqual(resolved.debrief.outsideAssistanceUsed, true);
assert.strictEqual(resolved.debrief.emergencyServicesContacted, false);
assert.strictEqual(resolved.recoveryAssessment.recommendedAction, 'Complete debrief');
assert(resolved.timeline.some((event) => event.type === 'resolved' && event.title === 'incident resolved'));

const resolvedContainerState = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-closeout',
  routeLabel: 'High Ridge Connector',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
  now: Date.now(),
});

assert.strictEqual(resolvedContainerState.displayMode, 'resolved_recent');
assert.strictEqual(resolvedContainerState.hasActiveIncident, false);
assert.strictEqual(resolvedContainerState.headline, 'Incident Resolved');
assert.strictEqual(resolvedContainerState.nextRecommendedAction, 'Complete debrief when ready.');
assert.strictEqual(resolvedContainerState.buttonStates.resolveDebrief.status, 'in_progress');

const debriefed = incidentRecoveryWorkflowStore.saveIncidentDebrief({
  incidentId: incident.id,
  expeditionId: 'expedition-closeout',
  outcome: 'Vehicle recovered; expedition continued with modified timing.',
  injuries: 'None reported.',
  vehicleDamage: 'Starter failure; minor recovery strap abrasion noted.',
  equipmentUsed: ['recovery strap', 'satellite messenger'],
  whatWorked: 'Clear turnout location and recovery provider contact.',
  whatFailed: 'Starter issue was not detected during pre-trip check.',
  planningGaps: 'No redundant starter diagnostic plan.',
  routeHazards: 'Narrow shoulder on north switchback.',
  communicationIssues: 'Cell available only at turnout.',
  weatherTerrainMismatch: 'No mismatch.',
  futureRecommendations: 'Add starter check and recovery provider contact to planning.',
  communityHazardReportRequested: true,
  routeConfidenceAdjustmentRequested: true,
  actor: 'operator-1',
});

assert(debriefed, 'Save debrief should return the updated incident.');
assert.strictEqual(debriefed.status, 'resolved', 'Saving a debrief must not close the incident automatically.');
assert.strictEqual(debriefed.debrief.status, 'complete');
assert.strictEqual(debriefed.debrief.outcome, 'Vehicle recovered; expedition continued with modified timing.');
assert.deepStrictEqual(debriefed.debrief.equipmentUsed, ['recovery strap', 'satellite messenger']);
assert.strictEqual(debriefed.debrief.communityHazardReportRequested, true);
assert.strictEqual(debriefed.debrief.communityHazardPublicationStatus, 'requested_review');
assert.strictEqual(debriefed.debrief.communityHazardRequiresManualReview, true);
assert.strictEqual(debriefed.debrief.communityHazardPublished, false);
assert.strictEqual(debriefed.debrief.routeConfidenceAdjustmentRequested, true);
assert.strictEqual(debriefed.debrief.routeConfidenceReviewStatus, 'requested_review');
assert.strictEqual(debriefed.debrief.routeConfidenceChanged, false);
assert(debriefed.timeline.some((event) => event.type === 'debrief_added' && event.title === 'debrief created'));
const debriefTimelineEvent = debriefed.timeline.find(
  (event) => event.type === 'debrief_added' && event.title === 'debrief created',
);
assert.strictEqual(debriefTimelineEvent.data.communityHazardPublicationStatus, 'requested_review');
assert.strictEqual(debriefTimelineEvent.data.communityHazardPublished, false);
assert.strictEqual(debriefTimelineEvent.data.routeConfidenceReviewStatus, 'requested_review');
assert.strictEqual(debriefTimelineEvent.data.routeConfidenceChanged, false);
assert.strictEqual(debriefed.debrief.intelligenceHandoff.incidentId, incident.id);
assert.strictEqual(debriefed.debrief.intelligenceHandoff.expeditionId, 'expedition-closeout');
assert.strictEqual(debriefed.debrief.intelligenceHandoff.communityHazardReportRequested, true);
assert.strictEqual(debriefed.debrief.intelligenceHandoff.communityHazardPublicationStatus, 'requested_review');
assert.strictEqual(debriefed.debrief.intelligenceHandoff.communityHazardRequiresManualReview, true);
assert.strictEqual(debriefed.debrief.intelligenceHandoff.communityHazardPublished, false);
assert.strictEqual(debriefed.debrief.intelligenceHandoff.routeConfidenceAdjustmentRequested, true);
assert.strictEqual(debriefed.debrief.intelligenceHandoff.routeConfidenceReviewStatus, 'requested_review');
assert.strictEqual(debriefed.debrief.intelligenceHandoff.routeConfidenceChanged, false);
assert.strictEqual(debriefed.metadata.communityHazardPublishing.status, 'requested_review');
assert.strictEqual(debriefed.metadata.communityHazardPublishing.requiresManualReview, true);
assert.strictEqual(debriefed.metadata.communityHazardPublishing.published, false);
assert.strictEqual(debriefed.metadata.routeConfidenceReview.status, 'requested_review');
assert.strictEqual(debriefed.metadata.routeConfidenceReview.changed, false);

const debriefContainerState = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-closeout',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
  now: Date.now(),
});

assert.strictEqual(debriefContainerState.displayMode, 'resolved_recent');
assert.strictEqual(debriefContainerState.buttonStates.resolveDebrief.status, 'complete');

incidentRecoveryWorkflowStore.clear();

console.log('Resolve / Debrief workflow checks passed.');
