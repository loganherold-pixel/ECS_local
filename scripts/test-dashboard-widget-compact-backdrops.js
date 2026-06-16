const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs
  .readFileSync(path.join(__dirname, '..', 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(needle, message) {
  assert.ok(source.includes(needle), message);
}

assertIncludes(
  'const showDecorativeBackdrop = expanded && (isSunlightPanel || isWeatherPanel || isVehiclePanel);',
  'Sunlight, weather, and vehicle image backdrops must only render in expanded mode.',
);

assertIncludes(
  'const showRouteTerrainBackdrop = expanded && isRoutePanel;',
  'Route Terrain Risk image backdrop must only render in expanded mode.',
);

assertIncludes(
  'const showPowerDetailBackdrop = expanded && isPowerPanel && Boolean(powerVisual);',
  'Power Monitor image backdrop must only render in expanded mode.',
);

assertIncludes(
  'const shouldRenderPanelVisual = showDecorativeBackdrop || showRouteTerrainBackdrop || showPowerDetailBackdrop;',
  'Compact sunlight/weather/vehicle/terrain/power panels must not render photo/image visual layers.',
);

assertIncludes(
  'const usesTransparentCompactSurface = !expanded && (isSunlightPanel || isWeatherPanel || isVehiclePanel || isRoutePanel || isPowerPanel);',
  'Compact sunlight/weather/vehicle/terrain/power panels must use the shared transparent command surface.',
);

assertIncludes(
  'background={shouldRenderPanelVisual ? (',
  'Attitude Command panels should gate their background visual through shouldRenderPanelVisual.',
);

assertIncludes(
  'usesTransparentCompactSurface && attitudeCommandS.compactCommandPanelSurface',
  'Compact command widget cards must apply the shared transparent compact surface.',
);

assertIncludes(
  'usesTransparentCompactSurface && attitudeCommandS.compactCommandPanelFrameContent',
  'Compact command widget cards must apply compact-only content padding for readability.',
);

assertIncludes(
  'usesTransparentCompactSurface && attitudeCommandS.commandPanelHeaderTitleCompact',
  'Compact command widget headers must use compact-only readable text styling.',
);

assertIncludes(
  "backgroundColor: 'transparent',",
  'Compact command widget surface should let the dashboard/map texture bleed through.',
);

assertIncludes(
  "borderColor: 'transparent',",
  'Compact command widget surface should remove the yellow overlay border.',
);

assertIncludes(
  "color: 'rgba(255, 246, 220, 0.94)'",
  'Compact command widget support text should be bright enough over the amber transparent surface.',
);

assertIncludes(
  'glare: daylight.glare,',
  'Sunlight compact visual data should include glare status for field readability.',
);

assertIncludes(
  "{sunlightVisual?.uvIndex ?? 'UV --'}",
  'Sunlight compact mode should surface UV status without relying on an image backdrop.',
);

assertIncludes(
  "{sunlightVisual?.phase ?? 'Sun position unknown'}",
  'Sunlight compact mode should surface the current sun phase.',
);

assertIncludes(
  "{sunlightVisual?.glare ?? 'Glare unknown'}",
  'Sunlight compact mode should surface glare risk in the compact readout.',
);

console.log('Dashboard compact backdrop contract passed.');
