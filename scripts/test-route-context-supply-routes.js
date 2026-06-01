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
  buildSupplyAwareRouteGeometry,
  createNoopRoutingProviderAdapter,
  createRouteContextProviderRegistry,
  generateRouteContext,
} = require(path.join(root, 'lib', 'routeContext', 'index.ts'));

const featureFlags = { 'ecs.routeContextEngine.enabled': true };
const chainFeatureFlags = {
  'ecs.routeContextEngine.enabled': true,
  'ecs.routeContextEngine.trailheadAnchoredSupplyChain': true,
};
const origin = { lat: 37.9, lng: -110.2, label: 'Origin' };
const trailhead = { lat: 38, lng: -110, label: 'Trailhead' };
const gas = { lat: 37.95, lng: -110.1, label: 'Gas' };
const grocery = { lat: 37.96, lng: -110.15, label: 'Grocery' };
const altGas = { lat: 37.93, lng: -110.11, label: 'Alt Gas' };
const closeGas = { lat: 37.99, lng: -110.01, label: 'Close Gas' };
const chainGas = { lat: 37.97, lng: -110.04, label: 'Chain Gas' };
const farChainGas = { lat: 37.7, lng: -110.6, label: 'Far Chain Gas' };
const farGrocery = { lat: 37.75, lng: -110.45, label: 'Far Grocery' };
const adjacentGrocery = { lat: 37.9705, lng: -110.0405, label: 'Adjacent Grocery' };
const nearGrocery = { lat: 37.971, lng: -110.041, label: 'Near Grocery' };
const farAdjacentGrocery = { lat: 37.7005, lng: -110.6005, label: 'Far Adjacent Grocery' };

const trailheadAnchor = {
  ...trailhead,
  source: 'explicit_trailhead',
  confidence: { value: 0.96, reasons: ['Fixture anchor.'] },
  warnings: [],
};

