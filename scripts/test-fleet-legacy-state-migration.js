const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

const migration = read('lib', 'fleet', 'legacyVehicleFrameworkStateMigration.ts');
const layout = read('app', '_layout.tsx');
const setupStore = read('lib', 'setupStore.ts');

includes(
  migration,
  "export async function sanitizeLegacyVehicleFrameworkState()",
  'Fleet legacy state migration should expose a startup sanitizer.',
);
includes(
  migration,
  "const MIGRATION_KEY = 'ecs_legacy_vehicle_framework_cleanup_v1';",
  'Fleet legacy state migration should be versioned.',
);
includes(
  migration,
  "setupStore.clearLegacyVehicleFrameworkState({",
  'Migration should clear retired setup/current-step state through setupStore.',
);
includes(
  migration,
  'clearCompletion: !hasVehicles || (!!setupVehicleId && !setupVehicleExists)',
  'Migration should clear old setup completion when there are no vehicles.',
);
includes(
  migration,
  'vehicleSetupStore.clearActiveVehicleId();',
  'Migration should clear only invalid active vehicle ids.',
);
includes(
  migration,
  'wizardDraftStore.clear();',
  'Migration should clear stale vehicle wizard drafts.',
);
includes(
  migration,
  "shellRouteCache.set(SHELL_ROUTE_KEY, '/fleet');",
  'Migration should replace legacy shell routes with Fleet.',
);
includes(
  migration,
  "normalized === '/setup' || normalized === '/vehicle-config'",
  'Migration should recognize retired setup and vehicle-config routes.',
);
notIncludes(
  migration,
  'vehicleStore.delete',
  'Migration must not delete real vehicle records.',
);
notIncludes(
  migration,
  'loadoutStore',
  'Migration must not mutate loadout/build data.',
);
notIncludes(
  migration,
  'shellRouteCache.clear',
  'Migration must not globally clear shell route cache.',
);
notIncludes(
  migration,
  'setupStateCache.clear',
  'Migration must not globally clear setup cache.',
);
includes(
  migration,
  "setupStateCache.get(MIGRATION_KEY) !== 'true'",
  'Migration marker should be idempotent after the first cleanup run.',
);

includes(
  setupStore,
  'clearLegacyVehicleFrameworkState',
  'setupStore should expose a targeted legacy framework cleanup method.',
);
includes(
  setupStore,
  'remove(SETUP_CURRENT_STEP_KEY);',
  'setupStore cleanup should remove old setup current step.',
);
includes(
  setupStore,
  'remove(SETUP_RESOURCE_PROFILE_KEY);',
  'setupStore cleanup should remove old resource/mechanical setup state.',
);
notIncludes(
  setupStore,
  'vehicleStore.delete',
  'setupStore cleanup must not delete vehicles.',
);

includes(
  layout,
  "import { sanitizeLegacyVehicleFrameworkState } from '../lib/fleet/legacyVehicleFrameworkStateMigration';",
  'Auth layout should import the legacy Fleet state migration.',
);
includes(
  layout,
  ']).then(() => sanitizeLegacyVehicleFrameworkState()),',
  'Auth layout should run the migration before startup route hydration completes.',
);
includes(
  layout,
  'STARTUP_ROUTE_READINESS_TIMEOUT_MS',
  'Auth layout should keep route hydration readiness timeout wrapped around the migration.',
);

console.log('Fleet legacy vehicle framework state migration checks passed.');
