const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const inventoryPath = path.join(root, 'scripts', 'route-catalog-geometry-inventory.js');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

assert(fs.existsSync(inventoryPath), 'Route catalog geometry inventory script should exist.');
assert(
  packageJson.includes('"route-catalog:geometry:dry-run": "node ./scripts/route-catalog-geometry-inventory.js --dry-run --json"') &&
    packageJson.includes('"route-catalog:geometry:geojson:dry-run": "node ./scripts/route-catalog-geometry-inventory.js --dry-run --geojson"') &&
    packageJson.includes('"route-catalog:geometry:inventory": "node ./scripts/route-catalog-geometry-inventory.js"') &&
    packageJson.includes('"test:route-catalog-geometry-inventory": "node ./scripts/test-route-catalog-geometry-inventory.js"'),
  'package.json should expose route catalog geometry inventory commands and contract test.',
);

const inventory = require(inventoryPath);

[
  'buildDryRunRouteCatalogGeometryResponse',
  'buildGeometryInventoryGeoJson',
  'buildGeometryInventoryFromRouteCatalogResponse',
  'buildRouteCatalogSearchBody',
  'flattenRouteGeometryToLegs',
  'formatGeometryInventoryMarkdown',
  'parseArgs',
].forEach((exportName) => {
  assert.strictEqual(typeof inventory[exportName], 'function', `Geometry inventory should export ${exportName}.`);
});

const parsed = inventory.parseArgs([
  '--dry-run',
  '--json',
  '--geojson',
  '--latitude',
  '38.5',
  '--longitude',
  '-109.5',
  '--radius',
  '75',
  '--limit',
  '250',
  '--max-gap-meters',
  '350',
  '--source-adapter',
  'usfs_mvum',
]);
assert.strictEqual(parsed.dryRun, true);
assert.strictEqual(parsed.json, true);
assert.strictEqual(parsed.geojson, true);
assert.strictEqual(parsed.latitude, 38.5);
assert.strictEqual(parsed.longitude, -109.5);
assert.strictEqual(parsed.radiusMiles, 75);
assert.strictEqual(parsed.limit, 250);
assert.strictEqual(parsed.maxGapMeters, 350);
assert.strictEqual(parsed.sourceAdapter, 'usfs_mvum');

const body = inventory.buildRouteCatalogSearchBody(parsed);
assert.deepStrictEqual(
  {
    latitude: body.latitude,
    longitude: body.longitude,
    radiusMiles: body.radiusMiles,
    limit: body.limit,
    includePreviewGeometry: body.includePreviewGeometry,
    includeAssessment: body.includeAssessment,
    recommendationOnly: body.recommendationOnly,
    sourceAdapter: body.sourceAdapter,
  },
  {
    latitude: 38.5,
    longitude: -109.5,
    radiusMiles: 75,
    limit: 250,
    includePreviewGeometry: true,
    includeAssessment: true,
    recommendationOnly: true,
    sourceAdapter: 'usfs_mvum',
  },
);

const lineLegs = inventory.flattenRouteGeometryToLegs({
  type: 'LineString',
  coordinates: [
    [-109.5, 38.5],
    [-109.51, 38.51],
    [-109.52, 38.52],
  ],
});
assert.strictEqual(lineLegs.length, 1, 'LineString geometry should produce one leg.');
assert.strictEqual(lineLegs[0].pointCount, 3);

const multiLegs = inventory.flattenRouteGeometryToLegs({
  type: 'MultiLineString',
  coordinates: [
    [
      [-109.5, 38.5],
      [-109.51, 38.51],
    ],
    [
      [-109.5105, 38.5105],
      [-109.53, 38.53],
    ],
  ],
});
assert.strictEqual(multiLegs.length, 2, 'MultiLineString geometry should preserve each source leg.');

const dryRun = inventory.buildGeometryInventoryFromRouteCatalogResponse(
  inventory.buildDryRunRouteCatalogGeometryResponse(),
  {
    maxGapMeters: 350,
  },
);

