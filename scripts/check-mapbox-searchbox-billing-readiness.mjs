import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = process.argv.includes('--json');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function has(source, token) {
  return source.includes(token);
}

function check(label, passed, detail, remediation) {
  return { label, passed, detail, remediation };
}

const packageJson = JSON.parse(read('package.json'));
const guardSource = read('lib/mapboxSearchBillingGuard.ts');
const roadSource = read('lib/mapboxRoadNavigation.ts');
const tripBuilderSource = read('app/explore-trip-builder.tsx');
const routeContextSource = read('lib/tripBuilder/mapboxRouteContextAdapters.ts');
const navigateSource = read('lib/useRoadNavigation.ts');
const regressionSource = read('scripts/test-mapbox-searchbox-session-reuse.js');
const smokeSource = read('scripts/smoke-app.mjs');

const checks = [
  check(
    'Shared billing event sink',
    has(guardSource, 'recordMapboxSearchBillingEvent') &&
      has(guardSource, 'analyzeMapboxSearchBillingEvents') &&
      has(guardSource, 'formatMapboxSearchBillingReadinessReport'),
    'The shared guard can capture, analyze, and format Mapbox Search Box billing risk.',
    'Keep the event sink and readiness formatter in lib/mapboxSearchBillingGuard.ts.',
  ),
  check(
    'Search Box suggest instrumentation',
    has(roadSource, "operation: 'searchbox_suggest'") &&
      has(roadSource, "operation: 'forward_geocode_fallback'") &&
      has(roadSource, "operation: 'searchbox_retrieve'") &&
      has(roadSource, "operation: 'coordinate_reuse'"),
    'The shared road-search helper records suggest, retrieve, truthful fallback, and coordinate reuse events.',
    'Instrument searchRoadDestinations and resolveRoadDestination before shipping new Mapbox search flows.',
  ),
  check(
    'Trip Builder smart resupply flow labels',
    has(tripBuilderSource, "flow: 'trip_builder_smart_resupply'") &&
      has(tripBuilderSource, "flow: 'trip_builder_itinerary_search'"),
    'Trip Builder labels both approach resupply and manual itinerary search events.',
    'Pass billingContext through Trip Builder suggest/retrieve call sites.',
  ),
  check(
    'Route Context places flow labels',
    has(routeContextSource, "flow: 'trip_builder_route_context_places'"),
    'Route Context Mapbox places lookups are visible as a separate Trip Builder billing flow.',
    'Pass billingContext through createMapboxPlacesProviderAdapter search/retrieve calls.',
  ),
  check(
    'Navigate destination flow labels',
    has(navigateSource, "flow: 'navigate_destination_search'"),
    'Navigate destination search and selection are visible as a billing flow.',
    'Pass billingContext through useRoadNavigation search and resolve calls.',
  ),
  check(
    'Actionable overuse regression',
    has(regressionSource, '2 Search Box sessions') &&
      has(regressionSource, 'duplicate suggest') &&
      has(regressionSource, 'retrieve after quota fallback') &&
      has(regressionSource, 'Remediation:'),
    'The regression fails with flow-specific reasons for session fan-out, duplicate suggests, and quota fallback retrieve.',
    'Keep risky fixture assertions in scripts/test-mapbox-searchbox-session-reuse.js.',
  ),
  check(
    'Pre-ship command exposure',
    packageJson.scripts?.['gate:mapbox-searchbox-billing'] === 'node scripts/check-mapbox-searchbox-billing-readiness.mjs' &&
      packageJson.scripts?.['test:mapbox-searchbox-session-reuse'] === 'node ./scripts/test-mapbox-searchbox-session-reuse.js' &&
      has(smokeSource, 'mapbox-searchbox-session-reuse'),
    'The billing readiness gate and regression are exposed through package scripts/smoke.',
    'Expose gate:mapbox-searchbox-billing and keep smoke-app running test-mapbox-searchbox-session-reuse.js.',
  ),
];

const blockers = checks.filter((item) => !item.passed);
const result = {
  status: blockers.length === 0 ? 'pass' : 'fail',
  generatedAt: new Date().toISOString(),
  checks,
  blockers,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Mapbox Search Box billing readiness: ${result.status.toUpperCase()}`);
  for (const item of checks) {
    console.log(`- ${item.passed ? 'PASS' : 'FAIL'} ${item.label}: ${item.detail}`);
    if (!item.passed) {
      console.log(`  Remediation: ${item.remediation}`);
    }
  }
}

if (blockers.length > 0) {
  process.exit(1);
}
