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
  "import { useGPSLocation } from '../lib/useGPSLocation';",
  'Trip Builder should subscribe to live GPS instead of relying only on the Explore handoff',
);
assertIncludes(
  screen,
  'const tripBuilderGps = useGPSLocation({ enabled: true, highAccuracy: true });',
  'Trip Builder should acquire a live high-accuracy GPS fix while planning',
);
assertIncludes(
  screen,
  'const liveTripBuilderUserLocation = useMemo',
  'Trip Builder should normalize live GPS into a TripItinerary userStart coordinate',
);
assertIncludes(
  screen,
  'origin: liveRouteContextOrigin,',
  'Route Context prefetch and lookups should use live GPS as the approach origin',
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
  'const [liveApproachRoutePoints',
  'Trip Builder should keep live approach geometry for the itinerary builder',
);
assertIncludes(
  screen,
  'suggestedRoute: liveItinerarySuggestedRoute',
  'Trip Builder should build the draft itinerary from the live-enriched route',
);
assertIncludes(
  screen,
  'userLocation: liveTripBuilderUserLocation ?? handoffItinerary?.userStart ?? null',
  'Trip Builder should recover pending GPS handoffs when live location becomes available',
);
assertIncludes(
  screen,
  'preTrailStopCandidates: preTrailStopCandidatesForDraft',
  'Trip Builder should feed live pre-trail POI candidates into the itinerary builder',
);
assertIncludes(
  screen,
  'preTrailProviderAvailable: preTrailProviderAvailableForDraft',
  'Trip Builder should report the POI provider as wired once searches have run',
);
assertIncludes(
  screen,
  'currentLocation: liveTripBuilderUserLocation,',
  'Trip plans should pass current location into smart resupply planning',
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
