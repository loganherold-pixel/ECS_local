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

const {
  createNoopPlacesProviderAdapter,
  createRouteContextProviderRegistry,
  discoverSupplyCandidates,
  generateRouteContext,
} = require(path.join(root, 'lib', 'routeContext', 'index.ts'));

const featureFlags = { 'ecs.routeContextEngine.enabled': true };
const trailheadAnchor = {
  lat: 38,
  lng: -110,
  label: 'Test Trailhead',
  source: 'explicit_trailhead',
  confidence: { value: 0.96, reasons: ['Fixture anchor.'] },
  warnings: [],
};

function place(id, category, lat, lng, extra = {}) {
  return {
    id,
    providerPlaceId: `provider-${id}`,
    category,
    name: extra.name ?? id,
    coordinate: { lat, lng },
    address: extra.address ?? null,
    openStatus: extra.openStatus ?? 'open',
    rating: extra.rating ?? 4,
    confidence: extra.confidence ?? 0.8,
    categoryMatchQuality: extra.categoryMatchQuality,
    providerMetadata: extra.providerMetadata ?? null,
  };
}

function placesAdapterFor(places, options = {}) {
  return {
    id: options.id ?? 'test-places',
    isAvailable: () => options.available !== false,
    calls: [],
    async searchNearby(input) {
      this.calls.push({ method: 'nearby', input });
      if (options.nearby) return options.nearby(input);
      const [category] = input.categories ?? [];
      return places.filter((candidate) => candidate.category === category);
    },
    async searchText(input) {
      this.calls.push({ method: 'text', input });
      if (options.text) return options.text(input);
      return [];
    },
  };
}

function routingAdapterWithMatrix(metricsByLng) {
  return {
    id: 'test-routing',
    isAvailable: () => true,
    async computeRoute() {
      return { coordinates: [], distanceMeters: 0, durationSeconds: 0 };
    },
    async computeRouteMatrix(input) {
      const anchorDestinationIndex = input.destinations.length - 1;
      const cells = [{
        originIndex: 0,
        destinationIndex: anchorDestinationIndex,
        distanceMeters: 10000,
        durationSeconds: 1200,
        status: 'ok',
      }];
      input.destinations.slice(0, -1).forEach((destination, destinationIndex) => {
        const key = destination.lng.toFixed(3);
        const metrics = metricsByLng[key];
        cells.push({
          originIndex: 0,
          destinationIndex,
          distanceMeters: metrics.originToCandidateDistance,
          durationSeconds: metrics.originToCandidateDuration,
          status: 'ok',
        });
      });
      input.origins.slice(1).forEach((origin, index) => {
        const key = origin.lng.toFixed(3);
        const metrics = metricsByLng[key];
        cells.push({
          originIndex: index + 1,
          destinationIndex: anchorDestinationIndex,
          distanceMeters: metrics.candidateToTrailheadDistance,
          durationSeconds: metrics.candidateToTrailheadDuration,
          status: 'ok',
        });
      });
      return { cells };
    },
  };
}

function routingAdapterToTrailheadOnly(metricsByLng, options = {}) {
  return {
    id: options.id ?? 'test-routing-to-trailhead',
    isAvailable: () => options.available !== false,
    async computeRoute() {
      return { coordinates: [], distanceMeters: 0, durationSeconds: 0 };
    },
    async computeRouteMatrix(input) {
      if (input.destinations.length === 1) {
        return {
          cells: input.origins.map((origin, originIndex) => {
            const key = origin.lng.toFixed(3);
            const metrics = metricsByLng[key];
            return {
              originIndex,
              destinationIndex: 0,
              distanceMeters: metrics.candidateToTrailheadDistance,
              durationSeconds: metrics.candidateToTrailheadDuration,
              status: 'ok',
            };
          }),
        };
      }
      return routingAdapterWithMatrix(metricsByLng).computeRouteMatrix(input);
    },
  };
}

