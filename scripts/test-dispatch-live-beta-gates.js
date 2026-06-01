const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const rolloutSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchRolloutConfig.ts'), 'utf8');
const commandCenterSource = fs.readFileSync(
  path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx'),
  'utf8',
);
const expeditionDispatchSource = fs.readFileSync(path.join(process.cwd(), 'app/expedition-dispatch.tsx'), 'utf8');
const serviceAdaptersSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchServiceAdapters.ts'), 'utf8');
const mockDataSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchMockData.ts'), 'utf8');

const {
  DEFAULT_DISPATCH_ROLLOUT_CONFIG,
  getDispatchRolloutDisabledCopy,
  resolveDispatchRolloutConfig,
} = loadTypeScriptModule('lib/dispatchRolloutConfig.ts');

for (const feature of [
  'teamPositionSharing',
  'agencyDataIngestion',
  'externalDispatchIntegration',
  'publicHazardPublishing',
  'automatedSosTransmission',
  'liveRadioNetworkIntegrations',
  'demoData',
]) {
  assert.strictEqual(
    DEFAULT_DISPATCH_ROLLOUT_CONFIG[feature],
    false,
    `${feature} should default off for Dispatch internal beta.`,
  );
  assert.strictEqual(
    resolveDispatchRolloutConfig()[feature],
    false,
    `${feature} should resolve off by default.`,
  );
  assert.ok(
    getDispatchRolloutDisabledCopy(feature).length > 0,
    `${feature} should have disabled copy.`,
  );
  assert.ok(rolloutSource.includes(feature), `${feature} should be centralized in dispatchRolloutConfig.`);
}

for (const requiredSource of [
  'resolveDispatchRolloutConfig()',
  "isDispatchFeatureEnabled(dispatchRollout, 'teamPositionSharing')",
  "isDispatchFeatureEnabled(dispatchRollout, 'agencyDataIngestion')",
  "isDispatchFeatureEnabled(dispatchRollout, 'externalDispatchIntegration')",
  "isDispatchFeatureEnabled(dispatchRollout, 'publicHazardPublishing')",
  "isDispatchFeatureEnabled(dispatchRollout, 'automatedSosTransmission')",
  "isDispatchFeatureEnabled(dispatchRollout, 'liveRadioNetworkIntegrations')",
  'dispatchSensitiveGateNotice',
  '!externalDispatchIntegrationEnabled || !recoveryCadBackendContext',
  '!externalDispatchIntegrationEnabled || !recoveryCadRealtimeExpeditionId',
  'teamPositionSharingEnabled || externalDispatchIntegrationEnabled',
  'Recovery report saved locally.',
  'Local ECS Dispatch report only. This does not contact emergency services or publish externally.',
]) {
  assert.ok(
    commandCenterSource.includes(requiredSource),
    `Dispatch command center should include beta gate source: ${requiredSource}`,
  );
}

const headerIndex = commandCenterSource.indexOf('<View style={styles.headerStrip}>');
const topAdvisoryIndex = commandCenterSource.indexOf('{advisory ? (', headerIndex);
const convoySetupIndex = commandCenterSource.indexOf('<DispatchConvoyTeamSetupCard', topAdvisoryIndex);
const convoyCommandIndex = commandCenterSource.indexOf('<View style={styles.feedPanel}>', convoySetupIndex);
assert.ok(
  headerIndex >= 0 &&
    topAdvisoryIndex > headerIndex &&
    convoySetupIndex > topAdvisoryIndex &&
    convoyCommandIndex > convoySetupIndex,
  'Dispatch should render header/status actions, ECS advisory, convoy setup/team, then the enlarged convoy command surface.',
);
assert.ok(
  !commandCenterSource.includes('<View style={styles.rolloutNotice}>'),
  'Internal beta notice should not render as a visible line in the Dispatch page flow.',
);

assert.ok(
  commandCenterSource.includes('accessibilityLabel="Open convoy setup"') &&
    commandCenterSource.includes('styles.headerConvoyButton') &&
    commandCenterSource.includes("router.push('/convoy-command' as any)"),
  'Convoy setup entry should live in the Dispatch top-right action bar.',
);
assert.ok(
  serviceAdaptersSource.includes('if (!DISPATCH_DEV_DATA_ENABLED)') &&
    serviceAdaptersSource.includes('pings: [],') &&
    serviceAdaptersSource.includes('queueItems: [],') &&
    serviceAdaptersSource.includes('assignments: [],') &&
    serviceAdaptersSource.includes('timelineEvents: [],'),
  'Legacy Dispatch mock data should be empty when dev data is disabled.',
);
assert.ok(mockDataSource.includes('MOCK_DISPATCH_CAD_EVENTS'), 'Mock CAD fixtures may remain for dev/test coverage.');
assert.ok(
  commandCenterSource.includes('teamSnapshotRef.current') &&
    commandCenterSource.includes(': null'),
  'Live CAD aggregation should be able to omit team state when sharing/integration gates are off.',
);
for (const requiredSource of [
  "isDispatchFeatureEnabled(dispatchRollout, 'externalDispatchIntegration')",
  'if (!externalDispatchIntegrationEnabled || !expeditionId) return;',
  'if (!externalDispatchIntegrationEnabled) {',
  'External Dispatch feed sync is disabled for internal beta.',
  'getDispatchRolloutDisabledCopy(\'externalDispatchIntegration\')',
  'externalDispatchIntegrationEnabled && (canPost',
]) {
  assert.ok(
    expeditionDispatchSource.includes(requiredSource),
    `Legacy Expedition Dispatch feed should honor external integration gate: ${requiredSource}`,
  );
}

console.log('Dispatch internal beta gate checks passed.');
