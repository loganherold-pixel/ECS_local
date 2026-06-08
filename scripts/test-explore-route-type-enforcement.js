const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
global.__DEV__ = false;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
    };
  }
  if (request.endsWith('/supabase') || request === './supabase') {
    return { supabase: null };
  }
  return originalLoad(request, parent, isMain);
};

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

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const {
  classifyExploreRouteAuthority,
  getExploreRouteAuthorityCopy,
} = require(path.join(root, 'lib', 'exploreRouteAuthority.ts'));
const {
  loadOpportunitiesWithCompatibility,
  normalizeExploreOpportunityRoute,
} = require(path.join(root, 'lib', 'discoverEngine.ts'));

const lineString = {
  type: 'LineString',
  coordinates: [
    [-120.1, 39.1],
    [-120.2, 39.2],
  ],
};

const trailheadOnly = normalizeExploreOpportunityRoute({
  id: 'trailhead-only-test',
  name: 'Trailhead Only Test',
  region: 'Test Range',
  regionGroup: 'great-basin',
  distanceMiles: 12,
  terrainType: 'Trailhead access',
  remotenessScore: 4,
  estimatedFuelRequired: 2,
  suggestedCamps: 0,
  description: 'Fixture.',
  highlights: [],
  elevationGainFt: 0,
  estimatedDays: 1,
  bestSeason: 'Verify locally',
  permitRequired: false,
  imageTag: 'test',
  startLat: 39.1,
  startLng: -120.1,
});
assert.strictEqual(trailheadOnly.routeMetadata.routeTypeStatus, 'trailhead_guidance');
assert.strictEqual(trailheadOnly.routeMetadata.hasTrueTrailGeometry, false);
assert.match(
  String(trailheadOnly.routeMetadata.routeAuthorityNotice),
  /trailhead/i,
  'Trailhead-only routes should be labeled as trailhead guidance.',
);

const demo = normalizeExploreOpportunityRoute({
  ...trailheadOnly,
  id: 'demo-fixture-test',
  routeGeometry: lineString,
  routeMetadata: {
    geometrySource: 'ecs_demo_full_route_fixture',
    routeScope: 'full_trail_route',
  },
});
assert.strictEqual(demo.routeMetadata.routeTypeStatus, 'demo_fixture');
assert.strictEqual(demo.routeMetadata.geometrySource, 'ecs_demo_full_route_fixture');
assert.strictEqual(demo.routeMetadata.hasTrueTrailGeometry, false);
assert.match(String(demo.routeMetadata.routeAuthorityNotice), /demo/i);

const preview = normalizeExploreOpportunityRoute({
  ...trailheadOnly,
  id: 'preview-geometry-test',
  routeGeometry: lineString,
  routeMetadata: {
    previewMetadataStatus: 'geometry',
    source: 'discover_preview',
  },
});
assert.strictEqual(preview.routeMetadata.routeTypeStatus, 'preview_geometry');
assert.strictEqual(preview.routeMetadata.hasTrueTrailGeometry, false);
assert.strictEqual(classifyExploreRouteAuthority(preview).status, 'preview_geometry');

const imported = normalizeExploreOpportunityRoute({
  ...trailheadOnly,
  id: 'imported-geometry-test',
  routeGeometry: lineString,
  routeMetadata: {
    source: 'trip_builder_import',
    sourceFileType: 'gpx',
    isTrailGeometry: true,
  },
});
assert.strictEqual(imported.routeMetadata.routeTypeStatus, 'imported_geometry');
assert.strictEqual(imported.routeMetadata.source, 'trip_builder_import');
assert.strictEqual(imported.routeMetadata.hasTrueTrailGeometry, true);
assert.strictEqual(classifyExploreRouteAuthority(imported).canUseForTrailItinerary, true);

const liveVerified = normalizeExploreOpportunityRoute({
  ...trailheadOnly,
  id: 'live-verified-test',
  routeGeometry: lineString,
  routeMetadata: {
    source: 'trail_pack',
    trailPackDataState: 'live',
    reviewStatus: 'approved',
    catalogVerification: {
      publicRecommendation: true,
      sourceLabel: 'Verified catalog',
    },
  },
});
assert.strictEqual(liveVerified.routeMetadata.routeTypeStatus, 'live_verified_geometry');
assert.strictEqual(liveVerified.routeMetadata.hasTrueTrailGeometry, true);
assert.match(getExploreRouteAuthorityCopy(liveVerified).notice, /source-backed/i);

const defaultLocationResult = loadOpportunitiesWithCompatibility(null);
assert.ok(defaultLocationResult.opportunities.length > 0, 'Explore default catalog should still load.');
assert.strictEqual(
  defaultLocationResult.opportunities[0].routeMetadata.distanceFromUserSource,
  'default_location',
  'Default-distance loading should not be labeled as live GPS.',
);
assert.match(
  String(defaultLocationResult.opportunities[0].routeMetadata.distanceFromUserLabel),
  /default/i,
);

const tripBuilderSource = read('app/explore-trip-builder.tsx');
assert.ok(
  tripBuilderSource.includes('classifyExploreRouteAuthority') &&
    tripBuilderSource.includes('routeAuthority.status') &&
    tripBuilderSource.includes('routeAuthority.label'),
  'Trip Builder should consume the shared Explore route authority model.',
);
assert.ok(
  tripBuilderSource.includes('routeAuthority.canUseForTrailItinerary') &&
    !tripBuilderSource.includes("tripBuilderTrailGeometrySource: 'selected_route_preview'"),
  'Trip Builder should gate trail itinerary promotion on canonical route authority.',
);

const previewModalSource = read('components/discover/ExploreRoutePreviewModal.tsx');
assert.ok(
  previewModalSource.includes('NAVIGATE TO TRAILHEAD') &&
    previewModalSource.includes('routeAuthority.notice'),
  'Route preview modal should expose trailhead-only and authority copy without overstating route geometry.',
);

console.log('Explore route type enforcement checks passed.');
