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

assert(
  widgetRenderersSource.includes('<AttitudeCommandTerrainRiskPreview terrainRisk={terrainRiskVisual} expanded={expanded} />'),
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
  sideProfileSource.includes('left: 8,') &&
    sideProfileSource.includes('right: 0,') &&
    sideProfileSource.includes('top: 0,') &&
    sideProfileSource.includes('bottom: 18,'),
  'Terrain Risk side-profile chart frame must push the mountain line nearly to both horizontal edges while preserving the bottom axis lane.',
);

assert(
  sideProfileSource.includes('interactive = false') &&
    sideProfileSource.includes('selectedReferencePoint') &&
    sideProfileSource.includes('stopPropagation?.()') &&
    sideProfileSource.includes('terrainRiskReferenceMarker') &&
    sideProfileSource.includes('Why this point was referenced'),
  'Expanded Terrain Risk side-profile chart must keep reference dots interactive without collapsing the expanded widget.',
);

assert(
  widgetRenderersSource.includes("pointerEvents={expanded ? 'box-none' : 'none'}") &&
    widgetRenderersSource.includes('interactive={expanded}'),
  'Expanded Terrain Risk preview must allow chart dot presses while restored panels remain passive.',
);

console.log('Terrain Risk restored chart sizing checks passed.');
