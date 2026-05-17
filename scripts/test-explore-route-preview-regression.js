/* global __dirname */

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const originalLoad = Module._load;
Module._load = function loadWithExplorePreviewStubs(request, parent, isMain) {
  if (parent?.filename?.endsWith(path.join('lib', 'exploreRoutePreview.ts'))) {
    if (request === './mapConfig') {
      return {
        computeBounds(points) {
          if (!Array.isArray(points) || points.length === 0) return null;
          const lats = points.map((point) => point.lat);
          const lngs = points.map((point) => point.lng);
          return {
            minLat: Math.min(...lats),
            maxLat: Math.max(...lats),
            minLng: Math.min(...lngs),
            maxLng: Math.max(...lngs),
          };
        },
      };
    }

    if (request === './navigationHandoffStore') {
      return {
        buildExploreNavigationPayload(opportunity) {
          return opportunity;
        },
        getRoadDestinationCoordinate(payload) {
          return payload.roadDestinationCoordinate ?? null;
        },
      };
    }
  }

  return originalLoad.apply(this, arguments);
};

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const expeditionModalSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExpeditionAnalysisModal.tsx'),
  'utf8',
);
const previewModalSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExploreRoutePreviewModal.tsx'),
  'utf8',
);
const shellSource = fs.readFileSync(path.join(root, 'components', 'ECSModalShell.tsx'), 'utf8');
const thumbnails = require(path.join(root, 'lib', 'exploreTrailThumbnails.ts'));
const {
  normalizeNavigationHandoffPreview,
  normalizeExploreRoutePreview,
} = require(path.join(root, 'lib', 'exploreRoutePreview.ts'));

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`const ${functionName} = useCallback(`);
  assert.ok(start >= 0, `Missing callback ${functionName}`);
  const end = source.indexOf('\n  }, []);', start);
  assert.ok(end > start, `Missing end for callback ${functionName}`);
  return source.slice(start, end);
}

function makePayload(overrides = {}) {
  return {
    id: 'preview-test-route',
    title: 'Preview Test Route',
    subtitle: 'Regression Region',
    coordinate: null,
    trailheadCoordinate: null,
    roadDestinationCoordinate: null,
    trailGeometry: [],
    trailWaypoints: [],
    routeMetadata: null,
    ...overrides,
  };
}

assert.ok(
  discoverSource.includes('>EXPLORE CATEGORY</Text>') ||
    discoverSource.includes('EXPLORE CATEGORY'),
  'Selecting an Explore category should render the corrected Explore Category title.',
);
assert.ok(
  !discoverSource.includes('Explorer Category') &&
    !expeditionModalSource.includes('Explorer Category') &&
    !previewModalSource.includes('Explorer Category'),
  'No user-facing Explore popup title should still say Explorer Category.',
);

const closeIndex = expeditionModalSource.indexOf('<Text style={s.footerSecondaryText}>CLOSE</Text>');
const routePreviewIndex = expeditionModalSource.indexOf("ROUTE{'\\n'}PREVIEW");
const buildRouteIndex = expeditionModalSource.indexOf("BUILD{'\\n'}ROUTE");
assert.ok(closeIndex >= 0, 'Expedition Analysis fixed footer should include Close.');
assert.strictEqual(routePreviewIndex, -1, 'Route Preview should not appear in Expedition Analysis.');
assert.ok(buildRouteIndex > closeIndex, 'Build Route should appear after Close.');
assert.ok(
  expeditionModalSource.includes('onPress={onClose}') &&
    discoverSource.includes('onClose={handleCloseAnalysis}'),
  'Existing Expedition Analysis Close behavior should remain wired to the analysis close handler.',
);
assert.ok(
  expeditionModalSource.includes('onBuildRoute();') &&
    discoverSource.includes('onBuildRoute={selectedOpportunity') &&
    discoverSource.includes('void handleNavigateToRoute(selectedOpportunity);'),
  'Existing Build Route behavior should remain wired to the Explore-to-Navigate handoff.',
);

