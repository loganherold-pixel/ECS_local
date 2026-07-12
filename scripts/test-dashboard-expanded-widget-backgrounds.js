const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs
  .readFileSync(path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function includes(needle, message) {
  assert.ok(source.includes(needle), message);
}

function notIncludes(needle, message) {
  assert.ok(!source.includes(needle), message);
}

for (const fileName of [
  'After_sunset.png',
  'Approaching_sunset.png',
  'Civil_twilight.png',
  'Dark.png',
  'Daylight.png',
  'Low_light.png',
  'Solar_noon.png',
  'Sunrise.png',
  'Total_daylight.png',
]) {
  assert.ok(
    fs.existsSync(path.join(root, 'assets', 'sunlight', fileName)),
    `Sunlight background asset ${fileName} must be bundled for expanded mobile panels.`,
  );
  includes(fileName, `Sunlight background asset ${fileName} must be statically required.`);
}

assert.ok(
  fs.existsSync(path.join(root, 'assets', 'power', 'Power_Management_Background.png')),
  'Power Management background asset must remain bundled for the expanded Power Monitor.',
);
includes(
  'Power_Management_Background.png',
  'Power Management background asset must be statically required.',
);

includes(
  'const shouldRenderPanelVisual = expanded && (isSunlightPanel || isWeatherPanel || isVehiclePanel || isPowerPanel);',
  'Expanded sunlight, current-weather, vehicle, and Power panels should mount semantic background imagery on mobile.',
);
includes(
  'const usesTransparentCompactSurface = !expanded && usesTextureBleedPanel;',
  'Compact texture-bleed command panels should remain transparent.',
);
includes(
  'background={shouldRenderPanelVisual ? (',
  'Panel visual rendering must stay behind an explicit gate.',
);
includes(
  '<AttitudeCommandSunlightBackgroundVisual sunlight={sunlight} />',
  'Sunlight expanded panel should render the time-of-day/sunlight background layer.',
);
includes(
  '<AttitudeCommandWeatherBackgroundVisual weather={weather} />',
  'Weather expanded panel should render its semantic condition background layer.',
);

const panelVisualBlock =
  source.match(/function AttitudeCommandPanelVisual\([\s\S]*?\n}\n\nfunction HwyCellCoverageWidget/)?.[0] ?? '';
notIncludes(
  "if (icon === 'car-sport-outline')",
  'Expanded vehicle imagery should dispatch from typed vehicle data instead of an icon-name fallback.',
);
includes(
  '<AttitudeCommandVehicleProfileBackgroundVisual vehicle={vehicle} />',
  'Expanded vehicle panel should render the active Fleet vehicle profile artwork.',
);
includes(
  '<AttitudeCommandPowerManagementVisual power={power} />',
  'Expanded Power Monitor should render the existing Power Management artwork.',
);
assert.ok(
  /if \(sunlight\) \{\s*return <AttitudeCommandSunlightBackgroundVisual sunlight=\{sunlight\} \/>;\s*\}/.test(panelVisualBlock) &&
    /if \(weather\) \{\s*return <AttitudeCommandWeatherBackgroundVisual weather=\{weather\} \/>;\s*\}/.test(panelVisualBlock) &&
    /if \(vehicle\) \{\s*return <AttitudeCommandVehicleProfileBackgroundVisual vehicle=\{vehicle\} \/>;\s*\}/.test(panelVisualBlock) &&
    /if \(power\) \{\s*return <AttitudeCommandPowerManagementVisual power=\{power\} \/>;\s*\}/.test(panelVisualBlock),
  'Panel visual dispatcher should render typed sunlight, weather, active-vehicle, and Power imagery.',
);

includes(
  'testID={`attitude-command-vehicle-background-${currentKey}`}',
  'Expanded vehicle background should expose its resolved active-vehicle image key for UI verification.',
);

console.log('Dashboard expanded widget background contract passed.');
