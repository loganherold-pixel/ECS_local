const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
global.__DEV__ = false;

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

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web', select: (choices) => choices?.web ?? choices?.default },
    };
  }
  if (
    (request === '../supabase' || request === './supabase') &&
    parent?.filename.includes(`${path.sep}lib${path.sep}`)
  ) {
    return { supabase: {} };
  }
  return originalLoad.apply(this, [request, parent, isMain]);
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function collectLiteralJsxTestIds(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.ES2020,
    true,
    ts.ScriptKind.TSX,
  );
  const testIds = new Set();
  function visit(node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sourceFile) === 'testID' &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      testIds.add(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return testIds;
}

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const preview = read(path.join('components', 'trailPacks', 'TrailPackPreviewModal.tsx'));
const domain = read(path.join('lib', 'explore', 'trailPacks.ts'));
const liveCatalogPath = path.join('lib', 'explore', 'liveTrailPackCatalog.ts');
const migrationPath = path.join('supabase', 'migrations', '026_live_trail_packs_catalog.sql');

assert(exists(liveCatalogPath), 'Trail Packs should have a live catalog client instead of relying on seeded fixtures');
assert(exists(migrationPath), 'Trail Packs should define a live Supabase catalog table for approved reviewed route data');

const liveCatalog = read(liveCatalogPath);
const migration = read(migrationPath);
const {
  deriveExploreGuidanceProviderAvailability,
  deriveExploreRouteSurfaceState,
} = require(
  path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'),
);
const discoverSemanticTestIds = collectLiteralJsxTestIds(
  discover,
  path.join('app', '(tabs)', 'discover.tsx'),
);

function routeSurface(overrides = {}) {
  return deriveExploreRouteSurfaceState({
    status: 'ready',
    providerStatus: 'active',
    catalogSource: 'route_catalog',
    sourceTruth: 'live',
    freshness: 'live',
    snapshotRefreshKey: 'current-route-request',
    currentRefreshKey: 'current-route-request',
    visibleCandidateCount: 0,
    candidateCount: 0,
    discoverableCount: 0,
    readyCount: 0,
    evaluatedCount: 0,
    hasRangeData: false,
    isSourceFilterAll: true,
    isLoading: false,
    validEmpty: false,
    ...overrides,
  });
}

assert(
  discover.includes('liveTrailPackCatalogStore') &&
    discover.includes('liveTrailPackCatalogSnapshot.trailPacks') &&
    discover.includes('refreshLiveTrailPackCatalog'),
  'Explore Trail Packs should hydrate from the live Trail Pack catalog store',
);
assert(
  !discover.includes('getDefaultECSTrailPacks'),
  'Explore must not merge default fixture Trail Packs into user-visible Trail Pack content',
);
const providerUnavailable = routeSurface({
  status: 'error',
  providerStatus: 'error',
  catalogSource: 'unavailable',
  sourceTruth: 'unavailable',
  freshness: 'unknown',
  snapshotRefreshKey: null,
  evaluatedCount: 23,
  hasRangeData: true,
});
assert.strictEqual(providerUnavailable.kind, 'provider_unavailable');
assert.strictEqual(providerUnavailable.currentSuccessfulEvaluation, false);
assert.strictEqual(providerUnavailable.showBlockedNotice, false);

const providerDegraded = routeSurface({
  status: 'degraded',
  sourceTruth: 'cached',
  freshness: 'stale',
  evaluatedCount: 23,
  hasRangeData: true,
});
assert.strictEqual(providerDegraded.kind, 'stale');
assert.strictEqual(providerDegraded.currentSuccessfulEvaluation, false);
assert.strictEqual(providerDegraded.showBlockedNotice, false);

const cachedCardsDuringProviderFailure = routeSurface({
  status: 'stale',
  providerStatus: 'unavailable',
  catalogSource: 'route_catalog',
  sourceTruth: 'cached',
  freshness: 'stale',
  visibleCandidateCount: 2,
  candidateCount: 2,
  discoverableCount: 2,
  evaluatedCount: 2,
  hasRangeData: true,
});
assert.deepStrictEqual(cachedCardsDuringProviderFailure, {
  kind: 'cards',
  currentSuccessfulEvaluation: false,
  showBlockedNotice: false,
});

const cachedProviderAvailability = deriveExploreGuidanceProviderAvailability({
  providerStatus: 'stale',
  providerHasData: true,
  evaluatedCount: 2,
  readyCount: 0,
});
assert.strictEqual(cachedProviderAvailability.providerUnavailableWithoutData, false);
assert.strictEqual(cachedProviderAvailability.blockCanonicalInventory, false);

const unavailableWithoutData = deriveExploreGuidanceProviderAvailability({
  providerStatus: 'error',
  providerHasData: false,
  evaluatedCount: 0,
  readyCount: 0,
});
assert.strictEqual(unavailableWithoutData.providerUnavailableWithoutData, true);
assert.strictEqual(unavailableWithoutData.blockCanonicalInventory, true);

assert(
  discoverSemanticTestIds.has('explore-guidance-ready-provider-unavailable') &&
    discoverSemanticTestIds.has('explore-guidance-ready-degraded-notice') &&
    discoverSemanticTestIds.has('explore-guidance-ready-blocked-notice'),
  'Explore should retain distinct semantic selectors for provider-unavailable, degraded, and policy-blocked surfaces.',
);
assert(
  liveCatalog.includes("from('trail_packs')") &&
    liveCatalog.includes("dataState: 'live'") &&
    liveCatalog.includes('normalizeLiveTrailPackRecord') &&
    !liveCatalog.includes('getDefaultECSTrailPacks'),
  'Live Trail Pack catalog should normalize Supabase rows as live data and avoid fixture fallback',
);
assert(
  domain.includes("dataState?: ECSTrailPackDataState") &&
    domain.includes("dataState: 'fixture'") &&
    domain.includes('getDefaultECSTrailPacks'),
  'Default Trail Pack seed data should remain explicit fixture data, not live catalog content',
);
assert(
  preview.includes('MapRenderer') &&
    preview.includes('DEFAULT_MAP_STYLE') &&
    preview.includes('getMapboxToken') &&
    preview.includes('surfaceMode="compact"') &&
    preview.includes('cameraMode="route_overview"') &&
    preview.includes('interactive={false}') &&
    !preview.includes('function RouteSegment') &&
    !preview.includes('projectGeometry('),
  'Trail Pack preview should render an actual Mapbox route snapshot surface, not the old diamond line diagram',
);
assert(
  migration.includes('create table if not exists public.trail_packs') &&
    migration.includes('alter table public.trail_packs enable row level security') &&
    migration.includes("review_status = 'approved'") &&
    migration.includes('route_geometry jsonb') &&
    !/insert\s+into\s+public\.trail_packs/i.test(migration),
  'Trail Pack live schema should expose approved reviewed rows without inserting mock/demo content',
);

console.log('Explore Trail Pack live catalog and route snapshot checks passed');
