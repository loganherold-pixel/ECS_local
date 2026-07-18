const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fleet = fs.readFileSync(path.join(root, 'app', '(tabs)', 'fleet.tsx'), 'utf8').replace(/\r\n/g, '\n');
const vehicleStatusModal = fs.readFileSync(
  path.join(root, 'components', 'fleet', 'FleetVehicleStatusModal.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

function assertNotIncludes(fragment, message) {
  assert.ok(!fleet.includes(fragment), message);
}

for (const removedOverviewNoise of [
  'label="Active Vehicles"',
  'label="Avg Confidence"',
  'label="Average Confidence"',
  'label="Operating Weight"',
  'label="Verify"',
  'function FleetQaStateStrip',
  'ANDROID QA STATE',
  'qaStatePanel',
  'qaStateHeader',
  'qaStateEyebrow',
  'qaStateBadges',
  'qaStateCopy',
]) {
  assertNotIncludes(
    removedOverviewNoise,
    `Fleet should not render or style the removed overview/QA noise: ${removedOverviewNoise}`,
  );
}

assert.ok(
  fleet.includes('function FleetOverviewHeader') &&
    fleet.includes('label="Add Vehicle"') &&
    fleet.includes('VEHICLE COMMAND CENTER'),
  'Fleet should keep the Vehicle Command Center header and Add Vehicle action.',
);

assert.ok(
  fleet.includes('FleetVehicleStatusModal') &&
    fleet.includes('kind="confidence"') &&
    vehicleStatusModal.includes("scoreEyebrow: 'VEHICLE CONFIDENCE'"),
  'Vehicle-specific confidence details should remain available from vehicle cards.',
);

console.log('Fleet housekeeping checks passed.');
