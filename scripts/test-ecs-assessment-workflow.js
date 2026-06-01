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
const { RECOVERY_INCIDENT_AGENT_ID, RECOVERY_INCIDENT_AGENT_PROMPT } = loadTypeScriptModule('lib/ai/recoveryIncidentAgent.ts');

function baseSafety(overrides = {}) {
  return {
    anyoneInjured: false,
    anyoneMissing: false,
    anyoneTrapped: false,
    activeHazard: false,
    vehicleStable: true,
    groupSafe: true,
    ...overrides,
  };
}

function baseResources(overrides = {}) {
  return {
    vehicleDisabled: false,
    terrain: '',
    weather: '',
    daylight: '',
    fuelConcern: false,
    waterConcern: false,
    foodConcern: false,
    shelterConcern: false,
    warmthConcern: false,
    medicalKitAvailable: true,
    ...overrides,
  };
}

function assessScenario(input, context = {}) {
  incidentRecoveryWorkflowStore.clear();
  const incident = incidentRecoveryWorkflowStore.reportIncident({
    expeditionId: 'expedition-alpha',
    routeLabel: 'Ruby Ridge',
    communicationStatus: 'available',
    safety: baseSafety(),
    resources: baseResources(),
    ...input,
  });
  const assessed = incidentRecoveryWorkflowStore.generateECSAssessment({
    incidentId: incident.id,
    expeditionId: 'expedition-alpha',
    routeLabel: 'Ruby Ridge',
    currentLocationLabel: input.location ? undefined : 'Mile 12 wash',
    ...context,
  });
  assert.ok(assessed, 'Assessment should update an active incident.');
  return assessed;
}

assert.strictEqual(RECOVERY_INCIDENT_AGENT_ID, 'recovery_incident_agent');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('Prioritize human safety'));
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('structured output'));

const stuckInjury = assessScenario({
  type: 'vehicle_stuck',
  location: null,
  communicationStatus: 'unknown',
  safety: baseSafety({ anyoneInjured: true, activeHazard: null }),
  resources: baseResources({ vehicleDisabled: true, terrain: 'soft shoulder' }),
  notes: 'We are stuck and one person might be injured.',
});
assert.strictEqual(stuckInjury.recoveryAssessment.structuredOutput.riskLevel, 'high');
assert.strictEqual(stuckInjury.recoveryAssessment.structuredOutput.confidence, 'low');
assert.ok(stuckInjury.recoveryAssessment.structuredOutput.missingData.includes('communication'));
assert.ok(stuckInjury.recoveryAssessment.structuredOutput.nextActions.includes('Prepare Communication Packet.'));

const noStartDaylight = assessScenario({
  type: 'vehicle_breakdown',
  location: { latitude: 39.1, longitude: -120.2, source: 'gps' },
  communicationStatus: 'available',
  safety: baseSafety(),
  resources: baseResources({ vehicleDisabled: true, daylight: 'daylight fading' }),
  notes: 'Truck will not start, no injuries, daylight fading.',
}, {
  vehicleSummary: 'Truck will not start',
  weatherDaylightSummary: 'Daylight fading',
});
assert.ok(['moderate', 'high'].includes(noStartDaylight.recoveryAssessment.structuredOutput.riskLevel));
assert.ok(noStartDaylight.recoveryAssessment.structuredOutput.risks.join(' ').toLowerCase().includes('vehicle'));

const floodedCrossing = assessScenario({
  type: 'route_blocked',
  location: { latitude: 39.1, longitude: -120.2, source: 'gps' },
  communicationStatus: 'available',
  safety: baseSafety({ activeHazard: true }),
  resources: baseResources({ terrain: 'flooded crossing' }),
  notes: 'We are at a flooded crossing and thinking about driving through.',
});
assert.strictEqual(floodedCrossing.recoveryAssessment.structuredOutput.riskLevel, 'critical');
assert.ok(floodedCrossing.recoveryAssessment.structuredOutput.doNotDo.some((item) => item.toLowerCase().includes('floodwater')));
assert.ok(floodedCrossing.recoveryAssessment.structuredOutput.escalationTriggers.some((item) => item.toLowerCase().includes('flood')));

const overdueConvoy = assessScenario({
  type: 'separated_party',
  location: null,
  communicationStatus: 'unknown',
  safety: baseSafety({ anyoneMissing: true, activeHazard: null }),
  resources: baseResources(),
  notes: 'Convoy member is overdue and not responding.',
}, {
  convoySummary: 'One convoy member overdue and not responding',
});
assert.strictEqual(overdueConvoy.recoveryAssessment.structuredOutput.riskLevel, 'critical');
assert.ok(overdueConvoy.recoveryAssessment.structuredOutput.escalationTriggers.some((item) => item.toLowerCase().includes('overdue')));

const recoveredDebrief = assessScenario({
  type: 'vehicle_stuck',
  location: { latitude: 39.1, longitude: -120.2, source: 'gps' },
  communicationStatus: 'available',
  safety: baseSafety(),
  resources: baseResources({ vehicleDisabled: false }),
  notes: 'We recovered the vehicle; create a debrief.',
});
assert.ok(recoveredDebrief.recoveryAssessment.structuredOutput.debriefHooks.length >= 3);
assert.ok(recoveredDebrief.recoveryAssessment.structuredOutput.doNotDo.some((item) => item.includes('emergency services')));
assert.ok(recoveredDebrief.timeline.some((event) => event.title === 'ECS assessment generated'));

const containerState = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-alpha',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
  now: Date.parse('2026-04-28T18:00:00.000Z'),
});
assert.strictEqual(containerState.buttonStates.ecsAssessment.status, 'complete');
assert.strictEqual(containerState.buttonStates.communicationPacket.status, 'in_progress');
assert.strictEqual(containerState.nextRecommendedAction, 'Prepare Communication Packet');

incidentRecoveryWorkflowStore.clear();

console.log('ECS Assessment workflow checks passed.');