async function main() {
  const gasProvider = placesAdapterFor([
    place('fuel-near', 'gas', 38.002, -110.002, { name: 'Trailhead Fuel' }),
  ]);
  const gasCandidates = await discoverSupplyCandidates({
    placesAdapter: gasProvider,
    request: {
      trailId: 'gas-trail',
      trailheadAnchor,
      mode: 'gas',
    },
  });
  assert.strictEqual(gasCandidates.length, 1);
  assert.strictEqual(gasCandidates[0].category, 'gas');
  assert.ok(gasCandidates[0].score > 0.8);

  const groceryProvider = placesAdapterFor([
    place('market-near', 'grocery', 38.004, -110.004, { name: 'Trailhead Market' }),
  ]);
  const groceryCandidates = await discoverSupplyCandidates({
    placesAdapter: groceryProvider,
    request: {
      trailId: 'grocery-trail',
      trailheadAnchor,
      mode: 'grocery',
    },
  });
  assert.strictEqual(groceryCandidates.length, 1);
  assert.strictEqual(groceryCandidates[0].category, 'grocery');

  const bothProvider = placesAdapterFor([
    place('both-fuel', 'gas', 38.002, -110.002, { name: 'Both Fuel' }),
    place('both-market', 'grocery', 38.003, -110.003, { name: 'Both Market' }),
  ]);
  const bothCandidates = await discoverSupplyCandidates({
    placesAdapter: bothProvider,
    request: {
      trailId: 'both-trail',
      trailheadAnchor,
      mode: 'gas_and_grocery',
    },
  });
  assert.strictEqual(bothCandidates.filter((candidate) => candidate.category === 'gas').length, 1);
  assert.strictEqual(bothCandidates.filter((candidate) => candidate.category === 'grocery').length, 1);
  assert.ok(bothProvider.calls.some((call) => call.input.categories[0] === 'gas'));
  assert.ok(bothProvider.calls.some((call) => call.input.categories[0] === 'grocery'));

  const chainProvider = placesAdapterFor([
    place('chain-fuel', 'gas', 38.01, -110.01, { name: 'Fuel Before Trailhead' }),
    place('market-by-fuel', 'grocery', 38.0105, -110.0105, { name: 'Market Beside Fuel' }),
    place('market-by-trailhead', 'grocery', 38.0002, -110.0002, { name: 'Trailhead Market But Away From Fuel' }),
  ]);
  const chainCandidates = await discoverSupplyCandidates({
    placesAdapter: chainProvider,
    request: {
      trailId: 'trailhead-anchored-chain',
      trailheadAnchor,
      origin: { lat: 37.9, lng: -110.2 },
      mode: 'gas_and_grocery',
      trailheadAnchoredSupplyChain: true,
    },
  });
  const chainGas = chainCandidates.find((candidate) => candidate.category === 'gas');
  const chainGroceries = chainCandidates.filter((candidate) => candidate.category === 'grocery');
  const groceryCall = chainProvider.calls.find((call) => call.input.categories[0] === 'grocery');
  assert.ok(chainGas);
  assert.ok(groceryCall, 'Trailhead-anchored supply chain should still search for grocery when fuel is found.');
  assert.strictEqual(groceryCall.input.center.lat, chainGas.lat);
  assert.strictEqual(groceryCall.input.center.lng, chainGas.lng);
  assert.strictEqual(groceryCall.input.radiusMeters, 500);
  assert.strictEqual(chainGroceries[0].id, 'market-by-fuel');
  assert.strictEqual(chainGroceries[0].providerMetadata.supplyChain.anchorRole, 'refuel');
  assert.strictEqual(chainGroceries[0].providerMetadata.supplyChain.anchorCandidateId, 'chain-fuel');
  assert.ok(chainGroceries[0].refuelAdjacencyScore > 0.9);
  assert.strictEqual(chainGroceries[0].distanceToRefuelMeters, chainGroceries[0].distanceToSupplyChainAnchorMeters);
  assert.ok(
    chainGroceries[0].distanceToSupplyChainAnchorMeters < chainGroceries[1].distanceToSupplyChainAnchorMeters,
    'Resupply ranking should prefer groceries close to the selected refuel stop.',
  );

  const farResupplyProvider = placesAdapterFor([
    place('far-chain-fuel', 'gas', 38.01, -110.01, { name: 'Far Chain Fuel' }),
    place('far-chain-market', 'grocery', 38.09, -110.09, { name: 'Far Chain Market' }),
  ]);
  const farResupplyCandidates = await discoverSupplyCandidates({
    placesAdapter: farResupplyProvider,
    request: {
      trailId: 'far-resupply-chain',
      trailheadAnchor,
      origin: { lat: 37.9, lng: -110.2 },
      mode: 'gas_and_grocery',
      trailheadAnchoredSupplyChain: true,
    },
  });
  const farResupply = farResupplyCandidates.find((candidate) => candidate.category === 'grocery');
  assert.ok(farResupply);
  assert.ok(farResupply.distanceToRefuelMeters > 5000);
  assert.ok(farResupply.warnings.some((warning) => warning.code === 'resupply_far_from_refuel'));
  assert.ok(farResupply.warnings.some((warning) => warning.code === 'no_resupply_near_refuel'));

  const ruralResupplyProvider = placesAdapterFor([], {
    nearby(input) {
      const [category] = input.categories ?? [];
      if (category === 'gas') return [place('rural-chain-fuel', 'gas', 38.01, -110.01, { name: 'Rural Chain Fuel' })];
      if (category === 'grocery' && input.radiusMeters >= 12000) {
        return [place('rural-chain-market', 'grocery', 38.06, -110.06, { name: 'Rural Chain Market' })];
      }
      return [];
    },
  });
  const ruralResupplyCandidates = await discoverSupplyCandidates({
    placesAdapter: ruralResupplyProvider,
    request: {
      trailId: 'rural-resupply-chain',
      trailheadAnchor,
      origin: { lat: 37.9, lng: -110.2 },
      mode: 'gas_and_grocery',
      trailheadAnchoredSupplyChain: true,
    },
  });
  const ruralResupply = ruralResupplyCandidates.find((candidate) => candidate.category === 'grocery');
  assert.ok(ruralResupply);
  assert.strictEqual(ruralResupply.providerMetadata.searchRadiusMeters, 12000);
  assert.ok(ruralResupply.warnings.some((warning) => warning.code === 'rural_resupply_fallback_used'));
  assert.ok(ruralResupply.warnings.some((warning) => warning.code === 'no_resupply_near_refuel'));

  const manualRefuelProvider = placesAdapterFor([
    place('recommended-fuel', 'gas', 38.002, -110.002, { name: 'Recommended Fuel' }),
    place('operator-fuel', 'gas', 38.04, -110.04, { name: 'Operator Fuel' }),
    place('operator-market', 'grocery', 38.0402, -110.0402, { name: 'Operator Market' }),
  ]);
  const manualRefuelCandidates = await discoverSupplyCandidates({
    placesAdapter: manualRefuelProvider,
    request: {
      trailId: 'manual-refuel-chain',
      trailheadAnchor,
      origin: { lat: 37.9, lng: -110.2 },
      mode: 'gas_and_grocery',
      trailheadAnchoredSupplyChain: true,
      selectedRefuelCandidateId: 'operator-fuel',
    },
  });
  const manualGroceryCall = manualRefuelProvider.calls.find((call) => call.input.categories[0] === 'grocery');
  const manualGrocery = manualRefuelCandidates.find((candidate) => candidate.category === 'grocery');
  assert.ok(manualGroceryCall);
  assert.ok(manualGrocery);
  assert.strictEqual(manualGroceryCall.input.center.lat, 38.04);
  assert.strictEqual(manualGroceryCall.input.center.lng, -110.04);
  assert.strictEqual(manualGrocery.providerMetadata.supplyChain.anchorCandidateId, 'operator-fuel');

  const partialCategoryContext = await generateRouteContext({
    trail: {
      id: 'partial-category-supply',
      origin: { lat: 37.9, lng: -110.2 },
      explicitTrailhead: { lat: 38, lng: -110 },
      routeGeometry: {
        type: 'LineString',
        coordinates: [
          [-110, 38],
          [-109.99, 38.01],
        ],
      },
    },
    providerRegistry: createRouteContextProviderRegistry({
      places: placesAdapterFor([
        place('gas-only', 'gas', 38.002, -110.002, { name: 'Fuel Only' }),
      ]),
    }),
    selectedSupplyMode: 'gas_and_grocery',
    featureFlags: {
      ...featureFlags,
      'ecs.routeContextEngine.trailheadAnchoredSupplyChain': true,
    },
  });
  assert.strictEqual(partialCategoryContext.status, 'partial');
  assert.strictEqual(partialCategoryContext.supplyCandidates.length, 1);
  assert.ok(partialCategoryContext.selectedSupplyPlan.gasCandidate);
  assert.strictEqual(partialCategoryContext.selectedSupplyPlan.groceryCandidate, null);
  assert.ok(partialCategoryContext.warnings.some((warning) => warning.code === 'no_supply_candidates_found'));
  assert.ok(partialCategoryContext.warnings.some((warning) => warning.code === 'no_resupply_near_refuel'));

  const manualContext = await generateRouteContext({
    trail: {
      id: 'manual-context-supply',
      origin: { lat: 37.9, lng: -110.2 },
      explicitTrailhead: { lat: 38, lng: -110 },
    },
    providerRegistry: createRouteContextProviderRegistry({
      places: placesAdapterFor([
        place('context-recommended-fuel', 'gas', 38.002, -110.002, { name: 'Context Recommended Fuel' }),
        place('context-operator-fuel', 'gas', 38.04, -110.04, { name: 'Context Operator Fuel' }),
        place('context-operator-market', 'grocery', 38.0402, -110.0402, { name: 'Context Operator Market' }),
      ]),
    }),
    selectedSupplyMode: 'gas_and_grocery',
    selectedRefuelCandidateId: 'context-operator-fuel',
    featureFlags: {
      ...featureFlags,
      'ecs.routeContextEngine.trailheadAnchoredSupplyChain': true,
    },
  });
  assert.strictEqual(manualContext.selectedSupplyPlan.gasCandidate.id, 'context-operator-fuel');
  assert.strictEqual(manualContext.selectedSupplyPlan.groceryCandidate.providerMetadata.supplyChain.anchorCandidateId, 'context-operator-fuel');

  const emptyContext = await generateRouteContext({
    trail: {
      id: 'empty-supply',
      origin: { lat: 37.9, lng: -110.2 },
      explicitTrailhead: { lat: 38, lng: -110 },
      routeGeometry: {
        type: 'LineString',
        coordinates: [
          [-110, 38],
          [-109.99, 38.01],
        ],
      },
    },
    providerRegistry: createRouteContextProviderRegistry({ places: placesAdapterFor([]) }),
    selectedSupplyMode: 'gas',
    featureFlags,
  });
  assert.strictEqual(emptyContext.status, 'partial');
  assert.ok(emptyContext.warnings.some((warning) => warning.code === 'no_supply_candidates_found'));

  const ruralProvider = placesAdapterFor([], {
    nearby(input) {
      if (input.radiusMeters < 25000) return [];
      return [place('rural-fuel', 'gas', 38.12, -110.12, { name: 'Rural Fuel' })];
    },
  });
  const ruralCandidates = await discoverSupplyCandidates({
    placesAdapter: ruralProvider,
    request: {
      trailId: 'rural-trail',
      trailheadAnchor,
      mode: 'gas',
    },
  });
  assert.strictEqual(ruralCandidates.length, 1);
  assert.strictEqual(ruralCandidates[0].providerMetadata.searchRadiusMeters, 25000);
  assert.deepStrictEqual(
    ruralProvider.calls.filter((call) => call.method === 'nearby').map((call) => call.input.radiusMeters),
    [8000, 25000],
  );

  const detourProvider = placesAdapterFor([
    place('raw-nearest-high-detour', 'gas', 38.001, -110.001, { name: 'Nearest But Off Approach' }),
    place('approach-low-detour', 'gas', 38.03, -110.030, { name: 'Approach Fuel' }),
  ]);
  const detourCandidates = await discoverSupplyCandidates({
    placesAdapter: detourProvider,
    routingAdapter: routingAdapterWithMatrix({
      '-110.001': {
        originToCandidateDistance: 50000,
        originToCandidateDuration: 4200,
        candidateToTrailheadDistance: 500,
        candidateToTrailheadDuration: 60,
      },
      '-110.030': {
        originToCandidateDistance: 9000,
        originToCandidateDuration: 1100,
        candidateToTrailheadDistance: 3000,
        candidateToTrailheadDuration: 420,
      },
    }),
    request: {
      trailId: 'detour-trail',
      trailheadAnchor,
      origin: { lat: 37.9, lng: -110.1 },
      mode: 'gas',
    },
  });
  assert.strictEqual(detourCandidates[0].id, 'approach-low-detour');
  assert.ok(detourCandidates[0].detourDistanceMeters < detourCandidates[1].detourDistanceMeters);
  assert.ok(detourCandidates[1].warnings.some((warning) => warning.code === 'excessive_refuel_detour'));
  assert.ok(detourCandidates[0].approachScore > detourCandidates[1].approachScore);
  assert.ok(detourCandidates[1].trailheadProximityScore >= detourCandidates[0].trailheadProximityScore);

  const originlessRoutingProvider = placesAdapterFor([
    place('close-straight-far-drive', 'gas', 38.001, -110.001, {
      name: 'Close Straight Line But Slow Drive',
      rating: 5,
      confidence: 0.95,
    }),
    place('farther-straight-short-drive', 'gas', 38.04, -110.04, {
      name: 'Short Drive To Trailhead Fuel',
      rating: 3.8,
      confidence: 0.72,
    }),
  ]);
  const originlessRoutingCandidates = await discoverSupplyCandidates({
    placesAdapter: originlessRoutingProvider,
    routingAdapter: routingAdapterToTrailheadOnly({
      '-110.001': {
        candidateToTrailheadDistance: 30000,
        candidateToTrailheadDuration: 1800,
      },
      '-110.040': {
        candidateToTrailheadDistance: 5000,
        candidateToTrailheadDuration: 600,
      },
    }),
    request: {
      trailId: 'originless-routing-trail',
      trailheadAnchor,
      mode: 'gas',
    },
  });
  assert.strictEqual(originlessRoutingCandidates[0].id, 'farther-straight-short-drive');
  assert.strictEqual(originlessRoutingCandidates[0].driveDistanceToTrailheadMeters, 5000);
  assert.ok(originlessRoutingCandidates[0].trailheadProximityScore > originlessRoutingCandidates[1].trailheadProximityScore);
  assert.ok(!originlessRoutingCandidates[0].warnings.some((warning) => warning.code === 'refuel_drive_distance_unavailable'));

  const distanceProvider = placesAdapterFor([
    place('near-originless', 'gas', 38.002, -110.002, {
      name: 'Near Originless Fuel',
      rating: 3.4,
      confidence: 0.62,
    }),
    place('far-originless', 'gas', 38.25, -110.25, {
      name: 'Far Originless Fuel',
      rating: 5,
      confidence: 0.98,
    }),
  ]);
  const distanceCandidates = await discoverSupplyCandidates({
    placesAdapter: distanceProvider,
    request: {
      trailId: 'distance-trail',
      trailheadAnchor,
      mode: 'gas',
    },
  });
  assert.strictEqual(distanceCandidates[0].id, 'near-originless');
  assert.ok(distanceCandidates[0].distanceToTrailheadMeters < distanceCandidates[1].distanceToTrailheadMeters);
  assert.strictEqual(distanceCandidates[0].detourDistanceMeters, null);
  assert.strictEqual(distanceCandidates[0].driveDistanceToTrailheadMeters, null);
  assert.ok(distanceCandidates[0].warnings.some((warning) => warning.code === 'refuel_drive_distance_unavailable'));

  const unavailableRoutingProvider = placesAdapterFor([
    place('routing-down-fuel', 'gas', 38.002, -110.002, { name: 'Routing Down Fuel' }),
  ]);
  const unavailableRoutingCandidates = await discoverSupplyCandidates({
    placesAdapter: unavailableRoutingProvider,
    routingAdapter: routingAdapterToTrailheadOnly({}, { available: false }),
    request: {
      trailId: 'routing-down-refuel',
      trailheadAnchor,
      origin: { lat: 37.9, lng: -110.1 },
      mode: 'gas',
    },
  });
  assert.strictEqual(unavailableRoutingCandidates.length, 1);
  assert.strictEqual(unavailableRoutingCandidates[0].driveDistanceToTrailheadMeters, null);
  assert.ok(unavailableRoutingCandidates[0].distanceToTrailheadMeters > 0);
  assert.ok(unavailableRoutingCandidates[0].warnings.some((warning) => warning.code === 'refuel_drive_distance_unavailable'));

  const groceryQualityProvider = placesAdapterFor([
    place('near-convenience', 'grocery', 38.001, -110.001, {
      name: 'Convenience Stop',
      categoryMatchQuality: 0.35,
    }),
    place('true-grocery', 'grocery', 38.03, -110.03, {
      name: 'Full Grocery',
      categoryMatchQuality: 0.95,
    }),
  ]);
  const qualityCandidates = await discoverSupplyCandidates({
    placesAdapter: groceryQualityProvider,
    request: {
      trailId: 'quality-trail',
      trailheadAnchor,
      mode: 'grocery',
    },
  });
  assert.strictEqual(qualityCandidates[0].id, 'true-grocery');
  assert.ok(qualityCandidates[1].warnings.some((warning) => warning.code === 'poor_category_match'));

  const closedProvider = placesAdapterFor([
    place('closed-near', 'gas', 38.001, -110.001, {
      name: 'Closed Fuel',
      openStatus: 'closed',
    }),
    place('open-farther', 'gas', 38.03, -110.03, {
      name: 'Open Fuel',
      openStatus: 'open',
    }),
  ]);
  const closedCandidates = await discoverSupplyCandidates({
    placesAdapter: closedProvider,
    request: {
      trailId: 'closed-trail',
      trailheadAnchor,
      mode: 'gas',
    },
  });
  assert.strictEqual(closedCandidates[0].id, 'open-farther');
  assert.ok(closedCandidates[1].warnings.some((warning) => warning.code === 'closed_supply_candidate'));

  const unavailableContext = await generateRouteContext({
    trail: {
      id: 'unavailable-supply',
      origin: { lat: 37.9, lng: -110.2 },
      explicitTrailhead: { lat: 38, lng: -110 },
    },
    providerRegistry: createRouteContextProviderRegistry({ places: createNoopPlacesProviderAdapter() }),
    selectedSupplyMode: 'gas',
    featureFlags,
  });
  assert.strictEqual(unavailableContext.status, 'partial');
  assert.ok(unavailableContext.warnings.some((warning) => warning.code === 'provider_unavailable'));
}

main()
  .then(() => {
    console.log('Route Context supply discovery checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