function coordKey(point) {
  return `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
}

function supplyCandidate(id, category, coordinate, score = 0.9) {
  return {
    id,
    providerPlaceId: `provider-${id}`,
    category,
    name: coordinate.label,
    lat: coordinate.lat,
    lng: coordinate.lng,
    address: null,
    openStatus: 'open',
    rating: 4.4,
    distanceToTrailheadMeters: 1000,
    confidence: { value: 0.82, reasons: ['Fixture candidate.'] },
    score,
    warnings: [],
  };
}

function placesAdapter(candidates) {
  return {
    id: 'route-places',
    isAvailable: () => true,
    async searchNearby(input) {
      const [category] = input.categories ?? [];
      return candidates
        .filter((candidate) => candidate.category === category)
        .map((candidate) => ({
          id: candidate.id,
          providerPlaceId: candidate.providerPlaceId,
          category: candidate.category,
          name: candidate.name,
          coordinate: { lat: candidate.lat, lng: candidate.lng },
          openStatus: candidate.openStatus,
          rating: candidate.rating,
          confidence: candidate.confidence.value,
          score: candidate.score,
        }));
    },
    async searchText() {
      return [];
    },
  };
}

function routingAdapter(costs, id = 'route-routing') {
  const calls = { matrix: 0, route: 0 };
  function pairCost(from, to) {
    const key = `${coordKey(from)}>${coordKey(to)}`;
    const reverseKey = `${coordKey(to)}>${coordKey(from)}`;
    const cost = costs[key] ?? costs[reverseKey];
    if (cost) return cost;
    return { distanceMeters: 50000, durationSeconds: 5000 };
  }
  return {
    id,
    calls,
    isAvailable: () => true,
    async computeRoute(input) {
      calls.route += 1;
      const points = [input.origin, ...(input.waypoints ?? []), input.destination].filter(Boolean);
      const totals = points.slice(1).reduce((sum, point, index) => {
        const cost = pairCost(points[index], point);
        return {
          distanceMeters: sum.distanceMeters + cost.distanceMeters,
          durationSeconds: sum.durationSeconds + cost.durationSeconds,
        };
      }, { distanceMeters: 0, durationSeconds: 0 });
      return {
        coordinates: points,
        distanceMeters: totals.distanceMeters,
        durationSeconds: totals.durationSeconds,
        providerMetadata: {
          routeCall: calls.route,
          waypointCount: input.waypoints?.length ?? 0,
        },
      };
    },
    async computeRouteMatrix(input) {
      calls.matrix += 1;
      const cells = [];
      input.origins.forEach((from, originIndex) => {
        input.destinations.forEach((to, destinationIndex) => {
          const cost = pairCost(from, to);
          cells.push({
            originIndex,
            destinationIndex,
            distanceMeters: cost.distanceMeters,
            durationSeconds: cost.durationSeconds,
            status: 'ok',
          });
        });
      });
      return { cells, providerMetadata: { matrixCall: calls.matrix } };
    },
  };
}

function baseCosts(overrides = {}) {
  return {
    [`${coordKey(origin)}>${coordKey(trailhead)}`]: { distanceMeters: 10000, durationSeconds: 1000 },
    [`${coordKey(origin)}>${coordKey(gas)}`]: { distanceMeters: 3500, durationSeconds: 350 },
    [`${coordKey(gas)}>${coordKey(trailhead)}`]: { distanceMeters: 3200, durationSeconds: 320 },
    [`${coordKey(origin)}>${coordKey(grocery)}`]: { distanceMeters: 4200, durationSeconds: 420 },
    [`${coordKey(grocery)}>${coordKey(trailhead)}`]: { distanceMeters: 3300, durationSeconds: 330 },
    [`${coordKey(gas)}>${coordKey(grocery)}`]: { distanceMeters: 1000, durationSeconds: 100 },
    [`${coordKey(origin)}>${coordKey(altGas)}`]: { distanceMeters: 28000, durationSeconds: 2700 },
    [`${coordKey(altGas)}>${coordKey(trailhead)}`]: { distanceMeters: 25000, durationSeconds: 2300 },
    ...overrides,
  };
}

async function contextFor(mode, candidates, costs) {
  const routing = routingAdapter(costs);
  const context = await generateRouteContext({
    trail: {
      id: `route-${mode}`,
      origin,
      explicitTrailhead: trailhead,
    },
    providerRegistry: createRouteContextProviderRegistry({
      routing,
      places: placesAdapter(candidates),
    }),
    selectedSupplyMode: mode,
    featureFlags,
  });
  return { context, routing };
}

async function main() {
  const directRouting = routingAdapter(baseCosts());
  const directContext = await generateRouteContext({
    trail: {
      id: 'direct-route',
      origin,
      explicitTrailhead: trailhead,
    },
    providerRegistry: createRouteContextProviderRegistry({ routing: directRouting }),
    selectedSupplyMode: 'none',
    featureFlags,
  });
  assert.strictEqual(directContext.status, 'ready');
  assert.deepStrictEqual(directContext.routeGeometry.segments.map((segment) => segment.id), ['origin_to_trailhead', 'full_approach_chain']);
  assert.strictEqual(directContext.routeGeometry.distanceMeters, 10000);
  assert.ok(directContext.routeGeometry.bbox);
  assert.ok(directContext.routeGeometry.corridor);
  assert.strictEqual(directRouting.calls.route, 1);

  const gasCandidate = supplyCandidate('gas-1', 'gas', gas);
  const groceryCandidate = supplyCandidate('grocery-1', 'grocery', grocery);
  const gasRoute = await contextFor('gas', [gasCandidate], baseCosts());
  assert.strictEqual(gasRoute.context.routeGeometry.providerMetadata.selectedSupplyCandidateIds[0], 'gas-1');
  assert.deepStrictEqual(gasRoute.context.routeGeometry.segments.map((segment) => segment.id), [
    'origin_to_refuel',
    'refuel_to_trailhead',
    'full_approach_chain',
  ]);

  const groceryRoute = await contextFor('grocery', [groceryCandidate], baseCosts());
  assert.strictEqual(groceryRoute.context.routeGeometry.providerMetadata.selectedSupplyCandidateIds[0], 'grocery-1');
  assert.deepStrictEqual(groceryRoute.context.routeGeometry.segments.map((segment) => segment.id), [
    'origin_to_resupply',
    'resupply_to_trailhead',
    'full_approach_chain',
  ]);

  const orderA = await contextFor('gas_and_grocery', [gasCandidate, groceryCandidate], baseCosts({
    [`${coordKey(origin)}>${coordKey(gas)}`]: { distanceMeters: 3000, durationSeconds: 300 },
    [`${coordKey(gas)}>${coordKey(grocery)}`]: { distanceMeters: 1000, durationSeconds: 100 },
    [`${coordKey(grocery)}>${coordKey(trailhead)}`]: { distanceMeters: 3000, durationSeconds: 300 },
    [`${coordKey(origin)}>${coordKey(grocery)}`]: { distanceMeters: 5000, durationSeconds: 500 },
    [`${coordKey(grocery)}>${coordKey(gas)}`]: { distanceMeters: 1000, durationSeconds: 100 },
    [`${coordKey(gas)}>${coordKey(trailhead)}`]: { distanceMeters: 5000, durationSeconds: 500 },
  }));
  assert.deepStrictEqual(
    orderA.context.selectedSupplyPlan.orderedStops.map((stop) => stop.category),
    ['gas', 'grocery'],
  );
  assert.deepStrictEqual(orderA.context.routeGeometry.segments.map((segment) => segment.id), [
    'origin_to_refuel',
    'refuel_to_resupply',
    'resupply_to_trailhead',
    'full_approach_chain',
  ]);

  const orderB = await contextFor('gas_and_grocery', [gasCandidate, groceryCandidate], baseCosts({
    [`${coordKey(origin)}>${coordKey(grocery)}`]: { distanceMeters: 2500, durationSeconds: 250 },
    [`${coordKey(grocery)}>${coordKey(gas)}`]: { distanceMeters: 1000, durationSeconds: 100 },
    [`${coordKey(gas)}>${coordKey(trailhead)}`]: { distanceMeters: 2500, durationSeconds: 250 },
    [`${coordKey(origin)}>${coordKey(gas)}`]: { distanceMeters: 6000, durationSeconds: 600 },
    [`${coordKey(gas)}>${coordKey(grocery)}`]: { distanceMeters: 1000, durationSeconds: 100 },
    [`${coordKey(grocery)}>${coordKey(trailhead)}`]: { distanceMeters: 6000, durationSeconds: 600 },
  }));
  assert.deepStrictEqual(
    orderB.context.selectedSupplyPlan.orderedStops.map((stop) => stop.category),
    ['gas', 'grocery'],
    'Default gas-and-grocery routing should keep refuel before resupply even when grocery-first is cheaper.',
  );
  assert.deepStrictEqual(
    orderB.context.routeGeometry.segments.map((segment) => segment.id),
    ['origin_to_refuel', 'refuel_to_resupply', 'resupply_to_trailhead', 'full_approach_chain'],
  );

  const adjacentChain = await contextFor('gas_and_grocery', [
    supplyCandidate('close-gas', 'gas', closeGas),
    supplyCandidate('chain-gas', 'gas', chainGas),
    supplyCandidate('far-grocery', 'grocery', farGrocery),
    supplyCandidate('adjacent-grocery', 'grocery', adjacentGrocery),
  ], baseCosts({
    [`${coordKey(origin)}>${coordKey(closeGas)}`]: { distanceMeters: 8500, durationSeconds: 850 },
    [`${coordKey(closeGas)}>${coordKey(trailhead)}`]: { distanceMeters: 1200, durationSeconds: 120 },
    [`${coordKey(closeGas)}>${coordKey(farGrocery)}`]: { distanceMeters: 40000, durationSeconds: 3600 },
    [`${coordKey(farGrocery)}>${coordKey(trailhead)}`]: { distanceMeters: 30000, durationSeconds: 3000 },
    [`${coordKey(origin)}>${coordKey(chainGas)}`]: { distanceMeters: 5000, durationSeconds: 500 },
    [`${coordKey(chainGas)}>${coordKey(trailhead)}`]: { distanceMeters: 5000, durationSeconds: 500 },
    [`${coordKey(chainGas)}>${coordKey(adjacentGrocery)}`]: { distanceMeters: 250, durationSeconds: 40 },
    [`${coordKey(adjacentGrocery)}>${coordKey(trailhead)}`]: { distanceMeters: 4800, durationSeconds: 480 },
  }));
  assert.strictEqual(
    adjacentChain.context.selectedSupplyPlan.gasCandidate.id,
    'chain-gas',
    'A slightly less perfect refuel stop should win when it creates a much better refuel/resupply/trailhead chain.',
  );
  assert.strictEqual(adjacentChain.context.selectedSupplyPlan.groceryCandidate.id, 'adjacent-grocery');
  assert.ok(adjacentChain.context.selectedSupplyPlan.score > 0.6);

  const farAdjacencyGuardrail = await contextFor('gas_and_grocery', [
    supplyCandidate('chain-gas', 'gas', chainGas),
    supplyCandidate('far-chain-gas', 'gas', farChainGas),
    supplyCandidate('near-grocery', 'grocery', nearGrocery),
    supplyCandidate('far-adjacent-grocery', 'grocery', farAdjacentGrocery),
  ], baseCosts({
    [`${coordKey(origin)}>${coordKey(chainGas)}`]: { distanceMeters: 6000, durationSeconds: 600 },
    [`${coordKey(chainGas)}>${coordKey(trailhead)}`]: { distanceMeters: 7000, durationSeconds: 700 },
    [`${coordKey(chainGas)}>${coordKey(nearGrocery)}`]: { distanceMeters: 1200, durationSeconds: 120 },
    [`${coordKey(nearGrocery)}>${coordKey(trailhead)}`]: { distanceMeters: 6500, durationSeconds: 650 },
    [`${coordKey(origin)}>${coordKey(farChainGas)}`]: { distanceMeters: 1000, durationSeconds: 100 },
    [`${coordKey(farChainGas)}>${coordKey(trailhead)}`]: { distanceMeters: 50000, durationSeconds: 4200 },
    [`${coordKey(farChainGas)}>${coordKey(farAdjacentGrocery)}`]: { distanceMeters: 120, durationSeconds: 30 },
    [`${coordKey(farAdjacentGrocery)}>${coordKey(trailhead)}`]: { distanceMeters: 50000, durationSeconds: 4200 },
  }));
  assert.strictEqual(
    farAdjacencyGuardrail.context.selectedSupplyPlan.gasCandidate.id,
    'chain-gas',
    'A far-away refuel stop should not win solely because it has an adjacent grocery candidate.',
  );
  assert.strictEqual(farAdjacencyGuardrail.context.selectedSupplyPlan.groceryCandidate.id, 'near-grocery');

  const ruralFallback = await contextFor('gas_and_grocery', [
    supplyCandidate('far-chain-gas', 'gas', farChainGas),
    supplyCandidate('far-adjacent-grocery', 'grocery', farAdjacentGrocery),
  ], baseCosts({
    [`${coordKey(origin)}>${coordKey(farChainGas)}`]: { distanceMeters: 22000, durationSeconds: 2200 },
    [`${coordKey(farChainGas)}>${coordKey(trailhead)}`]: { distanceMeters: 22000, durationSeconds: 2200 },
    [`${coordKey(farChainGas)}>${coordKey(farAdjacentGrocery)}`]: { distanceMeters: 120, durationSeconds: 30 },
    [`${coordKey(farAdjacentGrocery)}>${coordKey(trailhead)}`]: { distanceMeters: 22000, durationSeconds: 2200 },
  }));
  assert.ok(ruralFallback.context.selectedSupplyPlan.warnings.some((warning) => warning.code === 'supply_chain_rural_fallback'));
  assert.ok(ruralFallback.context.selectedSupplyPlan.warnings.some((warning) => warning.code === 'supply_chain_excessive_detour'));

  const chainRouting = routingAdapter(baseCosts({
    [`${coordKey(origin)}>${coordKey(grocery)}`]: { distanceMeters: 2500, durationSeconds: 250 },
    [`${coordKey(grocery)}>${coordKey(gas)}`]: { distanceMeters: 1000, durationSeconds: 100 },
    [`${coordKey(gas)}>${coordKey(trailhead)}`]: { distanceMeters: 2500, durationSeconds: 250 },
    [`${coordKey(origin)}>${coordKey(gas)}`]: { distanceMeters: 6000, durationSeconds: 600 },
    [`${coordKey(gas)}>${coordKey(grocery)}`]: { distanceMeters: 1000, durationSeconds: 100 },
    [`${coordKey(grocery)}>${coordKey(trailhead)}`]: { distanceMeters: 6000, durationSeconds: 600 },
  }));
  const chainContext = await generateRouteContext({
    trail: {
      id: 'trailhead-anchored-chain-route',
      origin,
      explicitTrailhead: trailhead,
      routeGeometry: {
        type: 'LineString',
        coordinates: [
          [trailhead.lng, trailhead.lat],
          [-109.98, 38.04],
          [-109.95, 38.08],
        ],
      },
    },
    providerRegistry: createRouteContextProviderRegistry({
      routing: chainRouting,
      places: placesAdapter([gasCandidate, groceryCandidate]),
    }),
    selectedSupplyMode: 'gas_and_grocery',
    featureFlags: chainFeatureFlags,
  });
  assert.deepStrictEqual(
    chainContext.selectedSupplyPlan.orderedStops.map((stop) => stop.category),
    ['gas', 'grocery'],
    'Trailhead-anchored supply chain should keep refuel before resupply even if grocery-first is cheaper.',
  );
  assert.deepStrictEqual(
    chainContext.selectedSupplyPlan.approachChain.orderedStops.map((stop) => stop.role),
    ['origin', 'refuel', 'resupply', 'trailhead', 'route_endpoint'],
  );
  assert.strictEqual(chainContext.selectedSupplyPlan.approachChain.anchorStrategy, 'trailhead_anchored');
  assert.strictEqual(chainContext.routeGeometry.destination.lng, -109.95);
  assert.ok(
    chainContext.routeGeometry.segments.some((segment) => segment.id === 'trailhead_to_route_end'),
    'Supply-aware route geometry should append designated trail route geometry after the trailhead.',
  );
  assert.deepStrictEqual(
    chainContext.routeGeometry.segments.map((segment) => segment.id).slice(0, 4),
    ['origin_to_refuel', 'refuel_to_resupply', 'resupply_to_trailhead', 'full_approach_chain'],
  );
  assert.strictEqual(chainContext.routeGeometry.providerMetadata.appendedTrailGeometryPointCount, 3);

  const missingOriginContext = await generateRouteContext({
    trail: {
      id: 'missing-origin-route',
      explicitTrailhead: trailhead,
    },
    providerRegistry: createRouteContextProviderRegistry({
      routing: routingAdapter(baseCosts()),
      places: placesAdapter([gasCandidate]),
    }),
    selectedSupplyMode: 'gas',
    featureFlags,
  });
  assert.strictEqual(missingOriginContext.status, 'partial');
  assert.strictEqual(missingOriginContext.routeGeometry.providerMetadata.source, 'partial_supply_chain_missing_origin');
  assert.deepStrictEqual(missingOriginContext.routeGeometry.segments.map((segment) => segment.id), [
    'refuel_to_trailhead',
    'full_approach_chain',
  ]);
  assert.deepStrictEqual(
    missingOriginContext.selectedSupplyPlan.approachChain.orderedStops.map((stop) => stop.role),
    ['refuel', 'trailhead'],
  );
  assert.ok(missingOriginContext.warnings.some((warning) => warning.code === 'missing_origin'));

  const providerUnavailable = await buildSupplyAwareRouteGeometry({
    trailId: 'provider-unavailable-route',
    origin,
    trailheadAnchor,
    selectedSupplyMode: 'gas',
    supplyCandidates: [gasCandidate],
    routingAdapter: createNoopRoutingProviderAdapter(),
  });
  assert.ok(providerUnavailable.routeGeometry);
  assert.strictEqual(providerUnavailable.routeGeometry.providerMetadata.source, 'ecs_haversine_route_fallback');
  assert.ok(providerUnavailable.warnings.some((warning) => warning.code === 'provider_unavailable'));
  assert.ok(providerUnavailable.warnings.some((warning) => warning.code === 'supply_chain_provider_distance_estimated'));

  const excessive = await buildSupplyAwareRouteGeometry({
    trailId: 'excessive-route',
    origin,
    trailheadAnchor,
    selectedSupplyMode: 'gas',
    supplyCandidates: [supplyCandidate('alt-gas', 'gas', altGas, 0.99)],
    routingAdapter: routingAdapter(baseCosts({
      [`${coordKey(origin)}>${coordKey(altGas)}`]: { distanceMeters: 45000, durationSeconds: 4200 },
      [`${coordKey(altGas)}>${coordKey(trailhead)}`]: { distanceMeters: 42000, durationSeconds: 3900 },
    })),
  });
  assert.ok(excessive.warnings.some((warning) => warning.code === 'excessive_detour'));
  assert.ok(excessive.warnings.some((warning) => warning.code === 'supply_chain_excessive_detour'));
}

main()
  .then(() => {
    console.log('Route Context supply-aware route geometry checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