assert.ok(
  !discoverSource.includes("import ExploreRoutePreviewModal") &&
    !discoverSource.includes('const [routePreviewVisible, setRoutePreviewVisible]') &&
    !discoverSource.includes('const [routePreviewOpportunity, setRoutePreviewOpportunity]') &&
    !discoverSource.includes('<ExploreRoutePreviewModal') &&
    !discoverSource.includes('handleCloseRoutePreview'),
  'Discover should not render or keep state for the obsolete Explore route preview popup.',
);
assert.ok(
  discoverSource.includes("flowLabel: 'Route Preview'") &&
    discoverSource.includes('Review the map overview, then start when ready.') &&
    discoverSource.includes('void handleNavigateToRoute(aiPreviewRoute, {') &&
    discoverSource.includes('void handleNavigateToRoute(trailPackToExpeditionOpportunity(trailPackPreview), {'),
  'Discover Route Preview actions should hand off to Navigate map preview rather than opening a popup.',
);
assert.ok(
  previewModalSource.includes('MapRenderer') &&
    previewModalSource.includes('Loading GPS/map preview...') &&
    previewModalSource.includes('Route geometry unavailable') &&
    previewModalSource.includes('Map rendering unavailable') &&
    previewModalSource.includes('GPS is unavailable') &&
    previewModalSource.includes('markerLegend') &&
    previewModalSource.includes('Current GPS') &&
    previewModalSource.includes('Endpoint'),
  'Route Preview popup should include map, loading, and clear error/unavailable states.',
);
assert.ok(
  previewModalSource.includes('function TouchablePreviewAction') &&
    previewModalSource.includes('return React.createElement(') &&
    previewModalSource.includes('React.createElement(Text, { style: labelStyle }, actionLabel)') &&
    previewModalSource.includes('accessibilityLabel: actionLabel'),
  'If the legacy modal is reused later, TouchablePreviewAction should remain Text-safe.',
);

const missingImageAssignment = thumbnails.getExploreRouteThumbnail({
  id: 'route-with-missing-image-regression',
  name: 'Route With Missing Image',
  region: 'Tahoe, California',
  regionGroup: 'sierra-nevada',
  imageTag: undefined,
  terrainType: undefined,
});
assert.ok(
  missingImageAssignment?.uri,
  'Route with missing image should not crash or render blank; it should receive a fallback thumbnail.',
);

const missingGeometryModel = normalizeNavigationHandoffPreview(
  makePayload({
    trailheadCoordinate: { lat: 39.1, lng: -120.2 },
    coordinate: { lat: 39.1, lng: -120.2 },
    routeMetadata: {
      routePreviewUnavailableReason: 'Route preview unavailable for this route until endpoint metadata is added.',
    },
  }),
  { lat: 39.0, lng: -120.0 },
);
assert.strictEqual(missingGeometryModel.hasRouteData, false, 'Single-point routes should be marked preview-unavailable.');
assert.ok(
  /Route preview unavailable/.test(missingGeometryModel.previewUnavailableReason),
  'Missing geometry should return a clear preview-unavailable reason instead of crashing.',
);
assert.ok(missingGeometryModel.cameraCommand, 'Missing geometry with one point can still produce a safe camera command.');

const endpointModel = normalizeNavigationHandoffPreview(
  makePayload({
    trailheadCoordinate: { lat: 39.1, lng: -120.2 },
    coordinate: { lat: 39.4, lng: -120.6 },
  }),
  { lat: 39.0, lng: -120.0 },
);
assert.strictEqual(endpointModel.hasRouteData, true, 'Distinct start and endpoint should render a preview.');
assert.strictEqual(endpointModel.routePoints.length, 2, 'Endpoint fallback preview should include start and end.');
assert.ok(endpointModel.cameraCommand?.fitBounds, 'Endpoint preview should fit map bounds.');

const geometryModel = normalizeNavigationHandoffPreview(
  makePayload({
    trailGeometry: [
      { lat: 38.9, lng: -119.9 },
      { lat: 39.0, lng: -120.1 },
      { lat: 39.2, lng: -120.4 },
    ],
  }),
  { lat: 38.8, lng: -119.8 },
);
assert.strictEqual(geometryModel.hasRouteData, true, 'Valid route geometry should render preview data.');
assert.strictEqual(geometryModel.hasFullGeometry, true, 'Multi-point geometry should be recognized as full geometry.');
assert.ok(geometryModel.mapPoints.length >= 4, 'Map points should include current GPS plus route geometry.');
assert.ok(geometryModel.cameraCommand?.fitBounds, 'Valid geometry should render with fit-to-route bounds.');

const exploreOpportunityModel = normalizeExploreRoutePreview(
  makePayload({
    id: 'explore-normalize-opportunity',
    trailheadCoordinate: { lat: 37.1, lng: -118.2 },
    coordinate: { lat: 37.4, lng: -118.6 },
  }),
  null,
);
assert.strictEqual(
  exploreOpportunityModel.hasRouteData,
  true,
  'normalizeExploreRoutePreview should safely normalize route/trail records from every category.',
);

console.log('Explore route preview regression checks passed.');
