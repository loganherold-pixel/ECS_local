const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const loginSource = fs.readFileSync(path.join(root, 'app', 'login.tsx'), 'utf8');
const localDataSource = fs.readFileSync(path.join(root, 'lib', 'localDataExport.ts'), 'utf8');
const vehicleStoreSource = fs.readFileSync(path.join(root, 'lib', 'vehicleStore.ts'), 'utf8');
const loadoutStoreSource = fs.readFileSync(path.join(root, 'lib', 'loadoutStore.ts'), 'utf8');
const routeStoreSource = fs.readFileSync(path.join(root, 'lib', 'routeStore.ts'), 'utf8');
const smokeFixturePath = path.join(root, 'fixtures', 'local-data', 'ecs-smoke-local-profile.json');
const bundledSmokeFixturePath = path.join(root, 'lib', 'dev', 'localDataSmokeSeedFixture.json');
const devSmokeSeedSourcePath = path.join(root, 'lib', 'dev', 'localDataSmokeSeed.ts');
const devSmokeSeedSource = fs.existsSync(devSmokeSeedSourcePath)
  ? fs.readFileSync(devSmokeSeedSourcePath, 'utf8')
  : '';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function assertNoPrivateSmokeSeedValues(value, breadcrumb = 'fixture') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateSmokeSeedValues(item, `${breadcrumb}[${index}]`));
    return;
  }

  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      assert.ok(!/sk-(proj|live|test)?-/i.test(value), `${breadcrumb} must not contain OpenAI-style API keys.`);
      assert.ok(!/service_role/i.test(value), `${breadcrumb} must not contain service-role material.`);
      assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value), `${breadcrumb} must not contain email addresses.`);
      assert.ok(!/https?:\/\/(?!example\.invalid\b)/i.test(value), `${breadcrumb} must not contain remote URLs.`);
    }
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    assert.ok(
      !/(api[_-]?key|secret|token|service[_-]?role|authorization|password|email|phone|photo|image_url|remote_url)/i.test(key),
      `${breadcrumb}.${key} must not introduce private, auth, or remote media fields.`,
    );
    assertNoPrivateSmokeSeedValues(nestedValue, `${breadcrumb}.${key}`);
  }
}

function expectedItemCounts(data) {
  const vehicleSpecs = data.vehicle_specs && typeof data.vehicle_specs === 'object' && !Array.isArray(data.vehicle_specs)
    ? data.vehicle_specs
    : {};
  return {
    trips: asArray(data.trips).filter((item) => !item.deleted_at).length,
    load_items: asArray(data.load_items).filter((item) => !item.deleted_at).length,
    load_map_slots: asArray(data.load_map_slots).filter((item) => !item.deleted_at && item.load_item_id).length,
    waypoints: asArray(data.waypoints).filter((item) => !item.deleted_at).length,
    fuel_water_logs: asArray(data.fuel_water_logs).filter((item) => !item.deleted_at).length,
    routes: asArray(data.routes).length,
    loadouts: asArray(data.loadouts).length,
    loadout_items: asArray(data.loadout_items).length,
    vehicles: asArray(data.vehicles).length,
    vehicle_specs: Object.keys(vehicleSpecs).length,
    expedition_log_entries: asArray(data.expedition_log).length,
  };
}

assert.equal(
  packageJson.scripts?.['test:local-data-import-export'],
  'node ./scripts/test-local-data-import-export.js',
  'Local data import/export should remain directly runnable through the package test surface.',
);

assert.ok(
  loginSource.includes('exportLocalData') &&
    loginSource.includes('importLocalData') &&
    loginSource.includes('const [importingLocalData, setImportingLocalData] = useState(false);') &&
    loginSource.includes('const result = await importLocalData();') &&
    loginSource.includes('onImport={handleImport}') &&
    loginSource.includes('Import local data') &&
    loginSource.includes('Export local data') &&
    loginSource.includes('dataTransferRow') &&
    loginSource.includes("flexDirection: 'row'"),
  'Login should show equal adjacent import/export local data controls wired to the import engine.',
);

