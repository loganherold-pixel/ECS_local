const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const contractsPath = path.join(root, 'lib', 'routeDataContracts.ts');
const liveCatalogPath = path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const mvumClientPath = path.join(root, 'lib', 'routeGeometryViewportClient.ts');
const catalogClientPath = path.join(root, 'lib', 'routeCatalogViewportClient.ts');
const discoverPath = path.join(root, 'app', '(tabs)', 'discover.tsx');
const packagePath = path.join(root, 'package.json');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

assert(fs.existsSync(contractsPath), 'Shared route data contract module should exist.');

const {
  isRouteCatalogSummary,
  isRouteDetail,
  isMvumSegmentSummary,
  isMvumSelectedSegment,
  isStitchedRouteDraft,
  normalizeRouteCatalogSummary,
  normalizeRouteDetail,
  normalizeMvumSegmentSummary,
  normalizeMvumSelectedSegment,
  normalizeStitchedRouteDraft,
} = require(contractsPath);

const summary = normalizeRouteCatalogSummary({
  routeId: 'route-1',
  title: 'Rubicon Trail',
  region: 'Sierra Nevada',
  forestName: 'Eldorado National Forest',
  distanceMeters: 36000,
  estimatedDurationSeconds: 14400,
  difficulty: 'technical',
  popularityScore: 87,
  communityRating: 4.7,
  sourceType: 'official',
  bbox: { minLng: -120.4, minLat: 38.8, maxLng: -120.1, maxLat: 39.0 },
  trailheadCoordinate: { latitude: 38.91, longitude: -120.24 },
  thumbnailUrl: null,
  thumbnailAssetKey: 'rubicon',
  updatedAt: '2026-06-01T00:00:00.000Z',
  tags: ['mvum', '4x4'],
});

assert(summary, 'RouteCatalogSummary should normalize valid catalog summary records.');
assert.strictEqual(summary.routeId, 'route-1');
assert.strictEqual(summary.sourceType, 'official');
assert.strictEqual(summary.distanceMeters, 36000);
assert(isRouteCatalogSummary(summary), 'RouteCatalogSummary validator should accept normalized summaries.');
assert.strictEqual(
  isRouteCatalogSummary({ ...summary, geometry: { type: 'LineString', coordinates: [] } }),
  false,
  'RouteCatalogSummary must reject embedded geometry.',
);

const detail = normalizeRouteDetail({
  routeId: 'route-1',
  summary,
  geometry: {
    type: 'LineString',
    coordinates: [
      [-120.24, 38.91],
      [-120.2, 38.94],
    ],
  },
  steps: [{ instruction: 'Continue on trail', distanceMeters: 1200 }],
  warnings: ['Verify seasonal gates.'],
  sourceMetadata: { providerId: 'usfs_mvum' },
});
assert(detail, 'RouteDetail should normalize full route detail records.');
assert(isRouteDetail(detail), 'RouteDetail validator should accept detail with full geometry.');
assert.strictEqual(detail.summary.routeId, summary.routeId, 'RouteDetail should embed its lightweight summary.');

const mvumSummary = normalizeMvumSegmentSummary({
  segmentId: 'seg-1',
  forestId: 'eldorado',
  routeNumber: '12N34',
  trailName: null,
  allowedUse: ['highway_legal_4x4'],
  difficulty: 'moderate',
  bbox: { minLng: -120.24, minLat: 38.91, maxLng: -120.2, maxLat: 38.94 },
  sourceLayer: 'Motor_Vehicle_Use_Map_Roads',
  updatedAt: '2026-06-01T00:00:00.000Z',
});
assert(mvumSummary, 'MvumSegmentSummary should normalize valid MVUM segment summaries.');
assert(isMvumSegmentSummary(mvumSummary), 'MvumSegmentSummary validator should accept normalized summaries.');
assert.strictEqual(
  isMvumSegmentSummary({ ...mvumSummary, coordinates: [[-120.24, 38.91], [-120.2, 38.94]] }),
  false,
  'MvumSegmentSummary must reject full coordinates.',
);

