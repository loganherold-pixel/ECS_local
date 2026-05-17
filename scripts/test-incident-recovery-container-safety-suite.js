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

const root = process.cwd();
const incidentRecoveryPanelSource = fs.readFileSync(path.join(root, 'components/dashboard/IncidentRecoveryPanel.tsx'), 'utf8');
const reportIncidentModalSource = fs.readFileSync(path.join(root, 'components/dashboard/ReportIncidentModal.tsx'), 'utf8');
const timelineModalSource = fs.readFileSync(path.join(root, 'components/dashboard/IncidentTimelineModal.tsx'), 'utf8');
const resolveDebriefModalSource = fs.readFileSync(path.join(root, 'components/dashboard/ResolveDebriefModal.tsx'), 'utf8');

const { incidentRecoveryWorkflowStore } = loadTypeScriptModule('lib/incidentRecoveryWorkflowStore.ts');
const { buildIncidentRecoveryContainerState } = loadTypeScriptModule('lib/incidentRecoveryContainerState.ts');

const NOW = Date.parse('2026-04-28T18:00:00.000Z');
const EXPEDITION_ID = 'expedition-safety-suite';

function baseSafety(overrides = {}) {
  return {
    anyoneInjured: null,
    anyoneMissing: false,
    anyoneTrapped: false,
    activeHazard: null,
    vehicleStable: null,
    groupSafe: null,
    ...overrides,
  };
}

function baseResources(overrides = {}) {
  return {
    vehicleDisabled: null,
    terrain: '',
    weather: '',
    daylight: '',
    fuelConcern: null,
    waterConcern: null,
    foodConcern: null,
    shelterConcern: null,
    warmthConcern: null,
    medicalKitAvailable: null,
    ...overrides,
  };
}

function containerState() {
  return buildIncidentRecoveryContainerState([], {
    expeditionId: EXPEDITION_ID,
    incidents: incidentRecoveryWorkflowStore.getSnapshot(),
    now: NOW,
  });
}

function assertContainerLaunchesWorkflows() {
  for (const snippet of [
    "setReportModalVisible(true)",
    "setSafetyModalVisible(true)",
    "setAssessmentModalVisible(true)",
    "setPacketModalVisible(true)",
    "setTimelineModalVisible(true)",
    "setResolveDebriefModalVisible(true)",
    "onPress={() => handleActionPress(action)}",
  ]) {
    assert.ok(incidentRecoveryPanelSource.includes(snippet), `Container must launch workflow snippet: ${snippet}`);
  }
}

incidentRecoveryWorkflowStore.clear();
assertContainerLaunchesWorkflows();

// Container no-active-incident state.
const noIncident = containerState();
assert.strictEqual(noIncident.displayMode, 'no_incident');
assert.strictEqual(noIncident.headline, 'No active incident');
assert.strictEqual(noIncident.hasActiveIncident, false);
assert.strictEqual(noIncident.activeIncident, null);
assert.strictEqual(noIncident.buttonStates.reportIncident.enabled, true);
assert.strictEqual(noIncident.buttonStates.safetyChecklist.status, 'not_started');
assert.strictEqual(noIncident.buttonStates.ecsAssessment.status, 'not_started');
assert.strictEqual(noIncident.buttonStates.communicationPacket.status, 'not_started');
assert.strictEqual(noIncident.buttonStates.timeline.status, 'not_started');
assert.strictEqual(noIncident.nextRecommendedAction, 'Ready to report incident');

let incident = incidentRecoveryWorkflowStore.reportIncident({
  expeditionId: EXPEDITION_ID,
  routeLabel: 'Mile 12 Wash',
  type: 'vehicle_stuck',
  manualLocationDescription: '',
  location: null,
  communicationStatus: 'unknown',
  safety: baseSafety({
    anyoneInjured: null,
    activeHazard: true,
    groupSafe: false,
  }),
  resources: baseResources({
    vehicleDisabled: true,
    terrain: 'soft sand wash',
    daylight: 'dusk',
  }),
  notes: 'Vehicle stuck with unknown injury status and unknown exact location.',
});

let state = containerState();
assert.strictEqual(incident.type, 'vehicle_stuck');
assert.strictEqual(state.displayMode, 'active_incident');
assert.strictEqual(state.headline, 'Active Incident');
assert.strictEqual(incident.severity, 'unknown');
assert.ok(incident.missingCriticalData.includes('injury_status'));
assert.ok(incident.missingCriticalData.includes('location'));
assert.strictEqual(incident.timeline[0].type, 'reported');
assert.strictEqual(incident.recoveryAssessment.recommendedAction, 'Complete safety checklist');
assert.strictEqual(state.nextRecommendedAction, 'Complete safety checklist');

