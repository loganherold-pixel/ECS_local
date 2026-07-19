const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('/discoverEngine') || request.endsWith('\\discoverEngine') || request === '../discoverEngine') {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const {
  classifyRouteCatalogTripType,
  queryRouteCatalogDiscoveryRecords,
} = require(path.join(root, 'lib', 'explore', 'routeCatalogDiscovery.ts'));
const {
  getDiscoverableTrailPacks,
  trailPackToExpeditionOpportunity,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

const userNearTahoe = { latitude: 38.92, longitude: -120.78 };
const nowIso = '2026-06-22T12:00:00.000Z';

function officialSource(label = 'USFS MVUM') {
  return {
    providerId: 'usfs_mvum',
    sourceType: 'official',
    label,
    authority: 'official_access',
    lastVerifiedAt: nowIso,
  };
}

function catalogRecord(overrides = {}) {
  return {
    id: 'route-a',
    public_id: 'route-a',
    name: 'Nearby Connector',
    route_type: 'point_to_point',
    center_latitude: userNearTahoe.latitude,
    center_longitude: userNearTahoe.longitude,
    distance_miles: 18,
    estimated_duration_minutes: 240,
    confidence_score: 88,
    tags: ['Tahoe National Forest', 'day trip'],
    route_intelligence: {
      tripType: 'day_trip',
    },
    route_geometry: {
      type: 'LineString',
      coordinates: [
        [-120.79, 38.91],
        [-120.7, 38.94],
      ],
    },
    updated_at: nowIso,
    created_at: nowIso,
    ...overrides,
  };
}

const obscureNearbyRoutes = Array.from({ length: 30 }, (_, index) =>
  catalogRecord({
    id: `nearby-connector-${index}`,
    public_id: `nearby-connector-${index}`,
    name: `Nearby Connector ${index}`,
    center_latitude: userNearTahoe.latitude + (index % 5) * 0.015,
    center_longitude: userNearTahoe.longitude + (index % 6) * 0.018,
    confidence_score: 96 - (index % 3),
    distance_miles: 10 + index,
    route_geometry: {
      type: 'LineString',
      coordinates: [
        [-120.8 + index * 0.001, 38.91],
        [-120.72 + index * 0.001, 38.95],
      ],
    },
  }),
);

const rubiconTrail = catalogRecord({
  id: 'rubicon-trail',
  public_id: 'rubicon-trail',
  name: 'Rubicon Trail',
  center_latitude: 40.92,
  center_longitude: -123.65,
  confidence_score: 90,
  distance_miles: 21,
  estimated_duration_minutes: 780,
  tags: ['Tahoe National Forest', 'Eldorado National Forest', 'featured', 'day trip'],
  route_intelligence: {
    tripType: 'day_trip',
    aliases: ['rubicon', 'rubicon trail'],
  },
  route_geometry: {
    type: 'LineString',
    coordinates: [
      [-120.315, 39.006],
      [-120.23, 39.02],
      [-120.12, 39.04],
    ],
  },
});

const trailheadOnly = catalogRecord({
  id: 'trailhead-only-inside-radius',
  public_id: 'trailhead-only-inside-radius',
  name: 'Trailhead Only Inside Radius',
  center_latitude: 41.2,
  center_longitude: -123.9,
  route_geometry: null,
  trailhead_latitude: 39.03,
  trailhead_longitude: -120.42,
});

const outside = catalogRecord({
  id: 'outside-radius',
  public_id: 'outside-radius',
  name: 'Outside Radius',
  center_latitude: 42.5,
  center_longitude: -124.5,
  route_geometry: {
    type: 'LineString',
    coordinates: [
      [-124.6, 42.4],
      [-124.4, 42.6],
    ],
  },
});

const result = queryRouteCatalogDiscoveryRecords(
  [...obscureNearbyRoutes, rubiconTrail, trailheadOnly, outside],
  {
    latitude: userNearTahoe.latitude,
    longitude: userNearTahoe.longitude,
    radiusMiles: 100,
    limit: 51,
    searchTerms: ['rubicon'],
    regionTags: ['tahoe national forest', 'eldorado national forest'],
  },
);

assert(result.radiusFilterApplied, 'Radius search should be explicitly applied.');
assert(result.matchedCount > result.records.length, 'The helper should track eligible matches beyond the visible page size.');
assert.strictEqual(result.records.length, 20, 'The helper should apply the total-search cap only after relevance sorting.');
assert.strictEqual(result.allMatchedRecords.length, 20, 'No application-facing result array may exceed the total-search cap.');
assert(
  result.records.some((record) => record.id === 'rubicon-trail'),
  'Featured nearby routes such as Rubicon should not be hidden behind lower-profile routes when a page limit is applied.',
);

const rubiconMatch = result.records.find((record) => record.id === 'rubicon-trail');
assert(rubiconMatch, 'Rubicon match should be present.');
assert(
  rubiconMatch.search_match_reasons.includes('geometry_within_radius'),
  'Rubicon should match by route geometry even when its catalog center is outside the radius.',
);
assert(
  rubiconMatch.search_match_reasons.includes('known_route_alias'),
  'Rubicon should carry an alias/featured match reason for diagnostics and sorting.',
);
assert(
  Number(rubiconMatch.geometry_distance_miles) <= 100 &&
    Number(rubiconMatch.center_distance_miles) > 100,
  'Discovery metadata should explain geometry-in-radius vs center-outside-radius behavior.',
);

const trailheadResult = queryRouteCatalogDiscoveryRecords([trailheadOnly], {
  latitude: userNearTahoe.latitude,
  longitude: userNearTahoe.longitude,
  radiusMiles: 100,
});
const trailheadMatch = trailheadResult.records.find((record) => record.id === 'trailhead-only-inside-radius');
assert(trailheadMatch, 'Trailhead-only records should still be eligible when the trailhead is inside radius.');
assert(
  trailheadMatch.search_match_reasons.includes('trailhead_within_radius'),
  'Trailhead-only records should explain the trailhead radius match.',
);
assert(
  queryRouteCatalogDiscoveryRecords([outside], {
    latitude: userNearTahoe.latitude,
    longitude: userNearTahoe.longitude,
    radiusMiles: 100,
  }).records.length === 0,
  'Routes with no geometry, trailhead, center, region, or alias match should be excluded.',
);

const tripClassification = classifyRouteCatalogTripType({
  name: 'Rubicon Trail',
  distance_miles: 21,
  estimated_duration_minutes: 840,
  route_intelligence: {
    tripType: 'day_trip',
  },
});
assert.strictEqual(
  tripClassification.tripType,
  'day_trip',
  'Explicit catalog Day Trip intent should win over generic duration heuristics.',
);
assert.strictEqual(tripClassification.estimatedDays, 1, 'Explicit Day Trip routes should remain one-day routes.');
assert(
  tripClassification.warnings.some((warning) => /computed/i.test(warning)),
  'Conflicting computed trip classification should be surfaced as a warning, not silently overwrite the catalog.',
);

const liveRubiconPack = {
  id: 'rubicon-trail',
  name: 'Rubicon Trail',
  source: 'ecs_validated',
  dataState: 'live',
  routeType: 'point_to_point',
  centerCoordinate: { latitude: 40.92, longitude: -123.65 },
  routeGeometry: rubiconTrail.route_geometry,
  distanceMiles: 21,
  estimatedDurationMinutes: 840,
  searchDistanceMiles: 32,
  geometryDistanceMiles: 32,
  centerDistanceMiles: 205,
  searchMatchReasons: ['geometry_within_radius', 'known_route_alias'],
  routeIntelligence: {
    tripType: 'day_trip',
  },
  officialAccessCoveragePct: 100,
  unknownAccessCoveragePct: 0,
  restrictedAccessCoveragePct: 0,
  activeClosureCount: 0,
  confidenceScore: 92,
  confidenceReasons: ['Official access verified', 'Route geometry is available'],
  catalogVerification: {
    status: 'normal',
    sourceLabel: 'Official access verified',
    publicRecommendation: true,
    confidenceScore: 92,
    warnings: [],
    blockers: [],
    dataUsed: [officialSource()],
    lastEvaluatedAt: nowIso,
  },
  positiveFeedbackCount: 10,
  negativeFeedbackCount: 0,
  completionCount: 4,
  reviewStatus: 'approved',
  tags: ['Tahoe National Forest', 'day trip', 'featured'],
  createdAt: nowIso,
  updatedAt: nowIso,
};

const discoverable = getDiscoverableTrailPacks([liveRubiconPack], userNearTahoe, 100);
assert.strictEqual(discoverable.length, 1, 'Client Trail Pack filtering should honor geometry/search distance, not only center distance.');
assert.strictEqual(
  Math.round(discoverable[0].distanceFromUserMiles),
  32,
  'Client Trail Pack distance should preserve the server-provided geometry-aware search distance.',
);

const opportunity = trailPackToExpeditionOpportunity(discoverable[0]);
assert.strictEqual(opportunity.estimatedDays, 1, 'Trail Pack projection should keep explicit catalog Day Trip classification.');
assert.strictEqual(
  opportunity.routeMetadata.catalogTripClassification.tripType,
  'day_trip',
  'Route metadata should expose the honest catalog trip classification for UI diagnostics.',
);
assert(
  opportunity.routeMetadata.catalogTripClassification.warnings.length > 0,
  'Route metadata should preserve trip-classification warnings for diagnostics.',
);

console.log('Explore route catalog discovery checks passed');
