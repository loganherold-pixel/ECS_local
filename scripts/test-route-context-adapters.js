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
  createNoopPlacesProviderAdapter,
  createNoopRoutingProviderAdapter,
  createRouteContextProviderRegistry,
  generateRouteContext,
  normalizePlaceCandidate,
  normalizeRouteGeometryResult,
} = routeContext;

const featureFlags = { 'ecs.routeContextEngine.enabled': true };

async function main() {
  let routeCalled = false;
  const routingAdapter = {
    id: 'mock-routing',
    isAvailable: () => true,
    async computeRoute(input) {
      routeCalled = true;
      assert.strictEqual(input.origin.lat, 38);
      assert.strictEqual(input.destination.lat, 38.02);
      return {
        coordinates: [
          { lat: 38, lng: -110 },
          { lat: 38.01, lng: -109.99 },
          { lat: 38.02, lng: -109.98 },
        ],
        distanceMeters: 3100,
        durationSeconds: 420,
        providerMetadata: {
          routeProfile: 'fixture-driving',
          rawVendorField: 'kept-inside-provider-metadata',
        },
      };
    },
    async computeRouteMatrix(input) {
      return {
        cells: [{
          originIndex: 0,
          destinationIndex: 0,
          distanceMeters: 3100,
          durationSeconds: 420,
          status: 'ok',
          providerMetadata: { matrixProfile: input.mode ?? 'driving' },
        }],
        providerMetadata: { source: 'mock-routing' },
      };
    },
  };

  const registry = createRouteContextProviderRegistry({ routing: routingAdapter });
  assert.strictEqual(registry.canRoute(), true);
  assert.strictEqual(registry.canComputeMatrix(), true);
  assert.strictEqual(registry.canSearchPlaces(), false);
  assert.deepStrictEqual(registry.getCapabilities(), ['routing', 'route_matrix']);
  const matrix = await registry.routing.computeRouteMatrix({
    origins: [{ lat: 38, lng: -110 }],
    destinations: [{ lat: 38.02, lng: -109.98 }],
    mode: 'driving',
  });
  assert.strictEqual(matrix.cells[0].durationSeconds, 420);

  const contextFromRouting = await generateRouteContext({
    trail: {
      id: 'routing-success',
      origin: { lat: 38, lng: -110 },
      explicitTrailhead: { lat: 38, lng: -110 },
      endpointCoordinate: { lat: 38.02, lng: -109.98 },
    },
    providerRegistry: registry,
    selectedSupplyMode: 'none',
    featureFlags,
  });
  assert.strictEqual(routeCalled, true);
  assert.strictEqual(contextFromRouting.status, 'ready');
  assert.strictEqual(contextFromRouting.routeGeometry.durationSeconds, 420);
  assert.strictEqual(contextFromRouting.routeGeometry.providerMetadata.providerId, 'mock-routing');
  assert.strictEqual(contextFromRouting.providerMetadata.providers.geometry, 'mock-routing');
  assert.deepStrictEqual(contextFromRouting.providerMetadata.providers.capabilities, ['routing', 'route_matrix']);

  const unavailableRoutingRegistry = createRouteContextProviderRegistry({
    routing: createNoopRoutingProviderAdapter(),
  });
  assert.strictEqual(unavailableRoutingRegistry.canRoute(), false);
  const unavailableRoutingContext = await generateRouteContext({
    trail: {
      id: 'routing-unavailable',
      explicitTrailhead: { lat: 38, lng: -110 },
      routeGeometry: {
        type: 'LineString',
        coordinates: [
          [-110, 38],
          [-109.99, 38.01],
        ],
      },
    },
    providerRegistry: unavailableRoutingRegistry,
    selectedSupplyMode: 'none',
    featureFlags,
  });
  assert.strictEqual(unavailableRoutingContext.status, 'partial');
  assert.strictEqual(unavailableRoutingContext.routeGeometry.providerMetadata.source, 'ecs_fallback_route_geometry');

  const normalizedRoute = normalizeRouteGeometryResult({
    encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
    distanceMeters: 788905,
    durationSeconds: 1200,
    providerMetadata: { vendorTraceId: 'trace-1' },
  }, {
    origin: { lat: 38.5, lng: -120.2 },
    destination: { lat: 43.252, lng: -126.453 },
    providerId: 'mock-routing',
  });
  assert.ok(normalizedRoute);
  assert.strictEqual(normalizedRoute.coordinates.length, 3);
  assert.strictEqual(normalizedRoute.providerMetadata.vendorTraceId, 'trace-1');
  assert.strictEqual(normalizeRouteGeometryResult({
    coordinates: [
      { lat: 999, lng: -110 },
      { lat: 38, lng: -999 },
    ],
    distanceMeters: 1200,
  }, { providerId: 'malformed-routing' }), null);
  assert.strictEqual(normalizeRouteGeometryResult({
    encodedPolyline: 'not-a-route-polyline',
    distanceMeters: 1200,
  }, { providerId: 'malformed-routing' }), null);

  const placesAdapter = {
    id: 'mock-places',
    isAvailable: () => true,
    async searchNearby(input) {
      assert.strictEqual(input.center.lat, 38);
      return [{
        id: 'internal-gas-1',
        mapbox_id: 'vendor-secret-id',
        providerPlaceId: 'place-gas-1',
        category: 'gas',
        name: 'Trailhead Fuel',
        coordinate: { lat: 38.001, lng: -110.001 },
        address: '1 Fuel Road',
        openStatus: 'open',
        businessStatus: 'OPERATIONAL',
        rating: 4.6,
        score: 0.92,
        confidence: 0.84,
        rawVendorPayload: { shouldNotLeak: true },
        providerMetadata: { vendorTraceId: 'places-trace-1' },
      }];
    },
    async searchText() {
      return [];
    },
    async getPlaceDetails(placeId) {
      return {
        id: placeId,
        category: 'gas',
        name: 'Detailed Fuel',
        coordinate: { lat: 38, lng: -110 },
      };
    },
  };

  const placesRegistry = createRouteContextProviderRegistry({ places: placesAdapter });
  assert.strictEqual(placesRegistry.canSearchPlaces(), true);
  assert.deepStrictEqual(placesRegistry.getCapabilities(), ['places_nearby', 'places_text', 'place_details', 'camp_candidates', 'bailout_candidates']);

  const placesContext = await generateRouteContext({
    trail: {
      id: 'places-success',
      origin: { lat: 38, lng: -110 },
      explicitTrailhead: { lat: 38, lng: -110 },
      routeGeometry: {
        type: 'LineString',
        coordinates: [
          [-110, 38],
          [-109.99, 38.01],
        ],
      },
    },
    providerRegistry: placesRegistry,
    selectedSupplyMode: 'gas',
    featureFlags,
  });
  assert.strictEqual(placesContext.supplyCandidates.length, 1);
  const [candidate] = placesContext.supplyCandidates;
  assert.strictEqual(candidate.providerPlaceId, 'place-gas-1');
  assert.strictEqual(candidate.category, 'gas');
  assert.strictEqual(candidate.name, 'Trailhead Fuel');
  assert.strictEqual(candidate.openStatus, 'open');
  assert.strictEqual(candidate.rating, 4.6);
  assert.strictEqual(candidate.providerMetadata.businessStatus, 'OPERATIONAL');
  assert.strictEqual(candidate.providerMetadata.placeProviderMetadata.vendorTraceId, 'places-trace-1');
  const uiFacingCandidate = { ...candidate, providerMetadata: undefined };
  assert.ok(!JSON.stringify(uiFacingCandidate).includes('rawVendorPayload'));
  assert.ok(!JSON.stringify(uiFacingCandidate).includes('mapbox_id'));
  assert.ok(!JSON.stringify(uiFacingCandidate).includes('vendor-secret-id'));

  const normalizedPlace = normalizePlaceCandidate({
    placeId: 'provider-123',
    type: 'grocery',
    title: 'Market',
    location: { latitude: 38.002, longitude: -110.002 },
    formattedAddress: '2 Market Road',
    businessStatus: 'OPERATIONAL',
    vendorOnly: 'hidden',
  }, 'grocery', 'mock-places');
  assert.strictEqual(normalizedPlace.providerPlaceId, 'provider-123');
  assert.strictEqual(normalizedPlace.address, '2 Market Road');
  assert.ok(!JSON.stringify({ ...normalizedPlace, providerMetadata: undefined }).includes('vendorOnly'));
  assert.strictEqual(normalizePlaceCandidate({
    id: 'malformed-place',
    name: 'Malformed Place',
    category: 'gas',
    coordinate: { lat: 999, lng: -110 },
  }, 'gas', 'mock-places'), null);

  const unavailablePlacesRegistry = createRouteContextProviderRegistry({
    places: createNoopPlacesProviderAdapter(),
  });
  assert.strictEqual(unavailablePlacesRegistry.canSearchPlaces(), false);
  const placesUnavailableContext = await generateRouteContext({
    trail: {
      id: 'places-unavailable',
      origin: { lat: 38, lng: -110 },
      explicitTrailhead: { lat: 38, lng: -110 },
      routeGeometry: {
        type: 'LineString',
        coordinates: [
          [-110, 38],
          [-109.99, 38.01],
        ],
      },
    },
    providerRegistry: unavailablePlacesRegistry,
    selectedSupplyMode: 'gas',
    featureFlags,
  });
  assert.strictEqual(placesUnavailableContext.status, 'partial');
  assert.ok(placesUnavailableContext.warnings.some((item) => item.code === 'provider_unavailable'));
  assert.ok(placesUnavailableContext.warnings.some((item) => item.code === 'no_supply_candidates_found'));

  const malformedPlacesRegistry = createRouteContextProviderRegistry({
    places: {
      id: 'malformed-places',
      isAvailable: () => true,
      async searchNearby() {
        return [{
          id: 'bad-gas',
          category: 'gas',
          name: 'Bad Gas',
          coordinate: { lat: 999, lng: -110 },
          rawVendorPayload: { malformed: true },
        }];
      },
      async searchText() {
        return [];
      },
    },
  });
  const malformedPlacesContext = await generateRouteContext({
    trail: {
      id: 'places-malformed',
      origin: { lat: 38, lng: -110 },
      explicitTrailhead: { lat: 38, lng: -110 },
      endpointCoordinate: { lat: 38.02, lng: -109.98 },
    },
    providerRegistry: malformedPlacesRegistry,
    selectedSupplyMode: 'gas',
    featureFlags,
  });
  assert.strictEqual(malformedPlacesContext.status, 'partial');
  assert.strictEqual(malformedPlacesContext.supplyCandidates.length, 0);
  assert.ok(malformedPlacesContext.warnings.some((item) => item.code === 'no_supply_candidates_found'));
  assert.ok(!JSON.stringify(malformedPlacesContext).includes('rawVendorPayload'));

  const emptyPlacesRegistry = createRouteContextProviderRegistry({
    places: {
      id: 'empty-places',
      isAvailable: () => true,
      async searchNearby() {
        return [];
      },
      async searchText() {
        return [];
      },
    },
  });
  const emptyPlacesContext = await generateRouteContext({
    trail: {
      id: 'places-empty',
      origin: { lat: 38, lng: -110 },
      explicitTrailhead: { lat: 38, lng: -110 },
      endpointCoordinate: { lat: 38.02, lng: -109.98 },
    },
    providerRegistry: emptyPlacesRegistry,
    selectedSupplyMode: 'gas',
    featureFlags,
  });
  assert.strictEqual(emptyPlacesContext.status, 'partial');
  assert.strictEqual(emptyPlacesContext.supplyCandidates.length, 0);
  assert.ok(emptyPlacesContext.warnings.some((item) => item.code === 'no_supply_candidates_found'));
}

main()
  .then(() => {
    console.log('Route Context adapter registry checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