incident = incidentRecoveryWorkflowStore.saveSafetyChecklist({
  incidentId: incident.id,
  expeditionId: EXPEDITION_ID,
  location: null,
  items: {
    everyoneAccountedFor: 'checked',
    injuriesAssessed: 'unknown',
    activeHazardsIdentified: 'unchecked',
    locationCaptured: 'unknown',
    vehicleStabilityAssessed: 'unknown',
    communicationsChecked: 'unknown',
    weatherDaylightReviewed: 'checked',
    emergencyEscalationReviewed: 'checked',
  },
  notes: 'Injury status unknown, active hazards present, communications weak.',
});
state = containerState();
assert.strictEqual(incident.severity, 'high');
assert.ok(incident.missingCriticalData.includes('injury_status'));
assert.ok(incident.missingCriticalData.includes('hazard'));
assert.ok(incident.missingCriticalData.includes('communication'));
assert.ok(incident.timeline.some((event) => event.type === 'checklist_updated'));
assert.strictEqual(incident.recoveryAssessment.recommendedAction, 'Run ECS assessment');
assert.strictEqual(state.buttonStates.ecsAssessment.warning, true);

incident = incidentRecoveryWorkflowStore.generateECSAssessment({
  incidentId: incident.id,
  expeditionId: EXPEDITION_ID,
  routeLabel: 'Mile 12 Wash',
});
state = containerState();
const assessment = incident.recoveryAssessment.structuredOutput;
assert(assessment, 'ECS Assessment must produce structured output.');
assert.ok(assessment.immediateSafetyAssessment.toLowerCase().includes('safety'));
assert.ok(assessment.recommendations.join(' ').toLowerCase().includes('location'));
assert.ok(assessment.recommendations.join(' ').toLowerCase().includes('communication'));
assert.ok(assessment.stabilizationChecklist.join(' ').toLowerCase().includes('confirm'));
assert.ok(assessment.doNotDo.some((item) => item.toLowerCase().includes('rigging')));
assert.ok(!assessment.recommendations.join(' ').toLowerCase().includes('attach a winch'));
assert.strictEqual(state.buttonStates.ecsAssessment.status, 'complete');
assert.ok(['high', 'critical'].includes(state.severity));

incident = incidentRecoveryWorkflowStore.generateCommunicationPacket({
  incidentId: incident.id,
  expeditionId: EXPEDITION_ID,
});
assert(incident.communicationPacket.packetText.includes('Injury status: unknown'));
assert(incident.communicationPacket.packetText.includes('GPS coordinates: unknown'));
assert(incident.communicationPacket.packetText.includes('Vehicle status: disabled yes; stable unknown'));
assert(incident.communicationPacket.packetText.includes('Last updated:'));
assert.ok(incident.timeline.some((event) => event.type === 'communication_packet_generated'));
incident = incidentRecoveryWorkflowStore.logCommunicationPacketCopied({
  incidentId: incident.id,
  expeditionId: EXPEDITION_ID,
  audience: 'all',
});
assert.ok(incident.timeline.some((event) => event.type === 'communication_packet_copied'));

incident = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: incident.id,
  expeditionId: EXPEDITION_ID,
  status: 'self_recovery_in_progress',
  reason: 'Logging high-level recovery status only.',
});
assert.ok(incident.timeline.some((event) => event.type === 'status_changed'));

assert.ok(timelineModalSource.includes('No timeline events'));
assert.ok(timelineModalSource.includes('Chronological incident updates'));
for (const requiredType of [
  'reported',
  'checklist_updated',
  'assessment_updated',
  'communication_packet_generated',
  'communication_packet_copied',
  'status_changed',
]) {
  assert.ok(incident.timeline.some((event) => event.type === requiredType), `Timeline should include ${requiredType}.`);
}

incident = incidentRecoveryWorkflowStore.resolveIncident({
  incidentId: incident.id,
  expeditionId: EXPEDITION_ID,
  resolvedHow: 'Vehicle extracted to stable ground; no tactical instructions were generated.',
  anyoneInjured: null,
  vehicleDamaged: null,
  outsideAssistanceUsed: false,
  emergencyServicesContacted: false,
  finalNotes: 'Debrief still needed.',
});
state = containerState();
assert.strictEqual(incident.status, 'resolved');
assert.ok(incident.timeline.some((event) => event.type === 'resolved'));
assert.strictEqual(state.displayMode, 'resolved_recent');
assert.strictEqual(state.hasActiveIncident, false);
assert.strictEqual(state.buttonStates.resolveDebrief.status, 'in_progress');
assert.ok(resolveDebriefModalSource.includes('Incident debrief'));
assert.ok(resolveDebriefModalSource.includes('Community hazard report'));
assert.ok(resolveDebriefModalSource.includes('Nothing is published automatically.'));
assert.strictEqual(incident.debrief.communityHazardReportRequested ?? false, false);

