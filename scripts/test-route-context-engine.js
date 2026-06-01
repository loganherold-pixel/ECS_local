const assert = require('assert');
const fs = require('fs');
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

const routeContext = require(path.join(root, 'lib', 'routeContext', 'index.ts'));

const {
  DEFAULT_ROUTE_CONTEXT_FEATURE_FLAGS,
  ROUTE_CONTEXT_WARNING_CODES,
  buildSupplyPlan,
  generateRouteContext,
  resolveRouteContextFeatureFlags,
  resolveTrailheadAnchor,
} = routeContext;

const completeGeometry = {
  origin: { lat: 38.0, lng: -110.1 },
  destination: { lat: 38.2, lng: -109.8 },
  waypoints: [],
  coordinates: [
    { lat: 38.0, lng: -110.1 },
    { lat: 38.1, lng: -109.95 },
    { lat: 38.2, lng: -109.8 },
  ],
  distanceMeters: 28000,
  durationSeconds: 3600,
  bbox: { west: -110.1, south: 38.0, east: -109.8, north: 38.2 },
  corridor: null,
  segments: [
    {
      id: 'segment-1',
      start: { lat: 38.0, lng: -110.1 },
      end: { lat: 38.2, lng: -109.8 },
      distanceMeters: 28000,
      durationSeconds: 3600,
    },
  ],
  providerMetadata: { source: 'test_geometry' },
};

const gasCandidate = {
  id: 'gas-1',
  providerPlaceId: 'place-gas-1',
  category: 'gas',
  name: 'Trailhead Fuel',
  lat: 38.01,
  lng: -110.08,
  address: '1 Fuel Rd',
  confidence: { value: 0.88, reasons: ['Fixture gas candidate.'] },
  score: 0.91,
  warnings: [],
};

const groceryCandidate = {
  id: 'grocery-1',
  providerPlaceId: 'place-grocery-1',
  category: 'grocery',
  name: 'Trailhead Market',
  lat: 38.02,
  lng: -110.07,
  address: '2 Market Rd',
  confidence: { value: 0.82, reasons: ['Fixture grocery candidate.'] },
  score: 0.86,
  warnings: [],
};

