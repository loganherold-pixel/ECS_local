const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
const tripBuilderIndex = fs.readFileSync(path.join(root, 'lib', 'tripBuilder', 'index.ts'), 'utf8');

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), `${message} missing expected source: ${needle}`);
}

assertIncludes(
  screen,
  "import { useThrottledGPS } from '../lib/useThrottledGPS';",
  'Trip Builder should subscribe to the shared live GPS pipeline instead of relying only on the Explore handoff',
);
assertIncludes(
  screen,
  'const tripBuilderNeedsLivePosition =',
  'Trip Builder should expose an explicit live-position gate for route-picker performance',
);
assertIncludes(
  screen,
  'const tripBuilderGps = useThrottledGPS({ enabled: tripBuilderNeedsLivePosition, highAccuracy: true });',
  'Trip Builder should acquire a shared high-accuracy GPS fix only while planning needs position',
);
assertIncludes(
  screen,
  'tripBuilderGps.rawGPS.position ?? tripBuilderGps.position',
  'Trip Builder should prefer raw shared GPS samples for route-context origin precision',
);
assertIncludes(
  screen,
  'const liveTripBuilderUserLocation = useMemo',
  'Trip Builder should normalize live GPS into a TripItinerary userStart coordinate',
);
assertIncludes(
  screen,
  'if (!tripSetupStarted && !planModalVisible) {',
  'Trip Builder should not churn Route Context lookups while the route picker is idle',
);
assertIncludes(
  screen,
  'origin: planningRouteContextOrigin,',
  'Route Context prefetch and lookups should use the stable captured trip origin',
);
assertIncludes(
  screen,
  'const routeContextProviderRegistry = useMemo',
  'Trip Builder should create a provider registry once the Mapbox token is available',
);
assertIncludes(
  screen,
  'providerRegistry: routeContextProviderRegistry,',
  'Route Context calls should receive the live Mapbox provider registry',
);
assertIncludes(
  screen,
  'const liveApproachRoutePoints = useMemo(',
  'Trip Builder should expose only approach geometry matching the current request fingerprint',
);
assertIncludes(
  screen,
  'suggestedRoute: liveItinerarySuggestedRoute',
  'Trip Builder should build the draft itinerary from the live-enriched route',
);
assertIncludes(
  screen,
  'userLocation: selectedTripOrigin ?? handoffItinerary?.userStart ?? null',
  'Trip Builder should build the itinerary from the selected trip origin instead of reranking on GPS jitter',
);
assertIncludes(
  screen,
  'preTrailStopCandidates: preTrailStopCandidatesForDraft',
  'Trip Builder should feed live pre-trail POI candidates into the itinerary builder',
);
assertIncludes(
  screen,
  'preTrailProviderStates: preTrailProviderStatesForDraft',
  'Trip Builder should preserve independent pending, empty, and error states for fuel and supply provider requests',
);
assertIncludes(
  screen,
  'currentLocation: selectedTripOrigin,',
  'Trip plans should pass the stable selected origin into Smart Resupply planning',
);
assertIncludes(
  screen,
  'createMapboxRouteContextProviderRegistry',
  'Trip Builder should wire Route Context to Mapbox-backed route and POI providers',
);
assertIncludes(
  tripBuilderIndex,
  "export * from './mapboxRouteContextAdapters';",
  'Trip Builder barrel should export Mapbox Route Context adapters for tests and app wiring',
);

console.log('Trip Builder live wiring checks passed.');
