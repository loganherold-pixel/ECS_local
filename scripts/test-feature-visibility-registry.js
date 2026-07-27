const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const registry = require(path.join(root, 'lib', 'features', 'featureVisibilityRegistry.ts'));
const dispatchRollout = require(path.join(root, 'lib', 'dispatchRolloutConfig.ts'));
const fleetRollout = require(path.join(root, 'lib', 'fleet', 'fleetPremiumReleaseConfig.ts'));
const { buildProductionReport } = require(path.join(root, 'scripts', 'generate-production-visibility-report.js'));
const registrySource = fs.readFileSync(
  path.join(root, 'lib', 'features', 'featureVisibilityRegistry.ts'),
  'utf8',
);

function context(overrides = {}) {
  return registry.createRuntimeFeatureVisibilityContext({
    environment: 'production',
    env: {},
    online: true,
    authenticated: true,
    hasFullAccess: true,
    isAdmin: false,
    backends: { supabase: 'available' },
    providers: {
      weather: 'available',
      established_campgrounds: 'available',
      dispersed_camping: 'available',
    },
    hardware: { bluetooth: 'available', gps: 'available' },
    permissions: { bluetooth: 'available', location: 'available' },
    privacyApprovals: new Set(),
    productionEvidence: new Set(),
    ...overrides,
  });
}

assert.deepStrictEqual(registry.validateECSFeatureRegistry(), []);
assert.strictEqual(new Set(registry.ECS_FEATURE_REGISTRY.map((feature) => feature.id)).size, registry.ECS_FEATURE_IDS.length);

for (const featureId of ['fleet_tab', 'navigate_tab', 'dashboard_tab', 'explore_tab', 'dispatch_tab']) {
  const decision = registry.resolveECSFeatureVisibility(featureId, context());
  assert.strictEqual(decision.visible, true, `${featureId} should preserve its intentionally enabled default.`);
}
assert.strictEqual(registry.resolveECSFeatureVisibility('explore_trip_builder', context()).visible, true);
assert.strictEqual(registry.resolveECSFeatureVisibility('explore_offline_prep', context()).visible, true);
assert.strictEqual(registry.resolveECSFeatureVisibility('dispatch_team_position_sharing', context()).visible, false);
assert.strictEqual(registry.resolveECSFeatureVisibility('dispatch_smart_rally', context()).visible, false);
assert.strictEqual(registry.resolveECSFeatureVisibility('ai_assist', context()).visible, false);

const approvedInternalCampEnv = {
  EXPO_PUBLIC_APP_ENV: 'internal',
  EXPO_PUBLIC_ECS_ESTABLISHED_CAMPSITES_LAYER: 'true',
  EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER: 'true',
};
assert.strictEqual(
  registry.resolveECSFeatureVisibility(
    'established_campgrounds',
    context({ environment: 'internal', env: approvedInternalCampEnv }),
  ).visible,
  true,
  'Approved internal builds should expose established campgrounds.',
);
assert.strictEqual(
  registry.resolveECSFeatureVisibility(
    'dispersed_camping',
    context({ environment: 'internal', env: approvedInternalCampEnv }),
  ).visible,
  true,
  'Approved internal builds should expose dispersed camping reference data.',
);
assert.strictEqual(
  registry.resolveECSFeatureVisibility(
    'dispersed_camping',
    context({
      environment: 'internal',
      env: {
        ...approvedInternalCampEnv,
        EXPO_PUBLIC_ECS_KILL_DISPERSED_CAMPING: 'true',
      },
    }),
  ).reason,
  'kill_switch',
  'The dispersed-camping kill switch must retain precedence in internal builds.',
);
assert.strictEqual(
  registry.resolveECSFeatureVisibility(
    'established_campgrounds',
    context({
      environment: 'internal',
      env: {
        ...approvedInternalCampEnv,
        EXPO_PUBLIC_ECS_ESTABLISHED_CAMPSITES_LAYER: 'false',
      },
    }),
  ).visible,
  false,
  'An explicit false rollout value must keep established campgrounds unavailable.',
);
assert.strictEqual(
  registry.resolveECSFeatureVisibility(
    'dispersed_camping',
    context({
      environment: 'production',
      env: {
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER: 'true',
      },
    }),
  ).reason,
  'environment_blocked',
  'A public production build must not inherit the internal dispersed-camping rollout.',
);
[
  'EXPO_PUBLIC_ECS_ESTABLISHED_CAMPSITES_LAYER',
  'EXPO_PUBLIC_ECS_KILL_ESTABLISHED_CAMPGROUNDS',
  'EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER',
  'EXPO_PUBLIC_ECS_KILL_DISPERSED_CAMPING',
].forEach((environmentKey) => {
  assert(
    new RegExp(`${environmentKey}:\\s*process\\.env\\.${environmentKey}`).test(registrySource),
    `Expo's authoritative feature reader should retain static camp rollout reference: ${environmentKey}`,
  );
});