const selection = normalizeMvumSelectedSegment({
  segmentId: 'seg-1',
  selectedAt: '2026-06-29T12:00:00.000Z',
  selectionOrder: 1,
  sourceLayer: 'Motor_Vehicle_Use_Map_Roads',
  tileFeatureId: 'roads-123',
});
assert(selection, 'MvumSelectedSegment should normalize selection metadata.');
assert(isMvumSelectedSegment(selection), 'MvumSelectedSegment validator should accept normalized selections.');

const draft = normalizeStitchedRouteDraft({
  draftId: 'draft-1',
  selectedSegmentIds: ['seg-1'],
  orderedSegmentIds: ['seg-1'],
  geometry: {
    type: 'LineString',
    coordinates: [
      [-120.24, 38.91],
      [-120.2, 38.94],
    ],
  },
  distanceMeters: 4200,
  estimatedDurationSeconds: 1800,
  warnings: ['Planning geometry only.'],
  unresolvedGaps: [],
  geometry_source_state: 'canonical',
  createdAt: '2026-06-29T12:00:00.000Z',
  updatedAt: '2026-06-29T12:05:00.000Z',
});
assert(draft, 'StitchedRouteDraft should normalize route-builder draft geometry.');
assert(isStitchedRouteDraft(draft), 'StitchedRouteDraft validator should accept normalized drafts.');
assert.strictEqual(
  draft.geometrySourceState,
  'canonical',
  'Stitched route hydration should retain its canonical-versus-limited geometry source state.',
);

const liveCatalogSource = fs.readFileSync(liveCatalogPath, 'utf8');
assert(
  liveCatalogSource.includes('includeGeometry: false') &&
    liveCatalogSource.includes('const includePreviewGeometry = criteria.includePreviewGeometry === true;') &&
    liveCatalogSource.includes('includePreviewGeometry,'),
  'Explore catalog summary search must keep full/preview geometry disabled unless explicitly requested.',
);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
const mvumClientSource = fs.readFileSync(mvumClientPath, 'utf8');
const catalogClientSource = fs.readFileSync(catalogClientPath, 'utf8');
const discoverSource = fs.readFileSync(discoverPath, 'utf8');
assert(
  !navigateSource.includes('liveTrailPackCatalogStore'),
  'Navigate must not import or subscribe to the Explore route catalog store.',
);
assert(
  navigateSource.includes('fetchRouteGeometryViewportSegments'),
  'Navigate MVUM overlay should use the MVUM route geometry segment runtime path.',
);
assert(
  mvumClientSource.includes("functions.invoke('route-geometry-segments'") &&
    !mvumClientSource.includes("functions.invoke('route-catalog-search'"),
  'Navigate MVUM must retain its dedicated segment provider client.',
);
assert(
  navigateSource.includes('fetchRouteCatalogViewportFeatures') &&
    navigateSource.includes('buildRouteCatalogViewportQuery') &&
    navigateSource.includes('routeCatalogViewportFeaturesToRouteGeometrySegments') &&
    catalogClientSource.includes("functions.invoke('route-catalog-search'") &&
    !navigateSource.includes('RouteCatalogViewportCache'),
  'Navigate ECS Route Geometry should use whole catalog records through the existing map-layer coordinator, not a second cache owner.',
);
assert(
  discoverSource.includes('RouteCatalogSummary') && discoverSource.includes('RouteDetail'),
  'Explore should import the RouteCatalogSummary/RouteDetail runtime contracts.',
);

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
assert.strictEqual(
  packageJson.scripts['test:route-data-contracts'],
  'node ./scripts/test-route-data-contracts.js',
  'package.json should expose the route data contract regression test.',
);

console.log('Route data contract checks passed.');