assert.deepStrictEqual(
  {
    routeCount: dryRun.summary.routeCount,
    routesWithGeometry: dryRun.summary.routesWithGeometry,
    missingGeometryRoutes: dryRun.summary.missingGeometryRoutes,
    legCount: dryRun.summary.legCount,
    segmentCount: dryRun.summary.segmentCount,
  },
  {
    routeCount: 3,
    routesWithGeometry: 2,
    missingGeometryRoutes: 1,
    legCount: 3,
    segmentCount: 4,
  },
);
assert.strictEqual(dryRun.routes[0].legs.length, 1, 'First fixture route should expose one leg.');
assert.strictEqual(dryRun.routes[1].legs.length, 2, 'Second fixture route should expose two legs.');
assert.strictEqual(dryRun.segments.length, 4, 'Inventory should expose a flattened point-to-point segment list.');
assert(
  dryRun.segments.every((segment) =>
    segment.routeId &&
    segment.legId &&
    segment.segmentId &&
    Number.isFinite(segment.distanceMeters) &&
    segment.start &&
    segment.end,
  ),
  'Each segment should carry route/leg identity, endpoints, and distance.',
);
assert(
  dryRun.stitchCandidates.some((candidate) =>
    candidate.from.routeId !== candidate.to.routeId &&
    candidate.distanceMeters <= 350,
  ),
  'Inventory should identify nearby endpoints between different routes as stitch candidates.',
);
assert(
  dryRun.routes.some((route) => route.geometryStatus === 'missing_geometry'),
  'Inventory should preserve missing-geometry routes for auditability.',
);

const markdown = inventory.formatGeometryInventoryMarkdown(dryRun);
[
  'Route Catalog Geometry Inventory',
  '## Routes',
  '## Legs',
  '## Segments',
  '## Stitch Candidates',
  '## Missing Geometry',
  'fixture-route-a:leg-1:segment-1',
].forEach((required) => {
  assert(markdown.includes(required), `Markdown inventory output should include ${required}.`);
});

const geoJson = inventory.buildGeometryInventoryGeoJson(dryRun);
assert.strictEqual(geoJson.type, 'FeatureCollection');
assert.strictEqual(geoJson.properties.summary.segmentCount, 4);
assert(
  geoJson.features.some((feature) => feature.properties.kind === 'route' && feature.geometry.type === 'LineString'),
  'GeoJSON output should include route features with line geometry.',
);
assert(
  geoJson.features.some((feature) => feature.properties.kind === 'leg' && feature.properties.legId === 'fixture-route-b:leg-2'),
  'GeoJSON output should include leg features.',
);
assert(
  geoJson.features.filter((feature) => feature.properties.kind === 'segment').length === 4,
  'GeoJSON output should include each point-to-point segment as a feature.',
);
assert(
  geoJson.features.some((feature) =>
    feature.properties.kind === 'stitch_candidate' &&
    feature.geometry.type === 'LineString' &&
    feature.geometry.coordinates.length === 2,
  ),
  'GeoJSON output should include stitch candidate connector features.',
);
assert(
  geoJson.features.some((feature) => feature.properties.kind === 'missing_geometry' && feature.geometry === null),
  'GeoJSON output should preserve missing-geometry records as null-geometry audit features.',
);

const cliOutput = execFileSync(
  process.execPath,
  [inventoryPath, '--dry-run', '--json', '--max-gap-meters', '350'],
  { cwd: root, encoding: 'utf8' },
);
const parsedCliOutput = JSON.parse(cliOutput);
assert.strictEqual(parsedCliOutput.mode, 'dry-run');
assert.strictEqual(parsedCliOutput.inventory.summary.segmentCount, 4);
assert(parsedCliOutput.inventory.stitchCandidates.length > 0, 'Dry-run CLI should include stitch candidates.');

const geoJsonCliOutput = execFileSync(
  process.execPath,
  [inventoryPath, '--dry-run', '--geojson', '--max-gap-meters', '350'],
  { cwd: root, encoding: 'utf8' },
);
const parsedGeoJsonCliOutput = JSON.parse(geoJsonCliOutput);
assert.strictEqual(parsedGeoJsonCliOutput.type, 'FeatureCollection');
assert(
  parsedGeoJsonCliOutput.features.some((feature) => feature.properties.kind === 'segment'),
  'Dry-run GeoJSON CLI should emit segment features.',
);

console.log('Route catalog geometry inventory checks passed.');
