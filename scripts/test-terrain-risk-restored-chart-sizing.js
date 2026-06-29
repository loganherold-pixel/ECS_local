const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const widgetRenderersSource = fs.readFileSync(
  path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'),
  'utf8',
);
const sideProfileSource = fs.readFileSync(
  path.join(root, 'components', 'dashboard', 'TerrainRiskSideProfile.tsx'),
  'utf8',
);
const packageJson = require(path.join(root, 'package.json'));

assert.strictEqual(
  packageJson.scripts['test:terrain-risk-restored-chart-sizing'],
  'node ./scripts/test-terrain-risk-restored-chart-sizing.js',
  'package.json should expose the Terrain Risk restored chart sizing regression script.',
);

assert(
  /<AttitudeCommandTerrainRiskPreview[\s\S]*?terrainRisk=\{terrainRiskVisual\}[\s\S]*?expanded=\{expanded\}[\s\S]*?detailMode=\{mode === 'detail'\}/.test(widgetRenderersSource),
  'Route Terrain Risk panel must pass expanded state into the preview so restored sizing can differ from expanded sizing.',
);

assert(
  widgetRenderersSource.includes('terrainRiskPreviewActiveRestored') &&
    widgetRenderersSource.includes('left: -22,') &&
    widgetRenderersSource.includes('right: -22,') &&
    widgetRenderersSource.includes('top: -22,') &&
    widgetRenderersSource.includes('bottom: -2,'),
  'Restored Terrain Risk preview must widen nearly to the panel edges and grow upward while preserving bottom alignment.',
);

assert(
  sideProfileSource.includes('left: 24') &&
    sideProfileSource.includes('right: 16') &&
    sideProfileSource.includes('top: 8') &&
    sideProfileSource.includes('bottom: 24'),
  'Terrain Risk side-profile chart frame must reserve readable lanes for elevation and distance labels.',
);

assert(
  sideProfileSource.includes('interactive = false') &&
    sideProfileSource.includes('selectedReferenceEvent?: TerrainRiskReferenceEvent | null') &&
    sideProfileSource.includes('formatReferenceMarkerAccessibilityLabel') &&
    sideProfileSource.includes('hitSlop={TERRAIN_REFERENCE_MARKER_HIT_SLOP}') &&
    sideProfileSource.includes('terrainRiskReferenceMarker') &&
    sideProfileSource.includes('buildTerrainRiskReferenceEventForPoint'),
  'Expanded Terrain Risk side-profile chart must keep every reference dot tappable and explainable without rendering a duplicate in-chart callout.',
);

assert(
  widgetRenderersSource.includes("pointerEvents={markersInteractive ? 'box-none' : 'none'}") &&
    widgetRenderersSource.includes('interactive={markersInteractive}') &&
    widgetRenderersSource.includes('markerReferenceEvents') &&
    widgetRenderersSource.includes('includePassed: true'),
  'Expanded Terrain Risk preview must allow chart dot presses while restored panels remain passive.',
);

console.log('Terrain Risk restored chart sizing checks passed.');