assert.ok(
  localDataSource.includes('export async function importLocalData()') &&
    localDataSource.includes('export async function importLocalDataFromRawJson') &&
    localDataSource.includes('export async function importDevSmokeLocalData') &&
    localDataSource.includes("await import('expo-document-picker' as any)") &&
    localDataSource.includes('fsReadFileFromPickerUri') &&
    localDataSource.includes('vehicleStore.importLocalSnapshot') &&
    localDataSource.includes('loadoutStore.importLocalSnapshot') &&
    localDataSource.includes('loadoutItemStore.importLocalSnapshot') &&
    localDataSource.includes('routeStore.bulkUpsert') &&
    localDataSource.includes('setupStore.markComplete') &&
    localDataSource.includes('vehicleSetupStore.setActiveVehicleId'),
  'Local data import should pick JSON files, merge exported records, and restore active vehicle/setup state.',
);

assert.ok(
  loginSource.includes('importDevSmokeLocalData') &&
    loginSource.includes('devSeedingLocalData') &&
    loginSource.includes('isDevSmokeSeedEnabled') &&
    loginSource.includes('__DEV__') &&
    loginSource.includes('Load smoke seed') &&
    loginSource.includes('onDevSmokeSeed') &&
    loginSource.includes('Smoke profile loaded. Continue with Free to open the seeded ECS dashboard.') &&
    loginSource.includes('setDevSmokeSeedReady(true)') &&
    loginSource.includes("devSmokeSeedReady && Platform.OS === 'web'") &&
    loginSource.includes("window.location.replace('/dashboard')"),
  'Login should expose a development-only smoke seed that completes before the normal guest handoff.',
);

assert.ok(
  localDataSource.includes('importLocalDataFromRawJson(rawJson') &&
    localDataSource.includes('const rawJson = await pickLocalDataImportJson();') &&
    localDataSource.includes('return importLocalDataFromRawJson(rawJson') &&
    localDataSource.includes("import('./dev/localDataSmokeSeed')") &&
    localDataSource.includes('typeof __DEV__') &&
    localDataSource.includes('dev_smoke_seed'),
  'Local data import should share one raw JSON merge engine between picker import and the dev smoke seed.',
);

assert.ok(
  !localDataSource.includes('fixtures/local-data/ecs-smoke-local-profile.json') &&
    !localDataSource.includes('../fixtures/local-data'),
  'Production local data runtime must not statically reference smoke fixture paths.',
);

assert.ok(
  devSmokeSeedSource.includes('export function loadDevSmokeLocalDataSeed') &&
    devSmokeSeedSource.includes('./localDataSmokeSeedFixture.json') &&
    fs.existsSync(bundledSmokeFixturePath),
  'Smoke seed fixture loading should live in an explicit dev-only module.',
);
assert.ok(
  devSmokeSeedSource.includes("require('./localDataSmokeSeedFixture.json')") &&
    !devSmokeSeedSource.includes('dynamicRequire(fixturePath)'),
  'Dev smoke seed loading must use a Metro-static dev-bundled fixture require so Android dev-client can bundle it.',
);

