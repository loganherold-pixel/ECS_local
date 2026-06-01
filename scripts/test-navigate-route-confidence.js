const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const summarySource = fs.readFileSync(path.join(root, 'lib', 'remote', 'routeConfidenceSummary.ts'), 'utf8');
const readinessSource = fs.readFileSync(path.join(root, 'lib', 'routeGuidanceReadinessPresentation.ts'), 'utf8');
const overlaySource = fs.readFileSync(path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx'), 'utf8');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  summarySource,
  "import { computeRouteConfidence } from './remoteEngine';",
  'Navigate route confidence summary should use the deterministic remoteness engine.',
);
assertIncludes(
  summarySource,
  'chipLabel: `Route Confidence: ${result.confidence}%`',
  'Route confidence summary should expose the required Route Confidence percent chip.',
);
assertIncludes(
  summarySource,
  'No signal expected for ${formatMiles(args.deadZoneLengthMi)}',
  'Route confidence summary should support no-signal-ahead microcopy.',
);
assertIncludes(
  summarySource,
  'Signal in ~${formatMiles(args.distanceToDeadZoneMi)}',
  'Route confidence summary should support signal forecast microcopy.',
);
assertIncludes(
  summarySource,
  "'High Remoteness - Prepare'",
  'Route confidence summary should surface high-remoteness preparation copy.',
);

assertIncludes(
  readinessSource,
  'routeConfidenceSummary: NavigateRouteConfidenceSummary | null;',
  'Start Guidance readiness view model should carry the numeric confidence summary.',
);
assertIncludes(
  readinessSource,
  '`${args.routeConfidenceSummary.confidence}%`',
  'Readiness Route Confidence row should display numeric confidence when available.',
);
assertIncludes(
  readinessSource,
  "args.routeConfidenceSummary?.status === 'red'",
  'Red numeric route confidence should recommend reviewing the route.',
);

assertNotIncludes(
  overlaySource,
  'function RouteConfidencePill',
  'RoadNavigationOverlay should not render the removed Route Confidence visual pill.',
);
assertNotIncludes(
  overlaySource,
  '<RouteConfidencePill',
  'Route Confidence must not appear as a standalone preview/active overlay container.',
);
assertNotIncludes(
  overlaySource,
  'routeConfidencePill',
  'Removed Route Confidence pill styles should not remain in the overlay.',
);
assertNotIncludes(
  overlaySource,
  'routeConfidenceStatusDot',
  'Removed Route Confidence status-dot visual should not remain in the overlay.',
);
assertNotIncludes(
  overlaySource + navigateSource,
  'RouteConfidenceModal',
  'Route confidence should not introduce a new modal.',
);
assertNotIncludes(
  overlaySource + navigateSource,
  'routeConfidenceBanner',
  'Route confidence should avoid duplicate standalone banners.',
);

assertIncludes(
  navigateSource,
  "import { buildNavigateRouteConfidenceSummary } from '../../lib/remote/routeConfidenceSummary';",
  'Navigate should import the route confidence summary adapter.',
);
assertIncludes(
  navigateSource,
  'const navigateRouteConfidenceSummary = useMemo(',
  'Navigate should derive route confidence from current route inputs.',
);
assertIncludes(
  navigateSource,
  'routePoints: displayedRoutePoints',
  'Route confidence should update from displayed route geometry.',
);
assertIncludes(
  navigateSource,
  'segmentFeatures: displayedSegmentFeatures',
  'Route confidence should update from route remoteness segment features.',
);
assertIncludes(
  navigateSource,
  'powerHours: resourceForecast?.power.availableHours ?? null',
  'Route confidence should use existing resource forecast power hours.',
);
assertIncludes(
  navigateSource,
  'weatherRisk: (weatherSeveritySummary?.score ?? 0) / 3',
  'Route confidence should include existing weather risk severity.',
);
assertIncludes(
  navigateSource,
  'routeConfidenceSummary: navigateRouteConfidenceSummary',
  'Preview and active contexts should keep route confidence available to readiness/internal logic.',
);
assertIncludes(
  navigateSource,
  'routeConfidenceSummary: navigateRouteConfidenceSummary,\n    });',
  'Start Guidance readiness stack should receive the numeric route confidence summary.',
);

assertIncludes(
  packageSource,
  '"test:navigate-route-confidence": "node ./scripts/test-navigate-route-confidence.js"',
  'package.json should expose the navigate route confidence regression test.',
);

console.log('Navigate route confidence presentation checks passed.');
