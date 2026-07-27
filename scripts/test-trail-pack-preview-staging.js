const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const storage = new Map();

global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' }, StyleSheet: { create: (value) => value } };
  }
  if (request === 'expo-secure-store') {
    return {
      async getItemAsync(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      async setItemAsync(key, value) {
        storage.set(key, String(value));
      },
      async deleteItemAsync(key) {
        storage.delete(key);
      },
    };
  }
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
  buildExploreNavigationPayload,
  canStageNavigationHandoffRoute,
  getNavigationHandoffRouteUnavailableReason,
} = require(path.join(root, 'lib', 'navigationHandoffStore.ts'));
const {
  canStartTrailPackGuidance,
  getDefaultECSTrailPacks,
  getTrailPackGuidanceReadiness,
  trailPackToExpeditionOpportunity,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

const previewSource = fs.readFileSync(
  path.join(root, 'components', 'trailPacks', 'TrailPackPreviewModal.tsx'),
  'utf8',
);
const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');

const loopTrailPack = getDefaultECSTrailPacks().find((pack) => pack.id === 'tahoe-forest-loop-pack');
assert(loopTrailPack, 'Loop Trail Pack fixture should exist');
assert.strictEqual(canStartTrailPackGuidance(loopTrailPack), true, 'Valid Trail Pack geometry should allow guidance staging');

const opportunity = trailPackToExpeditionOpportunity({
  ...loopTrailPack,
  distanceFromUserMiles: 4.2,
  evaluatedConfidence: {
    score: 90,
    band: 'verified',
    reasons: ['Route geometry is available'],
    warnings: ['Seasonal closure data unavailable'],
    blockers: [],
    lastEvaluatedAt: new Date().toISOString(),
  },
});
const payload = buildExploreNavigationPayload(opportunity);
const firstLoopGeometryCoordinate = loopTrailPack.routeGeometry.type === 'LineString'
  ? loopTrailPack.routeGeometry.coordinates[0]
  : loopTrailPack.routeGeometry.coordinates[0][0];
assert.strictEqual(payload.source, 'explore');
assert.strictEqual(payload.tripMode, 'hybrid');
assert.strictEqual(payload.trailGeometry.length, 5, 'Trail Pack geometry should stage into Navigate payload');
assert.strictEqual(
  payload.trailheadCoordinate.lat,
  firstLoopGeometryCoordinate[1],
  'Trail Pack staging should use the actual route geometry start, not the center fallback.',
);
assert.strictEqual(payload.routeMetadata.source, 'trail_pack', 'Trail Pack source metadata should survive staging');
assert.strictEqual(payload.routeMetadata.trailPackId, loopTrailPack.id);
assert.strictEqual(payload.routeMetadata.trailPackRouteType, 'loop');

const pointToPointPack = getDefaultECSTrailPacks().find((pack) => pack.id === 'san-juan-alpine-gpx-pack');
assert(pointToPointPack, 'Point-to-point Trail Pack fixture should exist');
const pointPayload = buildExploreNavigationPayload(trailPackToExpeditionOpportunity({
  ...pointToPointPack,
  distanceFromUserMiles: 5,
  evaluatedConfidence: {
    score: 81,
    band: 'high',
    reasons: [],
    warnings: [],
    blockers: [],
    lastEvaluatedAt: new Date().toISOString(),
  },
}));
assert.strictEqual(pointPayload.routeMetadata.trailPackRouteType, 'point_to_point');
assert.strictEqual(pointPayload.trailGeometry.length, 4, 'Point-to-point Trail Pack should stage geometry');

const missingGeometryPack = {
  ...loopTrailPack,
  id: 'missing-geometry-preview',
  routeGeometry: undefined,
};
assert.strictEqual(canStartTrailPackGuidance(missingGeometryPack), false, 'Missing geometry should disable Start Guidance');

const disconnectedAggregatePack = {
  ...loopTrailPack,
  id: 'disconnected-aggregate-preview',
  routeGeometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [-120, 39],
        [-120.001, 39.001],
      ],
      [
        [-121, 40],
        [-121.001, 40.001],
      ],
    ],
  },
};
assert.strictEqual(
  canStartTrailPackGuidance(disconnectedAggregatePack),
  false,
  'Disconnected aggregate Trail Pack geometry should be preview-only and disable Start Guidance',
);
assert.strictEqual(
  getTrailPackGuidanceReadiness(disconnectedAggregatePack).label,
  'Preview only',
  'Disconnected aggregate Trail Pack geometry should produce explicit Preview only status',
);

const catalogPreviewOnlyPack = {
  ...loopTrailPack,
  id: 'catalog-preview-only-topology',
  catalogVerification: {
    status: 'watch',
    sourceLabel: 'Official access verified',
    publicRecommendation: true,
    confidenceScore: 88,
    warnings: [],
    blockers: [],
    activeGuidance: {
      status: 'preview_only',
      topologyResolved: false,
      sourceSegmentCount: 3,
      componentCount: 1,
      branchDetected: true,
      joinedSegmentGapCount: 2,
      disjointSegmentGapCount: 0,
      maxJoinGapMeters: 0,
      maxSegmentGapMeters: 0,
      unavailableReason: 'Active guidance is preview-only because this aggregate contains a branching source network.',
    },
    dataUsed: [],
    lastEvaluatedAt: new Date().toISOString(),
  },
};
const catalogPreviewReadiness = getTrailPackGuidanceReadiness(catalogPreviewOnlyPack);
assert.strictEqual(
  canStartTrailPackGuidance(catalogPreviewOnlyPack),
  false,
  'Catalog preview-only topology should block Start Guidance even when geometry itself is present',
);
assert.strictEqual(catalogPreviewReadiness.label, 'Preview only');
assert.match(catalogPreviewReadiness.description, /branching source network/i);

