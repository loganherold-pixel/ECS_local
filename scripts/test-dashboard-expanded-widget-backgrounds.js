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

includes(
  'const shouldRenderPanelVisual = expanded && (isSunlightPanel || isWeatherPanel);',
  'Expanded sunlight/current-weather panels should mount semantic background imagery on mobile.',
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
  'Expanded widget background fix must not reintroduce Fleet vehicle imagery.',
);
notIncludes(
  '<AttitudeCommandVehicleProfileBackgroundVisual vehicle={vehicle} />',
  'Expanded widget background fix must keep vehicle artwork disabled.',
);
assert.ok(
  /if \(sunlight\) \{\s*return <AttitudeCommandSunlightBackgroundVisual sunlight=\{sunlight\} \/>;\s*\}/.test(panelVisualBlock) &&
    /if \(weather\) \{\s*return <AttitudeCommandWeatherBackgroundVisual weather=\{weather\} \/>;\s*\}/.test(panelVisualBlock),
  'Panel visual dispatcher should prefer sunlight/weather semantic imagery and avoid decorative fallbacks.',
);

console.log('Dashboard expanded widget background contract passed.');
