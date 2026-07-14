const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const preloadPath = path.join(root, 'lib', 'fleet', 'fleetQaPreload.ts');
const fleetScreenPath = path.join(root, 'app', '(tabs)', 'fleet.tsx');
const releaseDocPath = path.join(root, 'docs', 'fleet-premium-release.md');

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
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

function walk(value, visit, pathParts = []) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child, pathParts.concat(key));
    walk(child, visit, pathParts.concat(key));
  }
}

function assertNoMediaKeys(value, context) {
  const forbidden = ['photo', 'image', 'imageurl', 'image_url', 'remoteimage', 'manifest', 'resolver', 'upload'];
  walk(value, (key, _child, pathParts) => {
    const normalized = key.toLowerCase().replace(/[^a-z_]/g, '');
    assert.ok(
      !forbidden.some((fragment) => normalized.includes(fragment)),
      `${context} must not include media key ${pathParts.join('.')}`,
    );
  });
}

async function main() {
  assert.ok(fs.existsSync(preloadPath), 'Fleet QA preload module should exist.');

  const preload = require(preloadPath);
  const fleetScreen = fs.readFileSync(fleetScreenPath, 'utf8');
  const releaseDoc = fs.readFileSync(releaseDocPath, 'utf8');

  assert.deepStrictEqual(preload.FLEET_QA_PRELOAD_STATE_IDS, [
    'zero_vehicle',
    'two_vehicle_active_switch',
    'verified_vs_estimated_weight',
    'payload_pressure',
    'offline_restore_migration',
  ]);

  const zero = preload.buildFleetQaPreloadPlan('zero_vehicle');
  assert.strictEqual(zero.vehicles.length, 0, 'Zero-vehicle preload should clear Fleet vehicles.');
  assert.strictEqual(zero.activeVehicleId, null, 'Zero-vehicle preload should clear active vehicle state.');
  assert.ok(zero.evidenceTargets.includes('profile-zero-vehicle'), 'Zero preload should map to release evidence target.');

  const twoVehicle = preload.buildFleetQaPreloadPlan('two_vehicle_active_switch');
  assert.strictEqual(twoVehicle.vehicles.length, 2, 'Two-vehicle preload should stage exactly two vehicles.');
  assert.strictEqual(twoVehicle.activeVehicleId, 'fleet-qa-ram-lead');
  assert.deepStrictEqual(twoVehicle.activeSwitchSequence, ['fleet-qa-ram-lead', 'fleet-qa-bronco-scout']);
  assert.ok(twoVehicle.vehicles.every((vehicle) => vehicle.owner_user_id === 'local'), 'QA vehicles should stay local-only.');
  assertNoMediaKeys(twoVehicle, 'Two-vehicle preload');

  const weightPlan = preload.buildFleetQaPreloadPlan('verified_vs_estimated_weight');
  const verified = weightPlan.expectedStates.find((state) => state.vehicleId === 'fleet-qa-scale-ticket');
  const estimated = weightPlan.expectedStates.find((state) => state.vehicleId === 'fleet-qa-estimated');
  assert.ok(verified, 'Verified-weight plan should expose a scale-ticket vehicle state.');
  assert.ok(estimated, 'Estimated-weight plan should expose an estimated vehicle state.');
  assert.strictEqual(verified.baseWeightSource, 'scale_ticket');
  assert.strictEqual(verified.confidenceLevel, 'verified');
  assert.ok(estimated.baseWeightSource === 'ecs_default' || estimated.baseWeightSource === 'user_estimate');
  assert.ok(['ecs_estimate', 'class_estimate', 'catalog_estimate'].includes(estimated.confidenceLevel));
  assert.ok(verified.confidenceScore > estimated.confidenceScore, 'Verified state should score higher confidence than estimate.');

  const pressure = preload.buildFleetQaPreloadPlan('payload_pressure');
  const pressureState = pressure.expectedStates.find((state) => state.vehicleId === 'fleet-qa-payload-pressure');
  assert.ok(pressureState, 'Payload pressure plan should expose expected payload state.');
  assert.ok(pressureState.payloadRemainingLb <= 550, `Payload pressure should leave a tight margin, got ${pressureState.payloadRemainingLb}.`);
  assert.ok(['watch', 'caution', 'critical'].includes(pressureState.payloadRiskLevel));
  assert.ok(['watch', 'caution', 'critical'].includes(pressureState.topHeavyRisk));
  assert.ok(pressure.previews['fleet-qa-payload-pressure'], 'Payload pressure should include a loadout consequence preview.');
  assert.ok(
    pressure.previews['fleet-qa-payload-pressure'].sourceWarnings.some((warning) => warning.id.includes('estimated')),
    'Payload pressure preview should keep estimated source warnings visible.',
  );
  assertNoMediaKeys(pressure, 'Payload pressure preload');

  const offline = preload.buildFleetQaPreloadPlan('offline_restore_migration');
  assert.strictEqual(offline.vehicles.length, 1, 'Offline restore/migration plan should stage one migrated vehicle.');
  assert.strictEqual(offline.activeVehicleId, 'fleet-qa-offline-migrated');
  assert.strictEqual(
    offline.vehicles[0].wizard_config.legacy_keep_me,
    'preserved',
    'Offline migration preload should preserve legacy wizard_config keys.',
  );
  assert.ok(offline.vehicles[0].wizard_config.fleet_premium_migration_version, 'Offline preload should write migration version.');
  assert.strictEqual(offline.offlineRestore.cached, true);
  assert.strictEqual(offline.offlineRestore.requiresNetwork, false);
  assertNoMediaKeys(offline, 'Offline restore preload');

  const calls = [];
  const fakeAdapter = {
    waitForHydration: async () => calls.push('hydrate'),
    getExistingVehicles: async () => [
      { id: 'old-a' },
      { id: 'old-b' },
    ],
    deleteVehicle: async (vehicleId) => calls.push(`delete:${vehicleId}`),
    importVehicles: async (vehicles) => calls.push(`import:${vehicles.map((vehicle) => vehicle.id).join(',')}`),
    setSpec: async (vehicleId) => calls.push(`spec:${vehicleId}`),
    removeSpec: async (vehicleId) => calls.push(`removeSpec:${vehicleId}`),
    setConsumables: async (vehicleId) => calls.push(`consumables:${vehicleId}`),
    removeConsumables: async (vehicleId) => calls.push(`removeConsumables:${vehicleId}`),
    setTiresLift: async (vehicleId) => calls.push(`tires:${vehicleId}`),
    removeTiresLift: async (vehicleId) => calls.push(`removeTires:${vehicleId}`),
    setActiveVehicleId: async (vehicleId) => calls.push(`active:${vehicleId}`),
    clearActiveVehicleId: async () => calls.push('clearActive'),
    flush: async () => calls.push('flush'),
  };
  const result = await preload.applyFleetQaPreloadPlan('two_vehicle_active_switch', fakeAdapter);
  assert.strictEqual(result.clearedVehicleCount, 2);
  assert.strictEqual(result.importedVehicleCount, 2);
  assert.deepStrictEqual(calls.slice(0, 3), ['hydrate', 'delete:old-a', 'removeSpec:old-a']);
  assert.ok(calls.includes('delete:old-b'), 'Preload apply should clear every existing local vehicle.');
  assert.ok(calls.includes('import:fleet-qa-ram-lead,fleet-qa-bronco-scout'));
  assert.ok(calls.includes('active:fleet-qa-ram-lead'));
  assert.strictEqual(calls.at(-1), 'flush');
  assert.ok(fleetScreen.includes("import {"), 'Fleet screen should keep explicit imports.');
  assert.ok(fleetScreen.includes('applyFleetQaPreloadPlan'), 'Fleet screen should wire the QA preload apply path.');
  assert.ok(fleetScreen.includes('fleetPremiumRollout.developerDiagnostics'), 'Fleet QA preload UI should stay behind developer diagnostics.');
  assert.ok(fleetScreen.includes("typeof __DEV__ !== 'undefined' && __DEV__"), 'Fleet QA preload UI should be dev-only.');
  assert.ok(fleetScreen.includes('FleetQaPreloadPanel'), 'Fleet should render a compact QA preload panel.');
  assert.ok(fleetScreen.includes('handleFleetQaActiveSwitch'), 'Fleet should expose a deterministic active-switch helper for two-vehicle evidence.');
  assert.ok(
    releaseDoc.includes('Fleet QA Preload Harness') &&
      releaseDoc.includes('zero_vehicle') &&
      releaseDoc.includes('payload_pressure') &&
      releaseDoc.includes('offline_restore_migration'),
    'Fleet release doc should document QA preload state IDs.',
  );

  console.log('Fleet QA preload checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
