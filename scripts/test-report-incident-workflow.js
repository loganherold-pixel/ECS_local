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
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  type: 'vehicle_stuck',
  manualLocationDescription: '',
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
    vehicleDisabled: null,
    terrain: 'wash crossing',
    weather: 'clear',
    daylight: 'dusk',
    fuelConcern: false,
    waterConcern: true,
    foodConcern: false,
    shelterConcern: false,
    warmthConcern: false,
    medicalKitAvailable: true,
  },
  notes: 'Rear axle settled in soft sand.',
  reportedBy: 'operator-1',
});

assert.strictEqual(incident.type, 'vehicle_stuck');
assert.strictEqual(incident.severity, 'unknown');
assert.strictEqual(incident.status, 'stabilizing');
assert.strictEqual(incident.title, 'Vehicle Stuck');
assert.strictEqual(incident.summary, 'Rear axle settled in soft sand.');
assert.strictEqual(incident.location, null);
assert.deepStrictEqual(
  incident.missingCriticalData,
  ['location', 'communication', 'injury_status', 'vehicle_status'],
);
assert.strictEqual(incident.timeline.length, 1);
assert.strictEqual(incident.timeline[0].type, 'reported');
assert.strictEqual(incident.timeline[0].title, 'Incident created');
assert.strictEqual(incident.recoveryAssessment.recommendedAction, 'Complete safety checklist');
assert.strictEqual(incident.recoveryAssessment.vehicleMobile, null);
assert.strictEqual(incident.recoveryAssessment.confidence, 'unknown');
assert.strictEqual(incident.metadata.source, 'expedition_incident_container');

const snapshot = incidentRecoveryWorkflowStore.getSnapshot();
assert.strictEqual(snapshot.length, 1);
assert.notStrictEqual(snapshot[0], incident, 'Workflow snapshots must be cloned.');
assert.strictEqual(
  incidentRecoveryWorkflowStore.getSnapshot(),
  snapshot,
  'Workflow snapshots must be referentially stable between store changes for useSyncExternalStore.',
);

const containerState = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  incidents: snapshot,
  now: Date.parse('2026-04-28T18:00:00.000Z'),
});

assert.strictEqual(containerState.displayMode, 'active_incident');
assert.strictEqual(containerState.headline, 'Active Incident');
assert.strictEqual(containerState.hasActiveIncident, true);
assert.strictEqual(containerState.activeIncident.type, 'vehicle_stuck');
assert.strictEqual(containerState.severity, 'unknown');
assert.strictEqual(containerState.status, 'stabilizing');
assert.strictEqual(containerState.locationLabel, undefined);
assert.strictEqual(containerState.routeLabel, 'Ruby Ridge');
assert.strictEqual(containerState.nextRecommendedAction, 'Complete safety checklist');
assert.strictEqual(containerState.buttonStates.reportIncident.status, 'complete');
assert.strictEqual(containerState.buttonStates.safetyChecklist.status, 'in_progress');
assert.strictEqual(containerState.buttonStates.ecsAssessment.warning, true);
assert.strictEqual(containerState.buttonStates.timeline.badgeCount, 1);

const unrelatedContainerState = buildIncidentRecoveryContainerState([], {
  expeditionId: 'different-expedition',
  incidents: snapshot,
  now: Date.parse('2026-04-28T18:00:00.000Z'),
});

assert.strictEqual(unrelatedContainerState.displayMode, 'no_incident');
assert.strictEqual(unrelatedContainerState.headline, 'No active incident');

incidentRecoveryWorkflowStore.clear();
assert.strictEqual(incidentRecoveryWorkflowStore.getSnapshot().length, 0);
const emptySnapshot = incidentRecoveryWorkflowStore.getSnapshot();
assert.strictEqual(
  incidentRecoveryWorkflowStore.getSnapshot(),
  emptySnapshot,
  'Empty workflow snapshots must also remain referentially stable between store changes.',
);

console.log('Report Incident workflow checks passed.');