const missingContext = registry.resolveECSFeatureVisibility('fleet_tab', {
  ...context(),
  environment: null,
  env: null,
});
assert.strictEqual(missingContext.availability, 'unavailable');
assert.strictEqual(missingContext.reason, 'configuration_missing');

const malformed = registry.resolveECSFeatureVisibility('explore_trip_builder', context({
  env: { EXPO_PUBLIC_ECS_EXPLORE_TRIP_BUILDER: 'sometimes' },
}));
assert.strictEqual(malformed.availability, 'unavailable');
assert.strictEqual(malformed.reason, 'configuration_malformed');

const developmentQa = registry.resolveECSFeatureVisibility('developer_qa_surfaces', context({
  environment: 'development',
}));
assert.strictEqual(developmentQa.visible, true);
const productionQa = registry.resolveECSFeatureVisibility('developer_qa_surfaces', context());
assert.strictEqual(productionQa.visible, false);
assert.strictEqual(productionQa.reason, 'debug_build_only');

const disabledTripRoute = registry.resolveECSFeatureRouteAccess(
  '/explore-trip-builder?route=abc',
  context({ env: { EXPO_PUBLIC_ECS_EXPLORE_TRIP_BUILDER: '0' } }),
  'explore_trip_builder',
);
assert.strictEqual(disabledTripRoute.matched, true);
assert.strictEqual(disabledTripRoute.allowed, false);
assert.strictEqual(disabledTripRoute.safeReturnRoute, '/discover');

const productionDevRoute = registry.resolveECSFeatureRouteAccess('/dev/campops-visual-qa', context());
assert.strictEqual(productionDevRoute.allowed, false);
assert.strictEqual(productionDevRoute.featureId, 'developer_qa_surfaces');

const degradedDeviceRoute = registry.resolveECSFeatureRouteAccess('/power/blu', context({
  hardware: { bluetooth: 'unavailable', gps: 'available' },
  permissions: { bluetooth: 'unknown', location: 'available' },
}));
assert.strictEqual(degradedDeviceRoute.allowed, true);
assert.strictEqual(degradedDeviceRoute.readOnly, true);
assert.strictEqual(degradedDeviceRoute.decision.availability, 'degraded');

const offlinePrep = registry.resolveECSFeatureVisibility('explore_offline_prep', context({ online: false }));
assert.strictEqual(offlinePrep.availability, 'available');
const offlineConvoy = registry.resolveECSFeatureVisibility('convoy_command', context({ online: false }));
assert.strictEqual(offlineConvoy.availability, 'degraded');

const signedOutConvoy = registry.resolveECSFeatureVisibility('convoy_command', context({ authenticated: false }));
assert.strictEqual(signedOutConvoy.reason, 'authentication_required');

const providerUnavailable = registry.resolveECSFeatureVisibility('weather_route_intelligence', context({
  providers: { weather: 'unavailable' },
}));
assert.strictEqual(providerUnavailable.availability, 'degraded');
assert.strictEqual(providerUnavailable.reason, 'provider_unavailable');

const dependencyUnavailable = registry.resolveECSFeatureVisibility('explore_trip_builder', context({
  env: { EXPO_PUBLIC_ECS_KILL_EXPLORE_TAB: '1' },
}));
assert.strictEqual(dependencyUnavailable.reason, 'feature_dependency_unavailable');

const killed = registry.resolveECSFeatureVisibility('dispatch_tab', context({
  env: { EXPO_PUBLIC_ECS_KILL_DISPATCH_TAB: 'true' },
}));
assert.strictEqual(killed.availability, 'unavailable');
assert.strictEqual(killed.reason, 'kill_switch');

const forcedPositionSharingBase = {
  environment: 'internal',
  env: { EXPO_PUBLIC_ECS_TEAM_POSITION_SHARING: '1' },
  authenticated: true,
  backends: { supabase: 'available' },
  hardware: { gps: 'available' },
  permissions: { location: 'available' },
};
const forcedWithoutApproval = registry.resolveECSFeatureVisibility(
  'dispatch_team_position_sharing',
  context(forcedPositionSharingBase),
);
assert.strictEqual(forcedWithoutApproval.visible, false);
assert.strictEqual(forcedWithoutApproval.reason, 'privacy_approval_required');
assert.strictEqual(forcedWithoutApproval.forcedEnable, true);

const forcedWithoutEvidence = registry.resolveECSFeatureVisibility(
  'dispatch_team_position_sharing',
  context({
    ...forcedPositionSharingBase,
    privacyApprovals: new Set(['dispatch_position_sharing_privacy']),
  }),
);
assert.strictEqual(forcedWithoutEvidence.reason, 'production_evidence_required');

const forcedApproved = registry.resolveECSFeatureVisibility(
  'dispatch_team_position_sharing',
  context({
    ...forcedPositionSharingBase,
    privacyApprovals: new Set(['dispatch_position_sharing_privacy']),
    productionEvidence: new Set([
      'dispatch_multiclient_device_evidence',
      'dispatch_position_sharing_owner_acceptance',
    ]),
  }),
);
assert.strictEqual(forcedApproved.visible, true);
assert.strictEqual(forcedApproved.productionApproved, false, 'Restricted field-test maturity must not claim production approval.');

