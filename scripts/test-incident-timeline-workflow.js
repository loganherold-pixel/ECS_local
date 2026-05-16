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

const ALL_CHECKED = {
  everyoneAccountedFor: 'checked',
  injuriesAssessed: 'checked',
  activeHazardsIdentified: 'checked',
  locationCaptured: 'checked',
  vehicleStabilityAssessed: 'checked',
  communicationsChecked: 'checked',
  weatherDaylightReviewed: 'checked',
  emergencyEscalationReviewed: 'checked',
};

incidentRecoveryWorkflowStore.clear();

const emptyState = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-alpha',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
});
assert.strictEqual(emptyState.activeIncident, null);
assert.strictEqual(emptyState.buttonStates.timeline.status, 'not_started');

let incident = incidentRecoveryWorkflowStore.reportIncident({
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  type: 'vehicle_stuck',
  location: null,
  communicationStatus: 'unknown',
  safety: {
    anyoneInjured: null,
    anyoneMissing: false,
    anyoneTrapped: false,
    activeHazard: true,
    vehicleStable: null,
    groupSafe: false,
  },
  resources: {
    vehicleDisabled: true,
    terrain: 'sand wash',
    weather: 'clear',
    daylight: 'dusk',
    fuelConcern: false,
    waterConcern: false,
    foodConcern: false,
    shelterConcern: false,
    warmthConcern: false,
    medicalKitAvailable: true,
  },
  notes: 'Vehicle stuck in sand wash.',
});

assert.strictEqual(incident.timeline.length, 1);
assert.strictEqual(incident.timeline[0].type, 'reported');
assert.strictEqual(incident.timeline[0].title, 'Incident created');
assert.strictEqual(incident.timeline[0].summary, 'Vehicle stuck in sand wash.');

incident = incidentRecoveryWorkflowStore.saveSafetyChecklist({
  incidentId: incident.id,
  expeditionId: 'expedition-alpha',
  location: null,
  items: {
    ...ALL_CHECKED,
    locationCaptured: 'unknown',
    communicationsChecked: 'unknown',
  },
  notes: 'Safety check updated; location and comms still unresolved.',
});
assert.ok(incident.timeline.some((event) => event.type === 'checklist_updated'));

incident = incidentRecoveryWorkflowStore.generateECSAssessment({
  incidentId: incident.id,
  expeditionId: 'expedition-alpha',
  currentLocationLabel: 'Sand wash near Ruby Ridge',
});
assert.ok(incident.timeline.some((event) => event.type === 'assessment_updated'));

incident = incidentRecoveryWorkflowStore.generateCommunicationPacket({
  incidentId: incident.id,
  expeditionId: 'expedition-alpha',
});
assert.ok(incident.timeline.some((event) => event.type === 'communication_packet_generated'));

incident = incidentRecoveryWorkflowStore.logCommunicationPacketCopied({
  incidentId: incident.id,
  expeditionId: 'expedition-alpha',
  audience: 'all',
});
assert.ok(incident.timeline.some((event) => event.type === 'communication_packet_copied'));

incident = incidentRecoveryWorkflowStore.addTimelineNote({
  incidentId: incident.id,
  expeditionId: 'expedition-alpha',
  note: 'Operator note: staying put until communication is confirmed.',
});
assert.ok(incident.timeline.some((event) => event.type === 'note' && event.title === 'user note added'));

incident = incidentRecoveryWorkflowStore.addLocationUpdate({
  incidentId: incident.id,
  expeditionId: 'expedition-alpha',
  location: {
    latitude: 39.123456,
    longitude: -120.654321,
    source: 'gps',
  },
});
assert.strictEqual(incident.locationLabel, '39.12346, -120.65432');
assert.ok(!incident.missingCriticalData.includes('location'));
assert.ok(incident.timeline.some((event) => event.type === 'location_updated'));

incident = incidentRecoveryWorkflowStore.logTimelineEvent({
  incidentId: incident.id,
  expeditionId: 'expedition-alpha',
  type: 'debrief_added',
  title: 'debrief created',
  summary: 'Resolve / Debrief workflow opened from Incident & Recovery.',
});
assert.ok(incident.timeline.some((event) => event.type === 'debrief_added'));

const eventTypes = incident.timeline.map((event) => event.type);
for (const requiredType of [
  'reported',
  'checklist_updated',
  'assessment_updated',
  'communication_packet_generated',
  'communication_packet_copied',
  'note',
  'location_updated',
  'debrief_added',
]) {
  assert.ok(eventTypes.includes(requiredType), `Timeline should include ${requiredType}.`);
}
for (const event of incident.timeline) {
  assert.ok(event.id);
  assert.strictEqual(event.incidentId, incident.id);
  assert.ok(event.occurredAt);
  assert.ok(event.title);
  assert.ok(event.summary || event.detail || event.title);
}

const sorted = [...incident.timeline].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
assert.strictEqual(sorted.length, incident.timeline.length);

const state = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-alpha',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
});
assert.strictEqual(state.buttonStates.timeline.badgeCount, incident.timeline.length);

incidentRecoveryWorkflowStore.clear();

console.log('Incident Timeline workflow checks passed.');
