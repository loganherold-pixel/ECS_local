const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
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
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  buildTripBuilderRouteFromSavedRouteAsset,
} = require(path.join(root, 'lib', 'savedRouteTripBuilderRoute.ts'));

const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const savedRouteAssetsSource = fs.readFileSync(path.join(root, 'lib', 'savedRouteAssets.ts'), 'utf8');
const tripBuilderSource = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');

assert.ok(
  !navigateSource.includes('handleOpenSavedRouteAsset'),
  'Saved Routes should remove the duplicate Open action handler once Plan replaces it.',
);
assert.ok(
  !navigateSource.includes('>OPEN</Text>'),
  'Saved Routes should not render the duplicate OPEN action next to NAV.',
);
assert.ok(
  navigateSource.includes('handlePlanSavedRouteAsset'),
  'Saved Routes should expose a Plan action for route-specific Trip Setup handoff.',
);
assert.ok(
  navigateSource.includes('setup: \'1\''),
  'Saved Routes Plan should deep-link directly into Trip Setup.',
);
assert.ok(
  navigateSource.includes('saveTripBuilderRouteHandoff(tripBuilderRoute'),
  'Saved Routes Plan should persist a Trip Builder route handoff before routing.',
);
assert.ok(
  navigateSource.includes('>PLAN</Text>'),
  'Saved Routes should replace OPEN with a PLAN button.',
);
assert.ok(
  navigateSource.includes('>NAV</Text>'),
  'Saved Routes should retain a dedicated NAV action for staging guidance.',
);
assert.ok(
  savedRouteAssetsSource.includes('canPlan: boolean'),
  'Saved route capabilities should model Trip Setup planning separately from Open/Nav.',
);
assert.ok(
  tripBuilderSource.includes("const shouldAutoOpenTripSetup = Boolean(requestedRouteId && params.setup === '1');"),
  'Trip Builder should keep supporting direct Trip Setup auto-open handoffs.',
);

const asset = {
  id: 'route:rubicon-gpx',
  kind: 'imported',
  title: 'Rubicon Trail GPX',
  subtitle: 'Imported GPX route',
  sourceLabel: 'GPX IMPORT',
  badgeLabel: 'GPX',
  distanceMiles: 22.4,
  pointCount: 4,
  segmentCount: 2,
  updatedAt: '2026-06-15T12:00:00.000Z',
  routeId: 'rubicon-gpx',
  runId: null,
  favoriteId: null,
  sourceTrailId: null,
  planId: null,
  navigationPayload: null,
  removeLabel: 'Delete',
  duplicateCount: 1,
  duplicateIndex: 1,
  capabilities: {
    canPlan: true,
    canNavigate: true,
    canStitch: true,
    canRename: true,
    canRemove: true,
  },
};

const route = {
  id: 'rubicon-gpx',
  user_id: null,
  device_id: 'device',
  name: 'Rubicon Trail',
  description: 'Imported Rubicon GPX',
  source_format: 'gpx',
  source_app: 'ecs_import',
  route_category: 'imported',
  linked_run_id: null,
  external_source_id: 'rubicon-file',
  external_source_type: 'gpx',
  total_distance_miles: 22.4,
  elevation_gain_ft: 1800,
  waypoint_count: 0,
  segment_count: 2,
  waypoints: [],
  segments: [
    {
      points: [
        { lat: 39.009, lon: -120.311, ele: null },
        { lat: 39.015, lon: -120.305, ele: null },
      ],
    },
    {
      points: [
        { lat: 39.016, lon: -120.304, ele: null },
        { lat: 39.02, lon: -120.298, ele: null },
      ],
    },
  ],
  is_active: false,
  sync_status: 'local',
  created_at: '2026-06-15T12:00:00.000Z',
  updated_at: '2026-06-15T12:00:00.000Z',
};

const tripBuilderRoute = buildTripBuilderRouteFromSavedRouteAsset(asset, { route });

assert.ok(tripBuilderRoute, 'A GPX saved route asset with geometry should build a Trip Builder route.');
assert.strictEqual(tripBuilderRoute.id, route.id, 'Trip Builder route should use the stable imported route id.');
assert.strictEqual(tripBuilderRoute.name, route.name);
assert.strictEqual(tripBuilderRoute.source, 'gpx');
assert.strictEqual(tripBuilderRoute.distanceMiles, 22.4);
assert.strictEqual(tripBuilderRoute.total_distance_miles, 22.4);
assert.deepStrictEqual(
  tripBuilderRoute.coordinate,
  { latitude: 39.009, longitude: -120.311 },
  'Trip Builder route should preserve the route start coordinate.',
);
assert.deepStrictEqual(
  tripBuilderRoute.endCoordinate,
  { latitude: 39.02, longitude: -120.298 },
  'Trip Builder route should preserve the route end coordinate.',
);
assert.strictEqual(
  tripBuilderRoute.routeGeometry.type,
  'MultiLineString',
  'Imported route segments should become a MultiLineString for Trip Builder.',
);
assert.deepStrictEqual(
  tripBuilderRoute.routeGeometry.coordinates,
  [
    [
      [-120.311, 39.009],
      [-120.305, 39.015],
    ],
    [
      [-120.304, 39.016],
      [-120.298, 39.02],
    ],
  ],
);
assert.strictEqual(tripBuilderRoute.routeGeometryStatus, 'trail_available');
assert.strictEqual(tripBuilderRoute.trailGeometry.length, 4);
assert.strictEqual(tripBuilderRoute.routeMetadata.sourceAssetId, asset.id);
assert.strictEqual(tripBuilderRoute.routeMetadata.sourceLabel, 'GPX IMPORT');
assert.strictEqual(tripBuilderRoute.routeMetadata.planningSource, 'saved_routes');

const noGeometry = buildTripBuilderRouteFromSavedRouteAsset(
  {
    ...asset,
    id: 'route:no-geometry',
    routeId: 'no-geometry',
    capabilities: { ...asset.capabilities, canPlan: false },
  },
  {
    route: {
      ...route,
      id: 'no-geometry',
      segments: [],
      segment_count: 0,
      total_distance_miles: 0,
    },
  },
);

assert.strictEqual(noGeometry, null, 'Routes without geometry should not create a Trip Builder planning handoff.');

console.log('Saved Routes Trip Setup planning regression passed.');