incidentRecoveryWorkflowStore.clear();
let flood = incidentRecoveryWorkflowStore.reportIncident({
  expeditionId: EXPEDITION_ID,
  routeLabel: 'Creek Crossing',
  type: 'route_blocked',
  location: { latitude: 39.12, longitude: -120.65, source: 'gps' },
  communicationStatus: 'available',
  safety: baseSafety({ anyoneInjured: false, activeHazard: true, groupSafe: true, vehicleStable: true }),
  resources: baseResources({ terrain: 'flooded crossing', weather: 'rising water' }),
  notes: 'Flooded crossing and considering driving through.',
});
flood = incidentRecoveryWorkflowStore.generateECSAssessment({
  incidentId: flood.id,
  expeditionId: EXPEDITION_ID,
  routeLabel: 'Creek Crossing',
});
const floodOutput = flood.recoveryAssessment.structuredOutput;
assert.strictEqual(floodOutput.riskLevel, 'critical');
assert.ok(floodOutput.doNotDo.some((item) => item.toLowerCase().includes('floodwater')));
assert.ok(floodOutput.escalationTriggers.some((item) => item.toLowerCase().includes('flood')));
assert.ok(!floodOutput.recommendations.join(' ').toLowerCase().includes('drive through'));
assert.ok(!floodOutput.nextActions.join(' ').toLowerCase().includes('drive through'));

incidentRecoveryWorkflowStore.clear();
let overdue = incidentRecoveryWorkflowStore.reportIncident({
  expeditionId: EXPEDITION_ID,
  routeLabel: 'Convoy Leg 2',
  type: 'separated_party',
  location: null,
  communicationStatus: 'unknown',
  safety: baseSafety({ anyoneMissing: true, activeHazard: null }),
  resources: baseResources(),
  notes: 'Convoy member overdue and not responding.',
  contextSnapshot: {
    convoy: {
      teamId: 'team-alpha',
      teamName: 'Alpha Convoy',
      memberCount: 3,
      memberLabels: ['lead', 'tail', 'overdue'],
      hasConvoy: true,
      communicationTargetAvailable: true,
    },
    updatedAt: '2026-04-28T18:00:00.000Z',
  },
});
overdue = incidentRecoveryWorkflowStore.generateECSAssessment({
  incidentId: overdue.id,
  expeditionId: EXPEDITION_ID,
  convoySummary: 'Alpha Convoy / overdue member not responding',
});
const overdueOutput = overdue.recoveryAssessment.structuredOutput;
assert.strictEqual(overdue.type, 'separated_party');
assert.strictEqual(overdueOutput.riskLevel, 'critical');
assert.ok(overdueOutput.escalationTriggers.some((item) => item.toLowerCase().includes('overdue')));
assert.ok(overdueOutput.nextActions.some((item) => item.toLowerCase().includes('communication')));
assert.ok(reportIncidentModalSource.includes('Last known location'));
overdue = incidentRecoveryWorkflowStore.addTimelineNote({
  incidentId: overdue.id,
  expeditionId: EXPEDITION_ID,
  note: 'Last known convoy location requested from team.',
});
assert.ok(overdue.timeline.some((event) => event.type === 'note'));

incidentRecoveryWorkflowStore.clear();
let resolved = incidentRecoveryWorkflowStore.reportIncident({
  expeditionId: EXPEDITION_ID,
  routeLabel: 'Return Leg',
  type: 'vehicle_breakdown',
  location: { latitude: 39.1, longitude: -120.1, source: 'gps' },
  communicationStatus: 'available',
  safety: baseSafety({ anyoneInjured: false, activeHazard: false, vehicleStable: true, groupSafe: true }),
  resources: baseResources({ vehicleDisabled: true }),
  notes: 'Mechanical issue resolved later.',
});
resolved = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: resolved.id,
  expeditionId: EXPEDITION_ID,
  status: 'stabilizing',
  reason: 'Safety confirmed.',
});
resolved = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: resolved.id,
  expeditionId: EXPEDITION_ID,
  status: 'awaiting_assistance',
  reason: 'Assistance contacted.',
});
resolved = incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: resolved.id,
  expeditionId: EXPEDITION_ID,
  status: 'resolved',
  reason: 'Assistance completed.',
});
state = containerState();
assert.strictEqual(state.displayMode, 'resolved_recent');
assert.strictEqual(state.hasActiveIncident, false);
assert.strictEqual(state.buttonStates.resolveDebrief.status, 'complete');

incidentRecoveryWorkflowStore.clear();

console.log('Incident & Recovery container-centered safety suite checks passed.');