const forcedSmartRallyBase = {
  ...forcedPositionSharingBase,
  env: {
    EXPO_PUBLIC_ECS_MISSION_COMMAND: '1',
    EXPO_PUBLIC_ECS_SMART_RALLY: '1',
    EXPO_PUBLIC_ECS_TEAM_POSITION_SHARING: '1',
  },
};
const smartRallyWithoutApproval = registry.resolveECSFeatureVisibility(
  'dispatch_smart_rally',
  context(forcedSmartRallyBase),
);
assert.strictEqual(smartRallyWithoutApproval.visible, false);
assert.strictEqual(smartRallyWithoutApproval.reason, 'privacy_approval_required');

const smartRallyApproved = registry.resolveECSFeatureVisibility(
  'dispatch_smart_rally',
  context({
    ...forcedSmartRallyBase,
    privacyApprovals: new Set(['dispatch_position_sharing_privacy']),
    productionEvidence: new Set([
      'dispatch_multiclient_device_evidence',
      'dispatch_position_sharing_owner_acceptance',
    ]),
  }),
);
assert.strictEqual(smartRallyApproved.visible, true);
assert.strictEqual(smartRallyApproved.productionApproved, false);

const smartRallyRollout = dispatchRollout.resolveDispatchRolloutConfig({
  missionCommand: true,
  teamPositionSharing: true,
  convoyRegroupPlanner: true,
}, context({
  ...forcedSmartRallyBase,
  privacyApprovals: new Set(['dispatch_position_sharing_privacy']),
  productionEvidence: new Set([
    'dispatch_multiclient_device_evidence',
    'dispatch_position_sharing_owner_acceptance',
  ]),
}));
assert.strictEqual(smartRallyRollout.missionCommand, true);
assert.strictEqual(smartRallyRollout.teamPositionSharing, true);
assert.strictEqual(smartRallyRollout.convoyRegroupPlanner, true);

const legacyDispatchForced = dispatchRollout.resolveDispatchRolloutConfig({
  teamPositionSharing: true,
  externalDispatchIntegration: true,
}, context({
  environment: 'internal',
  env: {
    EXPO_PUBLIC_ECS_TEAM_POSITION_SHARING: '1',
    EXPO_PUBLIC_ECS_DISPATCH_EXTERNAL_INTEGRATIONS: '1',
  },
  authenticated: true,
  isAdmin: true,
}));
assert.strictEqual(legacyDispatchForced.teamPositionSharing, false);
assert.strictEqual(legacyDispatchForced.externalDispatchIntegration, false);

const productionFleet = fleetRollout.resolveFleetPremiumReleaseConfig({}, context());
assert.strictEqual(productionFleet.premiumFleetEnabled, true);
assert.strictEqual(productionFleet.developerDiagnostics, false);

const matrix = registry.buildECSCapabilityMatrix(context());
assert.strictEqual(matrix.length, registry.ECS_FEATURE_IDS.length);
assert(matrix.every((row) => row.featureId && row.reason && row.unavailableCopy));
assert.strictEqual(JSON.stringify(matrix).includes('SUPABASE_ANON_KEY'), false);

const report = buildProductionReport({
  env: {
    NODE_ENV: 'production',
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'must-not-appear',
  },
  generatedAt: '2026-07-12T12:00:00.000Z',
});
assert.strictEqual(report.schemaVersion, 'ecs.production-visibility.v1');
assert.strictEqual(report.registryValid, true);
assert.strictEqual(report.guardPassed, true);
assert.strictEqual(JSON.stringify(report).includes('must-not-appear'), false);
assert(report.features.some((feature) => feature.productionBlockers.length > 0));

const rootLayout = fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8');
const dock = fs.readFileSync(path.join(root, 'components', 'CommandDock.tsx'), 'utf8');
const distribution = fs.readFileSync(path.join(root, 'lib', 'auth', 'distributionEntryResolver.ts'), 'utf8');
const routePolicy = fs.readFileSync(path.join(root, 'lib', 'navigation', 'ecsRoutePolicy.ts'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'lib', 'explore', 'exploreFeatureRegistry.ts'), 'utf8');
assert(rootLayout.includes('resolveECSRoutePolicy'));
assert(rootLayout.includes('feature-unavailable?feature='));
assert(dock.includes('selectVisibleECSPrimaryTabs'));
assert(!dock.includes('resolveDispatchRolloutConfig'));
assert(distribution.includes('resolveECSFeatureRouteAccess'));
assert(routePolicy.includes('resolveECSFeatureRouteAccess'));
assert(!distribution.includes('process.env.EXPO_PUBLIC_ECS_CONVOY_RIVE_QA'));
assert(!explore.includes("centralFeatureId: 'explore_trip_builder'"));
assert(explore.includes("centralFeatureId: 'explore_offline_prep'"));
assert(
  registrySource.includes("id: 'explore_trip_builder'"),
  'The legacy direct Trip Builder route should remain governed outside the mounted Explore registry.',
);

console.log('Authoritative feature visibility and production report checks passed.');
