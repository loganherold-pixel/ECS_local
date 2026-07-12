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

function readStyleBlock(source, styleName) {
  return source.match(new RegExp(`${styleName}: \\{[\\s\\S]*?\\n  \\},`))?.[0] ?? '';
}

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
  widgetRenderersSource.includes('terrainRiskPreviewCompactViewport') &&
    widgetRenderersSource.includes('route && !expanded ? attitudeCommandS.terrainRiskPreviewCompactViewport : null'),
  'Compact active Terrain Risk must use a dedicated bounded viewport.',
);

const routePanelContentStyle = readStyleBlock(widgetRenderersSource, 'routePanelContent');
const terrainRiskPreviewStyle = readStyleBlock(widgetRenderersSource, 'terrainRiskPreview');
const expandedPreviewStyle = readStyleBlock(widgetRenderersSource, 'terrainRiskPreviewExpanded');
const compactViewportStyle = readStyleBlock(widgetRenderersSource, 'terrainRiskPreviewCompactViewport');
const activeChartFrameStyle = readStyleBlock(widgetRenderersSource, 'terrainRiskChartFrameActive');
assert(
  routePanelContentStyle.includes("overflow: 'hidden'") &&
    terrainRiskPreviewStyle.includes("overflow: 'hidden'") &&
    expandedPreviewStyle.includes("backgroundColor: '#020507'") &&
    activeChartFrameStyle.includes("overflow: 'hidden'") &&
    compactViewportStyle.includes('left: 0') &&
    compactViewportStyle.includes('right: 0') &&
    compactViewportStyle.includes('top: 0') &&
    compactViewportStyle.includes('bottom: 0') &&
    compactViewportStyle.includes("overflow: 'hidden'") &&
    !widgetRenderersSource.includes('terrainRiskPreviewActiveRestored') &&
    !compactViewportStyle.includes('-22') &&
    !compactViewportStyle.includes('-2'),
  'Compact Terrain Risk must clip the graph at the panel, preview, and chart-frame boundaries without negative offsets.',
);

assert(
  widgetRenderersSource.includes('resolveAttitudeCommandTerrainExpansionGeometry') &&
    widgetRenderersSource.includes("activePanel?.panel === 'route'") &&
    widgetRenderersSource.includes('return { aspectRatio: 1.32, insetHorizontal: 4, insetVertical: 5 };'),
  'Expanded Terrain Risk must use the larger field-readable expansion geometry.',
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
    sideProfileSource.includes("preserveAspectRatio={interactive ? 'none' : 'xMidYMid meet'}") &&
    sideProfileSource.includes('selectedReferenceEvent?: TerrainRiskReferenceEvent | null') &&
    sideProfileSource.includes('formatReferenceMarkerAccessibilityLabel') &&
    sideProfileSource.includes('hitSlop={TERRAIN_REFERENCE_MARKER_HIT_SLOP}') &&
    sideProfileSource.includes('terrainRiskReferenceMarker') &&
    sideProfileSource.includes('buildTerrainRiskReferenceEventForPoint'),
  'Expanded Terrain Risk side-profile chart must keep every reference dot tappable and explainable without rendering a duplicate in-chart callout.',
);

const referenceButtonStyle = readStyleBlock(sideProfileSource, 'terrainRiskReferenceButton');
assert(
  referenceButtonStyle.includes('width: 40') &&
    referenceButtonStyle.includes('height: 40') &&
    referenceButtonStyle.includes('marginLeft: -20') &&
    referenceButtonStyle.includes('marginTop: -20'),
  'Expanded Terrain Risk reference locations must expose larger centered touch targets.',
);
assert(
  sideProfileSource.includes('const TERRAIN_REFERENCE_MARKER_HALF_SIZE = 20;') &&
    sideProfileSource.includes('chartLayout.width - TERRAIN_REFERENCE_MARKER_HALF_SIZE') &&
    sideProfileSource.includes('chartLayout.height - TERRAIN_REFERENCE_MARKER_HALF_SIZE'),
  'Expanded Terrain Risk reference targets must remain fully inside the bounded chart viewport.',
);

assert(
  widgetRenderersSource.includes("pointerEvents={markersInteractive ? 'box-none' : 'none'}") &&
    widgetRenderersSource.includes('interactive={markersInteractive}') &&
    widgetRenderersSource.includes('markerReferenceEvents') &&
    widgetRenderersSource.includes('includePassed: true'),
  'Expanded Terrain Risk preview must allow chart dot presses while restored panels remain passive.',
);

console.log('Terrain Risk compact clipping and expanded sizing checks passed.');
