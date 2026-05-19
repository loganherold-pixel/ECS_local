const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const fleetScreen = read('app/(tabs)/fleet.tsx');
const buildLoadoutModal = read('components/fleet/FleetBuildLoadoutModal.tsx');
const cgVisualization = read('components/weight-dashboard/CGVisualization.tsx');
const weightDashboardPanel = read('components/weight-dashboard/WeightDashboardPanel.tsx');
const vehicleProfileModal = read('components/fleet/FleetVehicleProfileModal.tsx');
const vehicleProfileDomain = read('lib/fleet/fleetVehicleProfile.ts');
const buildLoadoutDomain = read('lib/fleet/fleetBuildLoadout.ts');

const addVehicleButtonLabels = fleetScreen.match(/label="Add Vehicle"/g) ?? [];
assert(
  addVehicleButtonLabels.length === 1,
  `Expected one visible Fleet Add Vehicle button owned by VCC, found ${addVehicleButtonLabels.length}.`,
);

assert(
  fleetScreen.includes('overlayClass="info"') &&
    fleetScreen.includes('minHeightFraction={0.88}') &&
    fleetScreen.includes('maxHeightFraction={0.94}') &&
    fleetScreen.includes('hideVehicleProfile'),
  'Weight Summary should use the centered full-height ECS modal configuration.',
);

assert(
  fleetScreen.includes('numberOfLines={2}\n                adjustsFontSizeToFit') &&
    fleetScreen.includes('minimumFontScale={0.82}'),
  'Active vehicle card title should allow long names to fit without one-line truncation.',
);

assert(
  fleetScreen.includes('numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.84}'),
  'Active vehicle descriptor should handle long make/model/trim text.',
);

assert(
  !buildLoadoutModal.includes('FLEET_LOADOUT_PRESETS.map') &&
    !buildLoadoutModal.includes('styles.presetRow') &&
    !buildLoadoutModal.includes('styles.presetChip') &&
    !buildLoadoutModal.includes('Show ${preset.label} compartment load context'),
  'Build/loadout preset category chips should be removed from the compartment loadout UI.',
);

assert(
  buildLoadoutModal.includes('flexWrap: \'wrap\'') &&
    buildLoadoutModal.includes('numberOfLines={2}>{compartment.name}</Text>') &&
    buildLoadoutModal.includes('numberOfLines={2}>{item.name}') &&
    !buildLoadoutModal.includes('{install ? `${install.confidence}% confidence` : catalog.mountZone}') &&
    !buildLoadoutModal.includes('compartmentPickerMeta'),
  'Build/loadout compartment editing should wrap readable names and items.',
);

assert(
  vehicleProfileModal.includes('requiredMark') &&
    vehicleProfileModal.includes('label="Nickname"') &&
    vehicleProfileModal.includes('label="Year"') &&
    vehicleProfileModal.includes('label="Make"') &&
    vehicleProfileModal.includes('label="Model"') &&
    vehicleProfileDomain.includes("errors.push('Year is required.')"),
  'Fleet profile setup should visibly mark hard-required fields before spec confirmation.',
);

assert(
  buildLoadoutDomain.includes("id: 'cab_rack'") &&
    buildLoadoutDomain.includes('affectsPayload: false') &&
    buildLoadoutDomain.includes("scoringEffects: ['front_axle', 'top_heavy', 'aero']") &&
    buildLoadoutDomain.includes('affectsPayload: install.affectsPayload !== false'),
  'Build/loadout payload math should allow fit-reference hardware without reducing payload remaining.',
);

assert(
  !cgVisualization.includes('Attitude_Truck_Silhouette') &&
    !cgVisualization.includes('import { Image') &&
    cgVisualization.includes('TopDownVehicleFallbackProfile') &&
    cgVisualization.includes('vehicleProfileSilhouette') &&
    cgVisualization.includes('showVehicleProfile = true') &&
    weightDashboardPanel.includes('showVehicleProfile={!hideVehicleProfile}'),
  'COG visualization should use the ECS drawn top-down vehicle profile instead of a generic image asset.',
);

console.log('[fleet-ui-polish] Fleet UI polish checks passed');
