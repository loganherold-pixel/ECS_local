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
const costReportRegressionSource = read('scripts/test-mapbox-searchbox-billing-report.js');
const costReportSource = read('scripts/report-mapbox-searchbox-billing.js');
const smokeSource = read('scripts/smoke-app.mjs');

const checks = [
  check(
    'Shared billing event sink',
    has(guardSource, 'recordMapboxSearchBillingEvent') &&
      has(guardSource, 'analyzeMapboxSearchBillingEvents') &&
      has(guardSource, 'formatMapboxSearchBillingReadinessReport') &&
      has(guardSource, 'buildMapboxSearchBillingCostReport') &&
      has(guardSource, 'formatMapboxSearchBillingCostReport'),
    'The shared guard can capture, analyze, format billing risk, and build per-flow cost reports.',
    'Keep the event sink, readiness formatter, and cost-report builder in lib/mapboxSearchBillingGuard.ts.',
  ),
  check(
    'Real ECS flow cost attribution',
    [
      'navigate_destination_search',
      'trip_builder_itinerary_search',
      'trip_builder_route_context_places',
      'trip_builder_smart_resupply',
      'Forward geocode fallback is reported separately from Search Box sessions',
      'Coordinate reuse is counted as zero additional Mapbox search cost',
    ].every((token) => has(guardSource, token)),
    'The cost report attributes Search Box sessions, fallback geocoding, and coordinate reuse to named Navigate and Trip Builder flows.',
    'Keep MAPBOX_SEARCH_BILLING_FLOW_METADATA and fallback/coordinate notes in the shared billing guard.',
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
    'Per-flow cost report command',
    packageJson.scripts?.['report:mapbox-searchbox-billing'] === 'node scripts/report-mapbox-searchbox-billing.js' &&
      packageJson.scripts?.['test:mapbox-searchbox-billing-report'] === 'node ./scripts/test-mapbox-searchbox-billing-report.js' &&
      has(costReportSource, 'buildMapboxSearchBillingCostReport') &&
      has(costReportSource, '--events=<billing-events.json>') &&
      has(costReportSource, 'searchbox-session-unit-cost') &&
      has(costReportSource, 'max-searchbox-sessions-per-flow') &&
      has(costReportRegressionSource, 'Estimated total: USD 0\\.2020') &&
      has(costReportRegressionSource, 'unlabeled_mapbox_search'),
    'A rerunnable per-flow billing report script exists and has focused cost/risk regression coverage.',
    'Keep report:mapbox-searchbox-billing wired to scripts/report-mapbox-searchbox-billing.js and covered by test:mapbox-searchbox-billing-report.',
  ),
  check(
    'Pre-ship command exposure',
    packageJson.scripts?.['gate:mapbox-searchbox-billing'] === 'node scripts/check-mapbox-searchbox-billing-readiness.mjs' &&
      packageJson.scripts?.['test:mapbox-searchbox-session-reuse'] === 'node ./scripts/test-mapbox-searchbox-session-reuse.js' &&
      packageJson.scripts?.['test:mapbox-searchbox-billing-report'] === 'node ./scripts/test-mapbox-searchbox-billing-report.js' &&
      has(smokeSource, 'mapbox-searchbox-session-reuse'),
    'The billing readiness gate and regressions are exposed through package scripts/smoke.',
    'Expose gate:mapbox-searchbox-billing and keep focused billing regressions in package scripts.',
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
