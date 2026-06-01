# ECS Route Context Engine

The Route Context Engine is a silent, feature-flagged background domain layer for Trip Builder route planning. It resolves a normalized trailhead anchor, searches provider-agnostic supply candidates, prepares route geometry, and stores partial or ready context for Trip Builder to consume without changing the Trip Builder page order or layout.

## Triggering

Trip Builder calls `routeContextOrchestrator.prefetchForTrailSelection` after a trail, hidden gem, imported route, or trip target is selected. That prefetch is gated by both `ecs.routeContextEngine.enabled` and `ecs.routeContextEngine.prefetchOnTrailSelect`.

Trip Builder can also call `routeContextOrchestrator.getContext` when the itinerary flow needs the current cached result. A read without a trail object is cache-only. A read with a trail object may enqueue background generation when the engine is enabled, so selection-time code should prefer cache-only reads plus feature-flagged prefetch.

## Trip Builder Integration

Trip Builder keeps the existing screens, controls, and user choices. Route context is adapted through `lib/tripBuilder/routeContextTripBuilderAdapter.ts`:

- `routeWithRouteContext` enriches the existing route input with a resolved trailhead, route line, distance, and duration when usable context is available.
- `routeContextToTripBuilderItineraryContext` passes confidence, warnings, supply mode, supply plan, and geometry into the itinerary generator.
- `routeContextSupplyCandidatesToResupplyPoints` maps gas and grocery candidates into the existing Smart Resupply data shape.

If context is `idle`, `queued`, `error`, unavailable, or incomplete for a needed field, Trip Builder falls back to its existing route, itinerary, and map-search behavior.

## Provider Adapters

The domain layer does not depend on Google, Mapbox, or any provider SDK. Providers are normalized through adapters in `lib/routeContext/routeContextAdapters.ts`:

- `RoutingProviderAdapter` computes routes and matrices.
- `PlacesProviderAdapter` searches nearby/text places and optionally details.
- Optional camp and bailout adapters can be registered when those features are enabled.

Adapters are responsible for vendor-specific place types and raw provider payloads. UI-facing domain objects should only receive normalized fields plus optional `providerMetadata`.

## Feature Flags

- `ecs.routeContextEngine.enabled`: master switch. Defaults off.
- `ecs.routeContextEngine.prefetchOnTrailSelect`: allows trail selection to start silent background prefetch. Defaults off.
- `ecs.routeContextEngine.enableCampCandidates`: allows future camp candidate generation. Defaults off.
- `ecs.routeContextEngine.enableBailoutCandidates`: allows future bailout candidate generation. Defaults off.
- `ecs.routeContextEngine.debugLogging`: enables redacted Route Context debug logs. Defaults off.

When the master flag is off, dependent route context flags resolve to off.

## Privacy And Persistence

Telemetry uses sanitized properties only: IDs, status, confidence bucket, warning codes, duration bucket, candidate counts, cache state, and provider availability booleans. It must not include precise origin/destination coordinates, full polylines, addresses, place names, API keys, or location traces.

The orchestrator cache is in memory. Exact user origin is used only for the active context/job and a coarse origin bucket in the cache key.

## Testing

Focused Route Context checks:

```sh
npm run test:trailhead-resolver
npm run test:route-context-geometry
npm run test:route-context-adapters
npm run test:route-context-engine
npm run test:route-context-orchestrator
npm run test:route-context-cache
npm run test:route-context-telemetry
npm run test:route-context-supply-discovery
npm run test:route-context-supply-routes
npm run test:route-context-camp-candidates
npm run test:route-context-bailout-candidates
```

Trip Builder integration checks:

```sh
npm run test:trip-builder-route-context
npm run test:trip-builder-route-context-itinerary
npm run test:trip-builder-core
npm run test:trip-builder-ui
npm run test:smart-resupply-planner
```

Before shipping changes, also run `npx tsc --noEmit --pretty false`, `npm run lint`, and `npm run build`.
