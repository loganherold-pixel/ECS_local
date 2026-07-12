const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs
  .readFileSync(path.join(__dirname, '..', 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function includes(needle, message) {
  assert.ok(source.includes(needle), message);
}

const vehicleRenderBlock = source.match(/case 'vehicle':[\s\S]*?case 'route':/)?.[0] ?? '';
const vehicleDetailBlock = source.match(/function VehicleCommandExpandedView\([\s\S]*?\n}\n\nfunction VehicleCommandRollZeroButton/)?.[0] ?? '';
const vehicleZeroButtonBlock = source.match(/function VehicleCommandRollZeroButton\([\s\S]*?\n}\n\nfunction VehicleCommandCompactMetric/)?.[0] ?? '';
const compactZeroButtonBlock = source.match(/vehicleRollZeroButtonCompact:\s*\{[\s\S]*?\n\s*\},/)?.[0] ?? '';
const vehicleGlyphLayerBlock = source.match(/vehicleGlyphLayer:\s*\{[\s\S]*?\n\s*\},/)?.[0] ?? '';
const panelVisualBlock = source.match(/function AttitudeCommandPanelVisual\([\s\S]*?\n}\n\nfunction HwyCellCoverageWidget/)?.[0] ?? '';

assert.ok(
  source.includes('const usesTextureBleedPanel = isSunlightPanel || isWeatherPanel || isVehiclePanel || isRoutePanel || isPowerPanel;') &&
    source.includes('const shouldRenderPanelVisual = expanded && (isSunlightPanel || isWeatherPanel || isVehiclePanel || isPowerPanel);') &&
    !source.includes('const showDecorativeBackdrop ='),
  'Vehicle profile should join the expanded semantic background gate while compact cards stay transparent.',
);
assert.ok(
  !panelVisualBlock.includes("if (icon === 'car-sport-outline')") &&
    panelVisualBlock.includes('vehicle,') &&
    panelVisualBlock.includes('<AttitudeCommandVehicleProfileBackgroundVisual vehicle={vehicle} />') &&
    source.includes('targetKey = vehicle?.imageKey ?? \'generic_suv\'') &&
    source.includes('testID={`attitude-command-vehicle-background-${currentKey}`}') &&
    vehicleGlyphLayerBlock.includes("backgroundColor: '#020507'") &&
    vehicleGlyphLayerBlock.includes('opacity: 1'),
  'Expanded vehicle panel must mount the typed active Fleet vehicle profile artwork as its background layer.',
);

assert.ok(
  vehicleRenderBlock.includes('<VehicleCommandRollZeroButton') &&
    vehicleZeroButtonBlock.includes('ZERO') &&
    !vehicleZeroButtonBlock.includes('0°') &&
    compactZeroButtonBlock.includes('right: 0') &&
    compactZeroButtonBlock.includes("bottom: '47%'") &&
    compactZeroButtonBlock.includes('minWidth: 38') &&
    compactZeroButtonBlock.includes('height: 18') &&
    !compactZeroButtonBlock.includes('top:') &&
    !compactZeroButtonBlock.includes('left:'),
  'Compact vehicle panel must show a bounded ZERO pill above the right-side LEVEL readout.',
);

assert.ok(
  source.includes('resolveAttitudeCommandVehicleExpansionGeometry') &&
    source.includes("activePanel?.panel === 'vehicle'") &&
    source.includes('imageKey: getVehicleProfileImageKeyFromAttitudeKey(attitudeVehicleId)'),
  'Expanded vehicle panel must use the larger geometry and the same active Fleet vehicle resolver as the attitude stage.',
);

assert.ok(
  vehicleRenderBlock.includes('style={attitudeCommandS.vehicleCommandTelemetryStrip}') &&
    vehicleRenderBlock.includes('VehicleCommandCompactMetric') &&
    vehicleRenderBlock.includes("label=\"TEMP\"") &&
    vehicleRenderBlock.includes("label=\"VOLT\"") &&
    vehicleRenderBlock.includes("label=\"FUEL\"") &&
    vehicleRenderBlock.includes("label=\"LOAD\""),
  'Compact vehicle OBD2 telemetry must render as bounded top-row metrics instead of overlapping corner text.',
);

assert.ok(
  vehicleRenderBlock.includes('style={attitudeCommandS.vehicleCommandRollDock}') &&
    vehicleRenderBlock.includes('docked') &&
    vehicleRenderBlock.includes('<VehicleProfileRollAttitudeStrip') &&
    source.includes('vehicleCommandRollDock: {') &&
    source.includes('bottom: 0') &&
    source.includes("height: '38%'"),
  'Compact vehicle roll monitor must be docked into the bottom third of the widget.',
);

assert.ok(
  !vehicleRenderBlock.includes('vehicleCommandCornerLayer') &&
    !vehicleRenderBlock.includes('vehicleCommandRangeCorner') &&
    !vehicleRenderBlock.includes('vehicleCommandLoadCorner'),
  'Compact vehicle telemetry should not use absolute corner overlays that can collide with the roll monitor.',
);

for (const field of [
  'RPM',
  'Miles per hour',
  'Engine load',
  'Coolant temperature',
  'Battery voltage',
  'Water / fluid',
  'Propane / butane',
  'Fuel gallons',
]) {
  assert.ok(vehicleDetailBlock.includes(field), `Expanded vehicle telemetry must expose ${field}.`);
}

assert.ok(
  vehicleDetailBlock.includes('const vehicleProfile = resolveAttitudeVehicleProfile(activeVehicleContext);') &&
    vehicleDetailBlock.includes('{vehicleProfile.vehicleName}') &&
    vehicleDetailBlock.includes('{vehicleProfile.identity}'),
  'Expanded vehicle telemetry header must identify the active Fleet vehicle.',
);

console.log('Dashboard vehicle compact/expanded widget contract passed.');
