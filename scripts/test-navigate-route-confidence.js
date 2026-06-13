const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readSource(...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');
}

const summarySource = readSource('lib', 'remote', 'routeConfidenceSummary.ts');
const readinessSource = readSource('lib', 'routeGuidanceReadinessPresentation.ts');
const timelineSource = readSource('lib', 'routeContext', 'routeConfidenceTimeline.ts');
const routeContextTypesSource = readSource('lib', 'routeContext', 'routeContextTypes.ts');
const routeContextIndexSource = readSource('lib', 'routeContext', 'index.ts');
const overlaySource = readSource('components', 'navigate', 'RoadNavigationOverlay.tsx');
const navigateSource = readSource('app', '(tabs)', 'navigate.tsx');
const packageSource = readSource('package.json');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function sourceSliceBetween(source, startFragment, endFragment, message) {
  const start = source.indexOf(startFragment);
  assert.ok(start >= 0, message || `Missing start fragment ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.ok(end > start, `Missing end fragment ${endFragment}`);
  return source.slice(start, end);
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
  timelineSource,
  'export function buildRouteConfidenceTimeline',
  'Route Context Engine should expose a deterministic Route Confidence Timeline builder.',
);
assertIncludes(
  timelineSource,
  'routeConfidenceTimelineItemCopy',
  'Route Confidence Timeline should own safety copy for uncertainty versus known risk.',
);
assertIncludes(
  routeContextTypesSource,
  'routeConfidenceTimeline?: RouteConfidenceTimeline | null;',
  'Route Context contract should carry an optional feature-flagged Route Confidence Timeline.',
);
assertIncludes(
  routeContextIndexSource,
  "export * from './routeConfidenceTimeline';",
  'Route Confidence Timeline should be exported from the Route Context public barrel.',
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
  navigateSource,
  "import { buildRouteConfidenceTimeline, isRouteConfidenceTimelineFeatureEnabled, routeConfidenceTimelineItemCopy",
  'Navigate should import the Route Context timeline contract and safety-copy helper.',
);
assertIncludes(
  navigateSource,
  'const routeConfidenceTimelineEnabled = isRouteConfidenceTimelineFeatureEnabled()',
  'Navigate should keep the Route Confidence Timeline behind a feature flag.',
);
assertIncludes(
  navigateSource,
  'function routeConfidenceTimelineMatchesRoute(',
  'Navigate should validate timeline route and geometry identity before rendering spans.',
);
assertIncludes(
  navigateSource,
  'routeConfidenceTimelineMatchesRoute(navigateRouteConfidenceTimeline, intelRouteContext.routeId, intelRouteContext.routeFingerprint)',
  'Navigate should compare the timeline against the selected route ID and route geometry version.',
);
assertIncludes(
  navigateSource,
  'const navigateRouteConfidenceTimeline = useMemo(',
  'Navigate should derive the route confidence timeline from current route context.',
);
assertIncludes(
  navigateSource,
  'const validNavigateRouteConfidenceTimeline = useMemo(',
  'Navigate should clear or mark stale previous timelines unavailable when route identity changes.',
);
assertIncludes(
  navigateSource,
  'RouteConfidenceTimelinePanel',
  'Navigate should render a compact Route Confidence Timeline panel.',
);
assertIncludes(
  navigateSource,
  'routeConfidenceTimelineEnabled ? (',
  'Navigate should render the Route Confidence Timeline only when enabled.',
);
assertIncludes(
  navigateSource,
  'What certainty changes along this route?',
  'Route Confidence Timeline should explain the non-blocking comprehension layer.',
);
assertIncludes(
  navigateSource,
  'Unknown/low confidence means uncertainty, not confirmed danger.',
  'Navigate copy should separate uncertainty from known risk.',
);
assertIncludes(
  navigateSource,
  'Route confidence timeline unavailable.',
  'Navigate should gracefully fall back when timeline data is unavailable.',
);
assertIncludes(
  navigateSource,
  'Timeline limited by available source data.',
  'Navigate should label partial or source-limited timelines honestly.',
);
assertIncludes(
  navigateSource,
  'Showing notable confidence changes only.',
  'Navigate should not imply full-route confidence for notable-spans-only timelines.',
);
assertIncludes(
  navigateSource,
  'No notable confidence changes from available sources.',
  'Navigate should avoid implying full-route safety when no notable spans render.',
);
assertIncludes(
  navigateSource,
  'handleRouteConfidenceTimelineItemPress',
  'Navigate should link timeline item selection to map-oriented segment detail behavior.',
);
assertIncludes(
  navigateSource,
  'Source: {routeConfidenceTimelineSourceName(selectedItem.primaryDriver.source)}',
  'Expanded route confidence details should expose primary source provenance.',
);
assertIncludes(
  navigateSource,
  'Freshness: {selectedItem.primaryDriver.source.freshness.replace(/_/g, \' \')}',
  'Expanded route confidence details should expose source freshness.',
);
assertIncludes(
  navigateSource,
  'Observed: {routeConfidenceTimelineTimestampLabel(selectedItem.primaryDriver.source.observedAt)}',
  'Expanded route confidence details should expose observed timestamps when available.',
);
assertIncludes(
  navigateSource,
  'Generated: {routeConfidenceTimelineTimestampLabel(selectedItem.primaryDriver.source.generatedAt)}',
  'Expanded route confidence details should expose generated timestamps when available.',
);
assertIncludes(
  navigateSource,
  'Expires: {routeConfidenceTimelineTimestampLabel(selectedItem.primaryDriver.source.expiresAt)}',
  'Expanded route confidence details should expose source expiry when available.',
);
assertIncludes(
  navigateSource,
  'Contributing drivers: {routeConfidenceTimelineDriverSummary(selectedItem)}',
  'Expanded route confidence details should list contributing drivers.',
);
assertIncludes(
  navigateSource,
  'Unknown source',
  'Missing source metadata should fall back to Unknown source, not fake certainty.',
);
assertIncludes(
  navigateSource,
  'Stale/unavailable source metadata present.',
  'Stale or unavailable source details should be visible in segment detail.',
);
assertIncludes(
  navigateSource,
  'Timeline diagnostics do not affect route readiness or route choice.',
  'Navigate should explicitly keep timeline diagnostics explanatory only.',
);

const timelinePanelSource = sourceSliceBetween(
  navigateSource,
  'function RouteConfidenceTimelinePanel({',
  'function formatNavDuration(',
  'RouteConfidenceTimelinePanel source should be present.',
);
[
  'dangerous',
  'unsafe',
  'do not proceed',
  'hazard confirmed',
  'Route confidence verified',
  'All other sections safe',
  'No risk detected',
].forEach((fragment) => {
  assertNotIncludes(
    timelinePanelSource.toLowerCase(),
    fragment.toLowerCase(),
    `Timeline panel should not use forbidden certainty/danger wording: ${fragment}`,
  );
});

const timelinePressHandlerSource = sourceSliceBetween(
  navigateSource,
  'const handleRouteConfidenceTimelineItemPress = useCallback((item: RouteConfidenceTimelineItem) => {',
  'const handleOpenOfflineCache = useCallback(',
  'Route confidence timeline press handler should be present.',
);
assertIncludes(
  timelinePressHandlerSource,
  'setSelectedRouteConfidenceTimelineItemId(item.id)',
  'Clicking a timeline segment should only select/expand segment detail.',
);
assertIncludes(
  timelinePressHandlerSource,
  "reason: 'route_confidence_timeline_focus'",
  'Clicking a timeline segment may link to the map as explanatory focus.',
);
[
  'routeStore.setActive',
  'routeStore.update',
  'roadNavigation.start',
  'setIntelReadinessStack',
  'setCampDecisionClock',
  'avoidance',
  'blocker',
  'rerank',
].forEach((fragment) => {
  assertNotIncludes(
    timelinePressHandlerSource,
    fragment,
    `Timeline interaction must not mutate route choice/readiness: ${fragment}`,
  );
});

assertIncludes(
  packageSource,
  '"test:navigate-route-confidence": "node ./scripts/test-navigate-route-confidence.js"',
  'package.json should expose the navigate route confidence regression test.',
);
assertIncludes(
  packageSource,
  '"test:route-confidence-timeline": "node ./scripts/test-route-confidence-timeline.js"',
  'package.json should expose the Route Confidence Timeline regression test.',
);

console.log('Navigate route confidence presentation checks passed.');