async function main() {
  assert.deepStrictEqual(DEFAULT_ROUTE_CONTEXT_FEATURE_FLAGS, {
    'ecs.routeContextEngine.enabled': false,
    'ecs.routeContextEngine.prefetchOnTrailSelect': false,
    'ecs.routeContextEngine.trailheadAnchoredSupplyChain': false,
    'ecs.routeContextEngine.enableCampCandidates': false,
    'ecs.routeContextEngine.enableBailoutCandidates': false,
    'ecs.routeContextEngine.debugLogging': false,
  });
  assert.ok(ROUTE_CONTEXT_WARNING_CODES.includes('missing_origin'));
  assert.ok(ROUTE_CONTEXT_WARNING_CODES.includes('stale_cached_context'));

  const gatedFlags = resolveRouteContextFeatureFlags({
    'ecs.routeContextEngine.enabled': false,
    'ecs.routeContextEngine.prefetchOnTrailSelect': true,
    'ecs.routeContextEngine.trailheadAnchoredSupplyChain': true,
    'ecs.routeContextEngine.enableCampCandidates': true,
    'ecs.routeContextEngine.enableBailoutCandidates': true,
  });
  assert.strictEqual(gatedFlags['ecs.routeContextEngine.prefetchOnTrailSelect'], false);
  assert.strictEqual(gatedFlags['ecs.routeContextEngine.trailheadAnchoredSupplyChain'], false);
  assert.strictEqual(gatedFlags['ecs.routeContextEngine.enableCampCandidates'], false);
  assert.strictEqual(gatedFlags['ecs.routeContextEngine.enableBailoutCandidates'], false);

  const nestedFlags = resolveRouteContextFeatureFlags({
    ecs: {
      routeContextEngine: {
        enabled: true,
        prefetchOnTrailSelect: true,
        trailheadAnchoredSupplyChain: true,
      },
    },
  });
  assert.strictEqual(nestedFlags['ecs.routeContextEngine.enabled'], true);
  assert.strictEqual(nestedFlags['ecs.routeContextEngine.prefetchOnTrailSelect'], true);
  assert.strictEqual(nestedFlags['ecs.routeContextEngine.trailheadAnchoredSupplyChain'], true);
  assert.strictEqual(nestedFlags['ecs.routeContextEngine.enableCampCandidates'], false);
  assert.strictEqual(nestedFlags['ecs.routeContextEngine.enableBailoutCandidates'], false);

  let disabledProviderCalled = false;
  const disabledContext = await generateRouteContext({
    trail: {
      id: 'disabled-trail',
      explicitTrailhead: { lat: 38, lng: -110 },
    },
    selectedSupplyMode: 'gas',
    providers: {
      supplyProvider: {
        id: 'disabled-supply-provider',
        async findSupplyCandidates() {
          disabledProviderCalled = true;
          return [gasCandidate];
        },
      },
    },
    now: '2026-05-29T12:00:00.000Z',
  });
  assert.strictEqual(disabledContext.status, 'idle');
  assert.strictEqual(disabledProviderCalled, false, 'disabled engine must not call providers');

  const explicitAnchor = resolveTrailheadAnchor({
    id: 'explicit-trail',
    explicitTrailhead: { lat: 38.1, lng: -110.2, label: 'Known Trailhead' },
  });
  assert.strictEqual(explicitAnchor.source, 'explicit_trailhead');
  assert.ok(explicitAnchor.confidence.value > 0.9);

  const fallbackAnchor = resolveTrailheadAnchor({
    id: 'geometry-trail',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110.2, 38.1],
        [-110.0, 38.2],
      ],
    },
  });
  assert.strictEqual(fallbackAnchor.source, 'geometry_first_point');
  assert.ok(fallbackAnchor.warnings.some((item) => item.code === 'fallback_trailhead_used'));

  const plan = buildSupplyPlan('gas_and_grocery', [groceryCandidate, gasCandidate]);
  assert.ok(plan);
  assert.strictEqual(plan.gasCandidate.id, 'gas-1');
  assert.strictEqual(plan.groceryCandidate.id, 'grocery-1');
  assert.deepStrictEqual(plan.orderedStops.map((stop) => stop.category), ['gas', 'grocery']);

  let campCalled = false;
  let bailoutCalled = false;
  const providerBundle = {
    geometryProvider: {
      id: 'test-geometry-provider',
      async buildRouteGeometry() {
        return completeGeometry;
      },
    },
    supplyProvider: {
      id: 'test-supply-provider',
      async findSupplyCandidates(request) {
        assert.strictEqual(request.mode, 'gas_and_grocery');
        assert.strictEqual(request.trailheadAnchor.source, 'explicit_trailhead');
        return [gasCandidate, groceryCandidate];
      },
    },
    campProvider: {
      id: 'test-camp-provider',
      async findCampCandidates() {
        campCalled = true;
        return [
          {
            id: 'camp-1',
            name: 'Future Camp',
            lat: 38.15,
            lng: -109.9,
            source: 'fixture',
            confidence: { value: 0.7, reasons: ['Fixture camp candidate.'] },
            warnings: [],
          },
        ];
      },
    },
    bailoutProvider: {
      id: 'test-bailout-provider',
      async findBailoutCandidates() {
        bailoutCalled = true;
        return [
          {
            id: 'bailout-1',
            label: 'Paved Exit',
            lat: 38.18,
            lng: -109.88,
            source: 'fixture',
            confidence: { value: 0.74, reasons: ['Fixture bailout candidate.'] },
            warnings: [],
          },
        ];
      },
    },
  };

  const readyContext = await generateRouteContext({
    trail: {
      id: 'ready-trail',
      origin: { lat: 38.0, lng: -110.1 },
      explicitTrailhead: { lat: 38.0, lng: -110.1 },
      endpointCoordinate: { lat: 38.2, lng: -109.8 },
    },
    selectedSupplyMode: 'gas_and_grocery',
    providers: providerBundle,
    featureFlags: {
      'ecs.routeContextEngine.enabled': true,
    },
    now: '2026-05-29T12:00:00.000Z',
    ttlMs: 60000,
  });
  assert.strictEqual(readyContext.status, 'ready');
  assert.strictEqual(readyContext.selectedSupplyPlan.mode, 'gas_and_grocery');
  assert.strictEqual(readyContext.campCandidates.length, 0);
  assert.strictEqual(readyContext.bailoutCandidates.length, 0);
  assert.strictEqual(campCalled, false, 'camp provider should stay disabled by default');
  assert.strictEqual(bailoutCalled, false, 'bailout provider should stay disabled by default');
  assert.strictEqual(readyContext.expiresAt, '2026-05-29T12:01:00.000Z');

  let trailheadAnchoredRequestSeen = false;
  const chainFlagRequestContext = await generateRouteContext({
    trail: {
      id: 'chain-flag-request',
      origin: { lat: 38.0, lng: -110.1 },
      explicitTrailhead: { lat: 38.0, lng: -110.1 },
    },
    selectedSupplyMode: 'gas',
    providers: {
      supplyProvider: {
        id: 'chain-flag-supply-provider',
        async findSupplyCandidates(request) {
          trailheadAnchoredRequestSeen = request.trailheadAnchoredSupplyChain === true;
          return [gasCandidate];
        },
      },
    },
    featureFlags: {
      'ecs.routeContextEngine.enabled': true,
      'ecs.routeContextEngine.trailheadAnchoredSupplyChain': true,
    },
  });
  assert.ok(['ready', 'partial'].includes(chainFlagRequestContext.status));
  assert.strictEqual(trailheadAnchoredRequestSeen, true);
  assert.strictEqual(chainFlagRequestContext.providerMetadata.trailheadAnchoredSupplyChain, true);

  const futureContext = await generateRouteContext({
    trail: {
      id: 'future-trail',
      origin: { lat: 38.0, lng: -110.1 },
      explicitTrailhead: { lat: 38.0, lng: -110.1 },
      endpointCoordinate: { lat: 38.2, lng: -109.8 },
    },
    selectedSupplyMode: 'none',
    providers: providerBundle,
    featureFlags: {
      ecs: {
        routeContextEngine: {
          enabled: true,
          enableCampCandidates: true,
          enableBailoutCandidates: true,
        },
      },
    },
  });
  assert.strictEqual(futureContext.campCandidates.length, 1);
  assert.strictEqual(futureContext.bailoutCandidates.length, 1);

  let unresolvedSupplyCalled = false;
  const unresolvedContext = await generateRouteContext({
    trail: { id: 'unresolved-trail' },
    selectedSupplyMode: 'gas',
    providers: {
      supplyProvider: {
        id: 'unresolved-supply-provider',
        async findSupplyCandidates() {
          unresolvedSupplyCalled = true;
          return [gasCandidate];
        },
      },
    },
    featureFlags: {
      'ecs.routeContextEngine.enabled': true,
    },
  });
  assert.strictEqual(unresolvedSupplyCalled, false);
  assert.strictEqual(unresolvedContext.trailheadAnchor.source, 'unknown');
  assert.ok(unresolvedContext.warnings.some((item) => item.code === 'no_supply_candidates_found'));

  const routeContextSource = fs
    .readdirSync(path.join(root, 'lib', 'routeContext'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => fs.readFileSync(path.join(root, 'lib', 'routeContext', name), 'utf8'))
    .join('\n');
  assert.ok(!/\b(mapbox|google)\b/i.test(routeContextSource), 'routeContext domain layer should stay provider-agnostic');
}

main()
  .then(() => {
    console.log('Route Context Engine foundation tests passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
