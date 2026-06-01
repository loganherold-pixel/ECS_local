const assert = require('assert');
const path = require('path');
const fs = require('fs');
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

const {
  createNoopBailoutCandidateProviderAdapter,
  createRouteContextProviderRegistry,
  findBailoutCandidates,
  generateRouteContext,
} = require(path.join(root, 'lib', 'routeContext', 'index.ts'));

const routeGeometry = {
  origin: { lat: 38, lng: -110.1 },
  destination: { lat: 38.2, lng: -109.8 },
  waypoints: [],
  coordinates: [
    { lat: 38, lng: -110.1 },
    { lat: 38.1, lng: -109.95 },
    { lat: 38.2, lng: -109.8 },
  ],
  distanceMeters: 28000,
  durationSeconds: 3600,
  bbox: { west: -110.1, south: 38, east: -109.8, north: 38.2 },
  corridor: { widthMeters: 12000, bbox: { west: -110.25, south: 37.9, east: -109.65, north: 38.3 } },
  segments: [],
};

const trailheadAnchor = {
  lat: 38,
  lng: -110.1,
  source: 'explicit_trailhead',
  confidence: { value: 0.96, reasons: ['Known trailhead.'] },
  warnings: [],
};

async function main() {
  let disabledBailoutCalled = false;
  const disabled = await generateRouteContext({
    trail: {
      id: 'bailout-disabled',
      explicitTrailhead: trailheadAnchor,
      routeGeometry: {
        type: 'LineString',
        coordinates: [[-110.1, 38], [-109.8, 38.2]],
      },
    },
    providers: {
      bailoutProvider: {
        id: 'disabled-bailout-provider',
        async findBailoutCandidates() {
          disabledBailoutCalled = true;
          return [{ id: 'disabled-bailout', label: 'Disabled Exit', lat: 38.1, lng: -109.95, source: 'fixture', confidence: { value: 0.7, reasons: [] }, warnings: [] }];
        },
      },
    },
    featureFlags: { 'ecs.routeContextEngine.enabled': true },
  });
  assert.strictEqual(disabled.bailoutCandidates.length, 0);
  assert.strictEqual(disabledBailoutCalled, false, 'bailout provider must not be called when bailout flag is disabled');

  const missingGeometry = await findBailoutCandidates({
    routeGeometry: null,
    trailheadAnchor,
    candidates: [{ id: 'missing-geometry-bailout', label: 'Missing Geometry Exit', lat: 38.1, lng: -109.95, source: 'fixture' }],
  });
  assert.strictEqual(missingGeometry.candidates.length, 0);
  assert.ok(missingGeometry.warnings.some((item) => item.code === 'missing_route_geometry'));

  const unavailable = await findBailoutCandidates({
    routeGeometry,
    trailheadAnchor,
    provider: createNoopBailoutCandidateProviderAdapter(),
  });
  assert.strictEqual(unavailable.candidates.length, 0);
  assert.ok(unavailable.warnings.some((item) => item.code === 'provider_unavailable'));

  const routingAdapter = {
    id: 'mock-routing',
    isAvailable: () => true,
    async computeRoute() {
      throw new Error('not used');
    },
    async computeRouteMatrix(input) {
      return {
        cells: input.origins.map((origin, originIndex) => ({
          originIndex,
          destinationIndex: 0,
          distanceMeters: originIndex === 0 ? 3000 : 12000,
          durationSeconds: originIndex === 0 ? 420 : 1800,
          status: 'ok',
        })),
      };
    },
  };

  const normalized = await findBailoutCandidates({
    routeGeometry,
    trailheadAnchor,
    routingAdapter,
    candidates: [
      {
        id: 'road-access',
        label: 'Road Access',
        category: 'road_access',
        lat: 38.1,
        lng: -109.95,
        source: 'fixture-road',
        reachableByVehicle: true,
        confidence: 0.88,
        score: 0.9,
      },
      {
        id: 'medical-poi',
        label: 'Medical POI',
        category: 'medical',
        lat: 38.12,
        lng: -109.96,
        source: 'fixture-poi',
        confidence: 0.7,
      },
      {
        id: 'far-support',
        label: 'Far Support',
        category: 'support',
        lat: 39.2,
        lng: -111.4,
        source: 'fixture-poi',
        confidence: 0.9,
      },
    ],
  });
  assert.strictEqual(normalized.candidates.length, 2, 'far support should be filtered outside the bailout corridor');
  assert.strictEqual(normalized.candidates[0].id, 'road-access');
  assert.strictEqual(normalized.candidates[0].category, 'road_access');
  assert.strictEqual(normalized.candidates[0].driveTimeToSafetySeconds, 420);
  assert.ok(normalized.candidates[0].routeMileMarker >= 0);
  assert.ok(normalized.candidates[0].distanceFromRouteMeters >= 0);
  assert.ok(normalized.candidates[0].score > normalized.candidates[1].score);
  assert.ok(normalized.candidates[1].warnings.some((item) => item.code === 'unknown_bailout_reachability'));
  assert.ok(normalized.candidates[1].warnings.some((item) => item.code === 'unverified_bailout_support'));

  const registry = createRouteContextProviderRegistry({
    routing: routingAdapter,
    bailout: {
      id: 'mock-bailout-adapter',
      isAvailable: () => true,
      async searchBailoutCandidates(input) {
        assert.strictEqual(input.trailheadAnchor.lat, 38);
        assert.ok(input.routeGeometry.coordinates.length >= 2);
        return [{
          id: 'adapter-bailout',
          label: 'Adapter Road Exit',
          category: 'road_access',
          coordinate: { lat: 38.1, lng: -109.95 },
          source: 'mock-bailout-adapter',
          reachableByVehicle: true,
          confidence: 0.82,
        }];
      },
    },
  });
  assert.strictEqual(registry.canSearchBailoutCandidates(), true);
  assert.ok(registry.getCapabilities().includes('bailout_candidates'));

  const context = await generateRouteContext({
    trail: {
      id: 'bailout-enabled',
      explicitTrailhead: trailheadAnchor,
      routeGeometry: {
        type: 'LineString',
        coordinates: [[-110.1, 38], [-109.95, 38.1], [-109.8, 38.2]],
      },
    },
    providerRegistry: registry,
    featureFlags: {
      ecs: {
        routeContextEngine: {
          enabled: true,
          enableBailoutCandidates: true,
        },
      },
    },
  });
  assert.strictEqual(context.bailoutCandidates.length, 1);
  assert.strictEqual(context.bailoutCandidates[0].id, 'adapter-bailout');
  assert.strictEqual(context.bailoutCandidates[0].reachableByVehicle, true);
  assert.ok(context.bailoutCandidates[0].routeMileMarker >= 0);

  const noProviderContext = await generateRouteContext({
    trail: {
      id: 'bailout-no-provider',
      explicitTrailhead: trailheadAnchor,
      routeGeometry: {
        type: 'LineString',
        coordinates: [[-110.1, 38], [-109.95, 38.1]],
      },
    },
    featureFlags: {
      ecs: {
        routeContextEngine: {
          enabled: true,
          enableBailoutCandidates: true,
        },
      },
    },
  });
  assert.strictEqual(noProviderContext.bailoutCandidates.length, 0);
  assert.ok(noProviderContext.warnings.some((item) => item.code === 'provider_unavailable'));
}

main()
  .then(() => {
    console.log('Route Context bailout candidate foundation tests passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
