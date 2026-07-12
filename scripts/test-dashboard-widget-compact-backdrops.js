const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs
  .readFileSync(path.join(__dirname, '..', 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const navigateSurfaceSource = fs
  .readFileSync(path.join(__dirname, '..', 'components', 'dashboard', 'NavigateSurfaceWidget.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(needle, message) {
  assert.ok(source.includes(needle), message);
}

function assertNotIncludes(needle, message) {
  assert.ok(!source.includes(needle), message);
}

function extractStyleBlock(sourceText, styleName) {
  return sourceText.match(new RegExp(`${styleName}: \\{[\\s\\S]*?\\n  \\},`))?.[0] ?? '';
}

assertIncludes(
  'const usesTextureBleedPanel = isSunlightPanel || isWeatherPanel || isVehiclePanel || isRoutePanel || isPowerPanel;',
  'Sunlight, weather, vehicle, terrain, and power panels must share the full texture-bleed surface contract.',
);

assertIncludes(
  'const shouldRenderPanelVisual = expanded && (isSunlightPanel || isWeatherPanel || isVehiclePanel || isPowerPanel);',
  'Expanded sunlight, weather, vehicle, and Power panels may mount semantic background imagery while compact panels remain transparent.',
);

assertNotIncludes(
  'const showDecorativeBackdrop =',
  'Sunlight, weather, and vehicle panels must not use the obsolete decorative backdrop flag.',
);

assertNotIncludes(
  'const showRouteTerrainBackdrop =',
  'Route Terrain Risk must no longer enable an expanded image backdrop.',
);

assertNotIncludes(
  'const showPowerDetailBackdrop =',
  'Power Monitor expanded artwork should use the shared panel visual gate instead of a one-off backdrop flag.',
);

assertIncludes(
  'const usesTransparentCompactSurface = !expanded && usesTextureBleedPanel;',
  'Compact sunlight/weather/vehicle/terrain/power panels must use the shared transparent command surface.',
);

assertIncludes(
  'background={shouldRenderPanelVisual ? (',
  'Attitude Command panels should gate their background visual through shouldRenderPanelVisual.',
);

assertIncludes(
  'usesTextureBleedPanel && attitudeCommandS.textureBleedCommandPanelSurface',
  'Command widget cards must apply the shared transparent texture-bleed surface in compact and expanded states.',
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
  "{ label: 'UV', value: sunlightUv },",
  'Sunlight compact mode should surface UV status in the equal-width timing strip.',
);

assertIncludes(
  'style={attitudeCommandS.sunlightCompactMetaValue}',
  'Sunlight compact status values should receive a full-width, auto-fitting text treatment.',
);

assertIncludes(
  '{sunlightPhase}',
  'Sunlight compact mode should surface the current sun phase.',
);

assertIncludes(
  '{sunlightGlare}',
  'Sunlight compact mode should surface glare risk in the compact readout.',
);

assertIncludes(
  "if (/unavailable/i.test(normalized)) return 'UNAVAILABLE';",
  'Unavailable sunlight data should remain explicit instead of appearing blank.',
);

assertIncludes(
  "return 'UNKNOWN';",
  'Unknown sunlight data should remain explicit instead of collapsing to dash placeholders.',
);

assertIncludes(
  "if (/unavailable|unknown/i.test(normalized)) return 'STATUS';",
  'The compact no-data row should use a concise status label instead of repeating the Sunlight title.',
);

const sunlightCompactReadoutBlock = extractStyleBlock(source, 'sunlightCompactReadout');
const sunlightCompactMetaRowBlock = extractStyleBlock(source, 'sunlightCompactMetaRow');
const sunlightCompactTimingCellBlock = extractStyleBlock(source, 'sunlightCompactTimingCell');
assert.ok(
  sunlightCompactReadoutBlock.includes('minWidth: 0') &&
    sunlightCompactReadoutBlock.includes("justifyContent: 'space-between'"),
  'Compact sunlight content must stay bounded and distribute its rows within the tile.',
);
assert.ok(
  sunlightCompactMetaRowBlock.includes("flexDirection: 'row'") &&
    sunlightCompactMetaRowBlock.includes('minWidth: 0'),
  'Compact sunlight phase and glare must use bounded full-width rows.',
);
assert.ok(
  sunlightCompactTimingCellBlock.includes('flex: 1') &&
    sunlightCompactTimingCellBlock.includes('minWidth: 0'),
  'Compact sunlight rise, set, and UV cells must divide the available width evenly.',
);

const textureBleedSurfaceBlock = extractStyleBlock(source, 'textureBleedCommandPanelSurface');
assert.ok(
  textureBleedSurfaceBlock.includes("backgroundColor: 'transparent'") &&
    textureBleedSurfaceBlock.includes("borderColor: 'transparent'") &&
    textureBleedSurfaceBlock.includes("shadowColor: 'transparent'") &&
    textureBleedSurfaceBlock.includes('elevation: 0'),
  'Texture-bleed command surface must be fully transparent and remove panel shadow fill.',
);

const shellFrameBlock = extractStyleBlock(source, 'shellFrame');
assert.ok(
  shellFrameBlock.includes("backgroundColor: 'transparent'") &&
    shellFrameBlock.includes("borderColor: 'transparent'") &&
    shellFrameBlock.includes("shadowColor: 'transparent'") &&
    shellFrameBlock.includes('elevation: 0'),
  'Attitude Command shell frame must let the dashboard body texture bleed through.',
);

const navigationStageBlock = extractStyleBlock(source, 'attitudeStageNavigationCommandMode');
assert.ok(
  navigationStageBlock.includes("backgroundColor: 'transparent'") &&
    navigationStageBlock.includes("borderColor: 'transparent'"),
  'Navigation Command stage container must be transparent behind the status surface.',
);

const commandMapSurfaceBlock = extractStyleBlock(navigateSurfaceSource, 'commandContainer');
assert.ok(
  commandMapSurfaceBlock.includes("backgroundColor: 'transparent'"),
  'Navigation Command container must not add an opaque background.',
);

assertIncludes(
  "selectedCommandCenterMode !== 'threeDNavigation' ? (",
  'The Navigation Command must not render the center subtitle/title over the command surface.',
);

console.log('Dashboard compact backdrop contract passed.');
