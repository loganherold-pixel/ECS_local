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

const {
  buildIncidentRecoveryContainerState,
  isIncidentRecoveryEvent,
} = loadTypeScriptModule('lib/incidentRecoveryContainerState.ts');

const NOW = Date.parse('2026-04-28T18:00:00.000Z');

const noIncident = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  hasRouteContext: true,
  ecsOnline: true,
  now: NOW,
});

assert.strictEqual(noIncident.displayMode, 'no_incident');
assert.strictEqual(noIncident.headline, 'No active incident');
assert.strictEqual(noIncident.subheadline, 'Route monitoring active');
assert.strictEqual(noIncident.hasActiveIncident, false);
assert.strictEqual(noIncident.routeLabel, 'Ruby Ridge');
assert.strictEqual(noIncident.buttonStates.reportIncident.enabled, true);
assert.strictEqual(noIncident.buttonStates.ecsAssessment.label, 'ECS Assessment');

const activeRecovery = {
  id: 'dispatch-recovery-1',
  type: 'recovery',
  severity: 'critical',
  title: 'Recovery Assist',
  message: 'Vehicle is immobilized near the wash crossing.',
  source: 'team_member',
  createdAt: '2026-04-28T17:45:00.000Z',
  updatedAt: '2026-04-28T17:50:00.000Z',
  status: 'recovery_critical',
  priority: 'Recovery Critical',
  category: 'recovery_assist',
  hazardType: 'recovery',
  location: {
    latitude: 39.123456,
    longitude: -120.654321,
    accuracyMeters: 12,
    timestamp: '2026-04-28T17:49:00.000Z',
    source: 'current_gps',
  },
  teamId: 'team-alpha',
  channelId: 'channel-alpha',
  sessionId: 'expedition-alpha',
};

assert.strictEqual(isIncidentRecoveryEvent(activeRecovery), true);

const activeState = buildIncidentRecoveryContainerState([activeRecovery], {
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  now: NOW,
});

assert.strictEqual(activeState.displayMode, 'active_incident');
assert.strictEqual(activeState.headline, 'Active Incident');
assert.strictEqual(activeState.hasActiveIncident, true);
assert.strictEqual(activeState.severity, 'critical');
assert.strictEqual(activeState.status, 'active');
assert.strictEqual(activeState.locationLabel, '39.12346, -120.65432');
assert.strictEqual(activeState.activeIncident.type, 'vehicle_stuck');
assert.strictEqual(activeState.activeIncident.injuryStatus, 'unknown');
assert.deepStrictEqual(activeState.missingCriticalData, []);
assert.strictEqual(activeState.buttonStates.timeline.badgeCount, 1);

const missingDataState = buildIncidentRecoveryContainerState([
  {
    ...activeRecovery,
    id: 'dispatch-recovery-missing',
    location: undefined,
    teamId: undefined,
    channelId: undefined,
    syncState: undefined,
    hazardType: undefined,
    category: undefined,
  },
], { now: NOW });

assert.deepStrictEqual(
  missingDataState.missingCriticalData,
  ['location', 'communication', 'hazard'],
);
assert.strictEqual(missingDataState.buttonStates.ecsAssessment.warning, true);
assert.strictEqual(missingDataState.nextRecommendedAction, 'Confirm incident location.');

const resolvedState = buildIncidentRecoveryContainerState([
  {
    ...activeRecovery,
    id: 'dispatch-recovery-resolved',
    status: 'resolved',
    updatedAt: '2026-04-28T17:55:00.000Z',
  },
], { expeditionId: 'expedition-alpha', now: NOW });

assert.strictEqual(resolvedState.displayMode, 'resolved_recent');
assert.strictEqual(resolvedState.hasActiveIncident, false);
assert.strictEqual(resolvedState.nextRecommendedAction, 'Complete debrief when ready.');
assert.strictEqual(resolvedState.buttonStates.resolveDebrief.status, 'complete');

console.log('Incident & Recovery container state checks passed.');