assert.ok(
  loginSource.includes('AUTH_UTILITY_HIT_SLOP') &&
    loginSource.includes('auth-continue-free-button') &&
    loginSource.includes('auth-view-pro-button') &&
    loginSource.includes('auth-import-local-data-button') &&
    loginSource.includes('auth-export-local-data-button') &&
    loginSource.includes('accessibilityLabel="Continue with Free"') &&
    loginSource.includes('keyboardShouldPersistTaps="always"') &&
    loginSource.includes('LOGIN_PORTRAIT_SCROLL_BOTTOM_BUFFER = 132') &&
    loginSource.includes('authViewportHeight + portraitScrollBottomBuffer') &&
    loginSource.includes("screenTopContent: { flexGrow: 1, justifyContent: 'flex-start', paddingBottom: 32 }") &&
    /secondaryButton:\s*\{[\s\S]*minHeight:\s*44/.test(loginSource) &&
    /exportButton:\s*\{[\s\S]*minHeight:\s*42/.test(loginSource) &&
    /devSeedButton:\s*\{[\s\S]*minHeight:\s*42/.test(loginSource),
  'Login utility controls should have stable mobile test IDs, persistent taps, and field-ready touch targets.',
);

assert.ok(
  vehicleStoreSource.includes('importLocalSnapshot: async (incomingVehicles: Vehicle[])') &&
    loadoutStoreSource.includes('importLocalSnapshot: async (incomingLoadouts: LocalLoadout[])') &&
    loadoutStoreSource.includes('importLocalSnapshot: async (incomingItems: LocalLoadoutItem[])') &&
    routeStoreSource.includes('bulkUpsert: (incomingRoutes: ImportedRoute[])'),
  'Local stores should expose merge-based restore hooks for ECS backup imports.',
);

assert.ok(fs.existsSync(smokeFixturePath), 'A privacy-safe exported local-data smoke fixture should exist.');
const smokeFixture = JSON.parse(fs.readFileSync(smokeFixturePath, 'utf8'));
const bundledSmokeFixture = JSON.parse(fs.readFileSync(bundledSmokeFixturePath, 'utf8'));
assertNoPrivateSmokeSeedValues(smokeFixture);
assertNoPrivateSmokeSeedValues(bundledSmokeFixture, 'bundledFixture');
assert.deepStrictEqual(
  bundledSmokeFixture,
  smokeFixture,
  'Bundled dev smoke seed should stay byte-for-byte equivalent to the canonical privacy-checked fixture data.',
);

assert.strictEqual(smokeFixture._meta?.export_version, '1.0.0', 'Smoke seed should use the current local export version.');
assert.strictEqual(smokeFixture._meta?.profile_id, 'post-closed-beta-smoke-local', 'Smoke seed should identify the repeatable profile.');
assert.strictEqual(smokeFixture._meta?.fixture_scope, 'dev_smoke_seed', 'Smoke seed should be explicitly dev-only fixture data.');

assert.ok(asArray(smokeFixture.vehicles).length >= 1, 'Smoke seed should include Fleet vehicle state.');
assert.ok(asArray(smokeFixture.routes).some((route) => route.is_active && asArray(route.segments).length > 0), 'Smoke seed should include an active Navigate route.');
assert.ok(asArray(smokeFixture.loadouts).length >= 1, 'Smoke seed should include readiness loadout state.');
assert.ok(asArray(smokeFixture.loadout_items).some((item) => item.is_critical), 'Smoke seed should include critical readiness items.');
assert.ok(asArray(smokeFixture.expedition_log).some((entry) => String(entry.surface || '').includes('dispatch')), 'Smoke seed should include Dispatch/offline smoke context.');
assert.ok(smokeFixture.setup_state?.setup_complete, 'Smoke seed should restore setup completion.');
assert.ok(smokeFixture.setup_state?.onboarding_complete, 'Smoke seed should restore onboarding completion.');
assert.ok(asArray(smokeFixture.vehicles).every((vehicle) => vehicle.owner_user_id === 'local'), 'Smoke seed vehicles should remain local-only.');
assert.ok(asArray(smokeFixture.trips).every((trip) => trip.user_id === 'local'), 'Smoke seed trips should remain local-only.');
assert.ok(asArray(smokeFixture.loadouts).every((loadout) => loadout.owner_user_id === 'local'), 'Smoke seed loadouts should remain local-only.');

const counts = expectedItemCounts(smokeFixture);
assert.deepStrictEqual(smokeFixture._meta.item_counts, counts, 'Smoke seed metadata counts should match the exported data.');
assert.strictEqual(
  smokeFixture._meta.total_items,
  Object.values(counts).reduce((sum, count) => sum + count, 0),
  'Smoke seed total_items should match item_counts.',
);

console.log('local data import/export checks passed.');
