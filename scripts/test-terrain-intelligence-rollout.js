const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

const registry = loadTsModule('lib/features/featureVisibilityRegistry.ts');
const renderers = fs.readFileSync(
  path.join(root, 'components/dashboard/WidgetRenderers.tsx'),
  'utf8',
);
const widgetRegistry = fs.readFileSync(path.join(root, 'lib/widgetRegistry.ts'), 'utf8');
const dashboardStore = fs.readFileSync(path.join(root, 'lib/dashboardStore.ts'), 'utf8');
const productionReportModule = require(path.join(root, 'scripts/generate-production-visibility-report.js'));

function context(environment, env) {
  return registry.createRuntimeFeatureVisibilityContext({
    environment,
    env,
    online: true,
    authenticated: true,
    hasFullAccess: true,
    backends: {},
    providers: {},
    hardware: {},
    permissions: {},
    privacyApprovals: new Set(),
    productionEvidence: new Set(),
  });
}

const feature = registry.getECSFeatureDefinition('terrain_intelligence_command');
assert(feature, 'Terrain Intelligence Command must be registered centrally');
assert.equal(feature.ownerDomain, 'dashboard');
assert.equal(feature.maturity, 'restricted_field_test');
assert.equal(feature.defaultEnabled, false);
assert.equal(feature.environment.enableFlagRequired, true);
assert.equal(feature.killSwitch, 'EXPO_PUBLIC_ECS_KILL_TERRAIN_INTELLIGENCE_COMMAND');
assert.equal(feature.relatedReadinessGate, 'gate:terrain-intelligence-command');
assert.equal(feature.verification.implementationStatus, 'complete');
assert.equal(feature.verification.automatedChecks, 'passed');
assert.equal(feature.verification.rolloutStatus, 'restricted');
assert.equal(feature.verification.nativeEvidenceStatus, 'missing');
assert.equal(feature.verification.productionApproval, 'not_granted');
assert(feature.productionEvidence.requirements.includes('mobile_android_golden_journey'));
assert(feature.productionEvidence.requirements.includes('mobile_ios_golden_journey'));
assert(feature.productionEvidence.requirements.includes('field_owner_acceptance'));

const enabled = registry.resolveECSFeatureVisibility(
  'terrain_intelligence_command',
  context('internal', { EXPO_PUBLIC_ECS_TERRAIN_INTELLIGENCE_COMMAND: 'true' }),
);
assert.equal(enabled.visible, true, 'explicit internal rollout enables the expanded HUD');
assert.equal(enabled.productionApproved, false);

const disabled = registry.resolveECSFeatureVisibility(
  'terrain_intelligence_command',
  context('internal', { EXPO_PUBLIC_ECS_TERRAIN_INTELLIGENCE_COMMAND: 'false' }),
);
assert.equal(disabled.visible, false);
assert.equal(disabled.reason, 'rollout_disabled');

const missing = registry.resolveECSFeatureVisibility(
  'terrain_intelligence_command',
  context('internal', {}),
);
assert.equal(missing.visible, false);
assert.equal(missing.reason, 'configuration_missing');

const malformed = registry.resolveECSFeatureVisibility(
  'terrain_intelligence_command',
  context('internal', { EXPO_PUBLIC_ECS_TERRAIN_INTELLIGENCE_COMMAND: 'sometimes' }),
);
assert.equal(malformed.visible, false);
assert.equal(malformed.reason, 'configuration_malformed');

const killed = registry.resolveECSFeatureVisibility(
  'terrain_intelligence_command',
  context('internal', {
    EXPO_PUBLIC_ECS_TERRAIN_INTELLIGENCE_COMMAND: 'true',
    EXPO_PUBLIC_ECS_KILL_TERRAIN_INTELLIGENCE_COMMAND: 'true',
  }),
);
assert.equal(killed.visible, false);
assert.equal(killed.reason, 'kill_switch');

const production = registry.resolveECSFeatureVisibility(
  'terrain_intelligence_command',
  context('production', { EXPO_PUBLIC_ECS_TERRAIN_INTELLIGENCE_COMMAND: 'true' }),
);
assert.equal(production.visible, false, 'production cannot force-enable the restricted HUD');
assert.equal(production.reason, 'environment_blocked');

const directAccess = registry.resolveECSFeatureRouteAccess(
  '/terrain-intelligence-command?route=restored',
  context('internal', {}),
);
assert.equal(directAccess.matched, true);
assert.equal(directAccess.allowed, false, 'direct and restored route access fails closed');
assert.equal(directAccess.safeReturnRoute, '/dashboard');

assert(renderers.includes("resolveECSFeatureVisibility(\n        'terrain_intelligence_command'"));
assert(renderers.includes('terrainCommandDecision?.visible ? ('));
assert(renderers.includes('<TerrainIntelligenceCommand'));
assert(renderers.includes('<TerrainIntelligenceCommandUnavailable'));
assert(renderers.includes('Interactive Terrain Intelligence is not available in this release.'));
assert(renderers.includes('<QuickTerrainWidget snapshot={snapshot}'));
assert(renderers.includes('terrain-intelligence-command-rollout-unavailable'));
assert(
  renderers.indexOf("detailMode\n    ? resolveECSFeatureVisibility") <
    renderers.indexOf('<TerrainIntelligenceCommand'),
  'detail rendering must resolve rollout before mounting the interactive HUD',
);

assert(widgetRegistry.includes("widgetId: 'terrain-risk'"), 'compact widget remains registered');
assert(widgetRegistry.includes("{ widgetId: 'terrain-risk', widgetSize: '1x1' }"));
assert(
  dashboardStore.includes('Dashboard state hydrated from persistent storage') &&
    dashboardStore.includes('Dashboard state missing persisted storage; using defaults'),
  'customized layouts remain governed by persisted-state hydration rather than rollout state',
);

const report = productionReportModule.buildProductionReport({
  env: {
    NODE_ENV: 'production',
    EXPO_PUBLIC_ECS_TERRAIN_INTELLIGENCE_COMMAND: 'true',
  },
  generatedAt: '2026-07-25T00:00:00.000Z',
});
const reportRow = report.features.find((row) => row.featureId === 'terrain_intelligence_command');
assert(reportRow, 'generated visibility report must include Terrain Intelligence Command');
assert.equal(reportRow.visible, false);
assert.equal(reportRow.productionApproved, false);
assert.equal(reportRow.maturity, 'restricted_field_test');
assert(reportRow.productionEvidenceRequirements.includes('mobile_map_responsiveness'));
assert(reportRow.productionBlockers.some((blocker) => blocker.includes('field_owner_acceptance')));
assert.equal(reportRow.verification.implementationStatus, 'complete');
assert.equal(reportRow.verification.automatedChecks, 'passed');
assert.equal(reportRow.verification.rolloutStatus, 'restricted');
assert.equal(reportRow.verification.nativeEvidenceStatus, 'missing');
assert.equal(reportRow.verification.productionApproval, 'not_granted');
assert(
  report.guardChecks.some((check) =>
    check.id === 'terrain_intelligence_command_restricted_without_native_evidence' && check.passed),
);

console.log('[terrain-intelligence-rollout] fail-closed registry, compact fallback, deep-link guard, and visibility report passed');