assert(
  previewSource.includes('MapRenderer') &&
    previewSource.includes('trailSegments={sourceTrailSegments}') &&
    previewSource.includes('waypoints={[]}') &&
    previewSource.includes('DEFAULT_MAP_STYLE') &&
    previewSource.includes('getMapboxToken') &&
    previewSource.includes('cameraMode="route_overview"') &&
    previewSource.includes('surfaceMode="compact"') &&
    !previewSource.includes('function RouteSegment') &&
    !previewSource.includes('projectGeometry(') &&
    !previewSource.includes('LOOP ROUTE') &&
    !previewSource.includes('POINT ROUTE') &&
    !previewSource.includes('s.mapBadge') &&
    !previewSource.includes('mapBadge:'),
  'Trail Pack preview should display a map-rendered route-line-only snapshot without generated pins or route-type overlay badges',
);
assert(
  !discoverSource.includes('onBuildTrip=') &&
    !discoverSource.includes('handleBuildTripFromRoute') &&
    discoverSource.includes('offlineCacheAvailable=') &&
    discoverSource.includes('handleCacheTrailPackOffline'),
  'Mounted Explore Trail Pack previews should expose offline caching without a Trip Builder action.',
);
assert(
  previewSource.includes('Offline cache unavailable for this Trail Pack.') &&
    previewSource.includes('offlineCache?.cacheable') &&
    previewSource.includes('Last verified') &&
    previewSource.includes('Stale after') &&
    previewSource.includes('offlineCacheAvailable') &&
    previewSource.includes('disabled={!effectiveOfflineCacheAvailable}'),
  'Offline cache action should use route catalog detail metadata and be disabled when Trail Pack cache support is unavailable',
);
assert(
    previewSource.includes('ECS confidence') &&
    previewSource.includes('effectiveTrailPackConfidenceScore(trailPack)') &&
    previewSource.includes('WARNINGS') &&
    previewSource.includes('ROUTE ASSESSMENT') &&
    previewSource.includes("label: 'STATUS'") &&
    previewSource.includes("label: 'CURRENT CONDITION'") &&
    previewSource.includes("label: 'WHY'") &&
    previewSource.includes("label: 'WHAT TO WATCH'") &&
    previewSource.includes("label: 'RECOMMENDED ACTION'") &&
    previewSource.includes("label: 'TO IMPROVE STATUS'") &&
    previewSource.includes('sourceLabel') &&
    previewSource.includes('communitySummary') &&
    previewSource.includes('GUIDANCE STATUS') &&
    !previewSource.includes('CONFIDENCE SIGNALS') &&
    !previewSource.includes('DATA USED') &&
    !previewSource.includes('detailDataUsed'),
  'Trail Pack preview should show concise Route Assessment detail while removing separate Confidence Signals and Data Used containers',
);
assert.strictEqual(
  canStageNavigationHandoffRoute(payload),
  true,
  'A valid Trail Pack transformation should produce a stageable navigation handoff.',
);
assert.strictEqual(getNavigationHandoffRouteUnavailableReason(payload), null);
assert.strictEqual(
  payload.routeMetadata.confidenceScore,
  loopTrailPack.confidenceScore,
  'The staging transformation should preserve the route-specific confidence source of truth.',
);

const summaryOnlyPayload = buildExploreNavigationPayload(
  trailPackToExpeditionOpportunity(missingGeometryPack),
);
assert.strictEqual(
  canStageNavigationHandoffRoute(summaryOnlyPayload),
  true,
  'A summary Trail Pack with a safe center fallback may be staged without fabricating detail geometry.',
);
assert.strictEqual(
  canStartTrailPackGuidance(missingGeometryPack),
  false,
  'Summary-first staging must not bypass the geometry gate for active guidance.',
);
assert.strictEqual(
  canStartTrailPackGuidance(disconnectedAggregatePack),
  false,
  'The staging contract must continue to reject unsafe disconnected guidance geometry.',
);
assert.strictEqual(payload.routeMetadata.source, 'trail_pack');
assert.strictEqual(payload.routeMetadata.trailPackId, loopTrailPack.id);
assert(
  discoverSource.includes("handleTrailPackFeedback(trailPackPreview.id, 'saved')"),
  'Saving a Trail Pack from preview should keep structured feedback connected',
);
assert(
  discoverSource.includes("flowLabel: 'Route Preview'") &&
    discoverSource.includes('Trail Pack is staged in Navigate. Review the map overview, then start when ready.') &&
    previewSource.includes('accessibilityLabel="Route Preview"') &&
    previewSource.includes('Preview this Trail Pack on the map without starting guidance.') &&
    previewSource.includes('<Text style={[s.primaryActionText, !canStart && s.primaryActionTextDisabled]}>START</Text>') &&
    previewSource.includes('OFFLINE'),
  'Trail Pack discovery should keep Route Preview, offline cache, and Start Guidance as separate explicit actions.',
);

console.log('Trail Pack preview and staging checks passed');
