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

const setupRoute = read('app', 'setup.tsx');
const vehicleConfigRoute = read('app', '(tabs)', 'vehicle-config.tsx');
const tabLayout = read('app', '(tabs)', '_layout.tsx');

includes(
  setupRoute,
  'function DeprecatedVehicleSetupRedirect()',
  '/setup should be isolated as a redirect, not the retired 4-step framework.',
);
includes(
  setupRoute,
  "router.replace('/fleet'",
  '/setup should redirect to the current Fleet tab.',
);
includes(
  setupRoute,
  'stageNavigationFlow({',
  '/setup should preserve stale Fleet add/edit intent for the current Fleet modal.',
);
notIncludes(
  setupRoute,
  'AccessoryConfigStep',
  '/setup must not import the retired accessories step.',
);
notIncludes(
  setupRoute,
  'LoadoutWizardStep',
  '/setup must not import the retired loadout step.',
);
notIncludes(
  setupRoute,
  'SETUP_STEPS',
  '/setup must not render the retired setup stepper.',
);
notIncludes(
  setupRoute,
  'renderLoadout',
  '/setup must not render the retired loadout view.',
);

includes(
  vehicleConfigRoute,
  'function DeprecatedVehicleConfigRedirect()',
  'vehicle-config should be isolated as a redirect, not the retired vehicle wizard.',
);
includes(
  vehicleConfigRoute,
  "router.replace('/fleet'",
  'vehicle-config should redirect to the current Fleet tab.',
);
includes(
  vehicleConfigRoute,
  "intent: vehicleId ? 'fleet_edit_vehicle' : 'fleet_add_vehicle'",
  'vehicle-config should preserve vehicleId deep links as current Vehicle Profile intent.',
);
includes(
  vehicleConfigRoute,
  "label: vehicleId ? 'Edit Vehicle' : 'Add Vehicle'",
  'vehicle-config should label add redirects for the current Add Vehicle Profile intent.',
);
includes(
  vehicleConfigRoute,
  'context: vehicleId ? { vehicleId } : null',
  'vehicle-config add redirects should not create a fake vehicle context.',
);
notIncludes(
  vehicleConfigRoute,
  'VehicleSpecsSection',
  'vehicle-config must not import the retired vehicle specs wizard UI.',
);
notIncludes(
  vehicleConfigRoute,
  'AccessoryConfigStep',
  'vehicle-config must not import the retired accessory wizard UI.',
);
notIncludes(
  vehicleConfigRoute,
  'LoadoutWizardStep',
  'vehicle-config must not import the retired loadout wizard UI.',
);

includes(
  tabLayout,
  'name="vehicle-config"',
  'vehicle-config may remain registered only as a hidden backward-compatible redirect route.',
);
includes(
  tabLayout,
  'href: null',
  'legacy vehicle-config route should remain hidden from normal tab navigation.',
);

console.log('Legacy vehicle framework isolation checks passed.');
