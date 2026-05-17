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

const noRiskResult = incidentRecoveryWorkflowStore.saveSafetyChecklist({
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  location: {
    latitude: 39.1,
    longitude: -120.2,
    source: 'gps',
  },
  items: ALL_CHECKED,
  notes: 'Routine safety check clear.',
  createIncidentIfRiskFound: true,
});

assert.strictEqual(noRiskResult, null, 'No-risk safety checks should not create a new incident.');
assert.strictEqual(incidentRecoveryWorkflowStore.getSnapshot().length, 0);

const createdFromRisk = incidentRecoveryWorkflowStore.saveSafetyChecklist({
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  location: null,
  items: {
    ...ALL_CHECKED,
    injuriesAssessed: 'unknown',
    activeHazardsIdentified: 'unchecked',
    locationCaptured: 'unknown',
    communicationsChecked: 'unchecked',
  },
  notes: 'Safety risk found before formal report.',
  createIncidentIfRiskFound: true,
});

assert.ok(createdFromRisk, 'Risk-found safety checks should create an incident when requested.');
assert.strictEqual(createdFromRisk.title, 'Safety Check');
assert.strictEqual(createdFromRisk.status, 'stabilizing');
assert.strictEqual(createdFromRisk.severity, 'high');
assert.strictEqual(createdFromRisk.stabilizationChecklist.status, 'attention_needed');
assert.deepStrictEqual(
  createdFromRisk.missingCriticalData,
  ['location', 'communication', 'hazard', 'injury_status'],
);
assert.strictEqual(createdFromRisk.timeline[0].title, 'Safety check updated');
assert.strictEqual(createdFromRisk.recoveryAssessment.recommendedAction, 'Run ECS assessment');

const containerAfterSafetyCreate = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
  now: Date.parse('2026-04-28T18:00:00.000Z'),
});

assert.strictEqual(containerAfterSafetyCreate.displayMode, 'active_incident');
assert.strictEqual(containerAfterSafetyCreate.buttonStates.safetyChecklist.status, 'attention_needed');
assert.strictEqual(containerAfterSafetyCreate.buttonStates.safetyChecklist.warning, true);
assert.strictEqual(containerAfterSafetyCreate.buttonStates.ecsAssessment.status, 'attention_needed');
assert.strictEqual(containerAfterSafetyCreate.nextRecommendedAction, 'Run ECS assessment');

const completedChecklist = incidentRecoveryWorkflowStore.saveSafetyChecklist({
  incidentId: createdFromRisk.id,
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  location: {
    latitude: 39.1,
    longitude: -120.2,
    source: 'gps',
  },
  items: ALL_CHECKED,
  notes: 'Safety check completed.',
  createIncidentIfRiskFound: true,
});

assert.ok(completedChecklist);
assert.strictEqual(completedChecklist.stabilizationChecklist.status, 'complete');
assert.deepStrictEqual(completedChecklist.missingCriticalData, []);
assert.strictEqual(completedChecklist.timeline.at(-1).title, 'Safety check completed');
assert.strictEqual(completedChecklist.recoveryAssessment.recommendedAction, 'Run ECS assessment');

const containerAfterComplete = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-alpha',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
  now: Date.parse('2026-04-28T18:00:00.000Z'),
});

assert.strictEqual(containerAfterComplete.buttonStates.safetyChecklist.status, 'complete');
assert.strictEqual(containerAfterComplete.buttonStates.ecsAssessment.status, 'in_progress');
assert.strictEqual(containerAfterComplete.buttonStates.timeline.badgeCount, 2);

incidentRecoveryWorkflowStore.clear();

console.log('Safety Checklist workflow checks passed.');
