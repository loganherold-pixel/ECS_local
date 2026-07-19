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
  buildApproachResupplySearchAnchors,
  evaluateApproachResupplyOptions: evaluateStrict,
  rankApproachResupplyOptions: rankStrict,
} = require(path.join(root, 'lib', 'tripBuilder', 'approachResupplyPlanner.ts'));
const {
  retainEquivalentResupplyOptions,
} = require(path.join(root, 'lib', 'tripBuilder', 'resupplyPlaceIdentity.ts'));
const evaluateApproachResupplyOptions = (args) => evaluateStrict({ requireRoutedAccess: false, ...args });
const rankApproachResupplyOptions = (args) => rankStrict({ requireRoutedAccess: false, ...args });

const origin = { latitude: 39.0, longitude: -121.4 };
const trailhead = { latitude: 40.0, longitude: -121.4 };
const approachRoute = [
  origin,
  { latitude: 39.35, longitude: -121.4 },
  { latitude: 39.7, longitude: -121.4 },
  { latitude: 39.9, longitude: -121.4 },
  trailhead,
];

const remoteBoundaryAnchors = buildApproachResupplySearchAnchors({
  trailhead,
  approachRoute,
  remoteEntryProgressRatio: 0.88,
});
assert.ok(
  remoteBoundaryAnchors.some((anchor) => anchor.progressRatio === 1),
  'Smart Resupply discovery must include the exact practical trail entry.',
);
assert.strictEqual(
  remoteBoundaryAnchors[remoteBoundaryAnchors.length - 1].basis,
  'trailhead_fallback',
  'Remote-entry search anchors should still keep the trailhead as the final fallback.',
);

const trailEdgeInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  candidates: [
    {
      id: 'remote-trailhead-edge-fuel',
      title: 'Remote Edge Fuel',
      category: 'fuel',
      coordinate: { latitude: 39.996, longitude: -121.399 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      score: 0.98,
    },
    {
      id: 'last-town-fuel-before-entry',
      title: 'Last Town Fuel Before Entry',
      category: 'fuel',
      coordinate: { latitude: 39.91, longitude: -121.397 },
      sourceType: 'mapbox_search',
      confidence: 'medium',
      score: 0.72,
    },
    {
      id: 'mid-corridor-fuel',
      title: 'Mid Corridor Fuel',
      category: 'fuel',
      coordinate: { latitude: 39.55, longitude: -121.4 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      score: 0.95,
    },
  ],
  limit: 3,
});
const ranked = trailEdgeInventory.ranked;

assert.strictEqual(
  ranked[0].id,
  'remote-trailhead-edge-fuel',
  'Smart Resupply should prefer the last valid stop before practical trail entry.',
);
assert.ok(
  ranked.some((option) => option.id === 'remote-trailhead-edge-fuel'),
  'An inferred service-loss marker must not exclude a valid stop before practical entry.',
);
assert.ok(
  ranked.find((option) => option.id === 'mid-corridor-fuel')?.rank > ranked.find((option) => option.id === 'remote-trailhead-edge-fuel')?.rank,
  'Earlier civilization stops should not beat the last viable pre-entry stop when both are close to the approach route.',
);

const remoteBoundaryInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  remoteEntryProgressRatio: 0.88,
  candidates: [
    {
      id: 'beyond-remote-entry-fuel',
      title: 'Remote Entry Fuel',
      category: 'fuel',
      coordinate: { latitude: 39.94, longitude: -121.399 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      score: 0.99,
    },
    {
      id: 'civilization-exit-fuel',
      title: 'Civilization Exit Fuel',
      category: 'fuel',
      coordinate: { latitude: 39.84, longitude: -121.397 },
      sourceType: 'mapbox_search',
      confidence: 'medium',
      score: 0.72,
    },
    {
      id: 'early-city-fuel',
      title: 'Early City Fuel',
      category: 'fuel',
      coordinate: { latitude: 39.52, longitude: -121.4 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      score: 0.96,
    },
  ],
  limit: 3,
});

assert.strictEqual(
  remoteBoundaryInventory.ranked[0].id,
  'beyond-remote-entry-fuel',
  'Practical trail entry, not an earlier remoteness ratio, defines the final valid stop.',
);
assert.ok(
  remoteBoundaryInventory.ranked.some((option) => option.id === 'beyond-remote-entry-fuel'),
  'A candidate before practical entry remains eligible despite an earlier service-loss estimate.',
);
assert.ok(
  remoteBoundaryInventory.ranked.find((option) => option.id === 'early-city-fuel')?.rank > remoteBoundaryInventory.ranked.find((option) => option.id === 'beyond-remote-entry-fuel')?.rank,
  'Early city stops should not beat the last viable pre-remote-entry stop when both are close to the approach route.',
);

const longApproachOrigin = { latitude: 35.0, longitude: -117.0 };
const longApproachTrailhead = { latitude: 45.0, longitude: -117.0 };
const longApproachRoute = [
  longApproachOrigin,
  { latitude: 38.0, longitude: -117.0 },
  { latitude: 41.0, longitude: -117.0 },
  { latitude: 43.5, longitude: -117.0 },
  longApproachTrailhead,
];
const longApproachRanked = rankApproachResupplyOptions({
  category: 'fuel',
  origin: longApproachOrigin,
  trailhead: longApproachTrailhead,
  approachRoute: longApproachRoute,
  remoteEntryProgressRatio: 0.88,
  candidates: [
    {
      id: 'early-high-provider-fuel',
      title: 'Early High Provider Fuel',
      category: 'fuel',
      coordinate: { latitude: 41.0, longitude: -117.0 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      score: 0.99,
    },
    {
      id: 'last-viable-before-remote-fuel',
      title: 'Last Viable Before Remote Fuel',
      category: 'fuel',
      coordinate: { latitude: 43.4, longitude: -117.0 },
      sourceType: 'mapbox_search',
      confidence: 'low',
      score: 0.55,
    },
    {
      id: 'remote-edge-fuel',
      title: 'Remote Edge Fuel',
      category: 'fuel',
      coordinate: { latitude: 44.2, longitude: -117.0 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      score: 0.99,
    },
  ],
  limit: 3,
});
assert.strictEqual(
  longApproachRanked[0].id,
  'remote-edge-fuel',
  'Long approaches should prefer the last valid stop before exact entry, independent of provider popularity.',
);
assert.ok(
  longApproachRanked.find((option) => option.id === 'early-high-provider-fuel')?.rank > longApproachRanked.find((option) => option.id === 'remote-edge-fuel')?.rank,
  'High provider confidence alone should not pull Smart Resupply hundreds of miles before the remote-entry corridor.',
);

const refreshEvidence = (option) => ({
  stableKey: option.stableKey,
  title: option.title,
  subtitle: option.subtitle,
  coordinate: option.coordinate,
  distanceFromRouteStartMiles: option.distanceFromRouteStartMiles,
  distanceFromOriginMiles: option.distanceFromOriginMiles,
  distanceFromTrailheadMiles: option.distanceFromTrailheadMiles,
  distanceFromApproachRouteMiles: option.distanceFromApproachRouteMiles,
  routeDeviationMiles: option.routeDeviationMiles,
  detourDurationMinutes: option.detourDurationMinutes,
  remainingApproachMilesToTrailhead: option.remainingApproachMilesToTrailhead,
  distanceBeforeRemoteEntryMiles: option.distanceBeforeRemoteEntryMiles,
  approachProgressRatio: option.approachProgressRatio,
  approachScore: option.approachScore,
  rank: option.rank,
  beforeTrailEntry: option.beforeTrailEntry,
  beforeRemoteEntry: option.beforeRemoteEntry,
  fallbackState: option.fallbackState,
  routeEvidenceState: option.routeEvidenceState,
  routeAwareConfidence: option.routeAwareConfidence,
  remoteEntrySource: option.remoteEntrySource,
  remoteEntryConfidence: option.remoteEntryConfidence,
  remoteEntryEstimated: option.remoteEntryEstimated,
  remoteEntryLabel: option.remoteEntryLabel,
  categoryCoverage: option.categoryCoverage,
  operatingStatus: option.operatingStatus,
  providerConfidence: option.providerConfidence,
  coordinateConfidence: option.coordinateConfidence,
  accessStatus: option.accessStatus,
  providerScore: option.providerScore,
  providerId: option.providerId,
  providerResultState: option.providerResultState,
  warnings: option.warnings,
  diesel: option.diesel,
  sourceType: option.sourceType,
  suggestionId: option.suggestionId,
  mapboxId: option.mapboxId,
});
const originalRefreshOption = {
  stableKey: 'fuel:mapbox:stable-place',
  title: 'Stable Fuel',
  subtitle: 'Old approach road',
  coordinate: { latitude: 39.5, longitude: -121.4 },
  distanceFromRouteStartMiles: 30,
  distanceFromOriginMiles: 32,
  distanceFromTrailheadMiles: 30,
  distanceFromApproachRouteMiles: 0.2,
  routeDeviationMiles: 0.4,
  detourDurationMinutes: 2,
  remainingApproachMilesToTrailhead: 30,
  distanceBeforeRemoteEntryMiles: 20,
  approachProgressRatio: 0.5,
  approachScore: 0.8,
  rank: 1,
  beforeTrailEntry: true,
  beforeRemoteEntry: true,
  fallbackState: 'approach_route',
  routeEvidenceState: 'provider_route',
  routeAwareConfidence: 'high',
  remoteEntrySource: 'route_metadata',
  remoteEntryConfidence: 'medium',
  remoteEntryEstimated: false,
  remoteEntryLabel: 'Route metadata service boundary',
  categoryCoverage: ['fuel'],
  operatingStatus: 'unknown',
  providerConfidence: 'high',
  coordinateConfidence: 'high',
  accessStatus: 'accessible',
  providerScore: 0.9,
  providerId: 'mapbox_search',
  providerResultState: 'complete',
  warnings: ['Hours unknown.'],
  diesel: false,
  sourceType: 'mapbox_search',
  suggestionId: 'stable-place',
  mapboxId: 'stable-place',
};
const equivalentRefresh = [{ ...originalRefreshOption, coordinate: { ...originalRefreshOption.coordinate } }];
assert.strictEqual(
  retainEquivalentResupplyOptions([originalRefreshOption], equivalentRefresh, refreshEvidence)[0],
  originalRefreshOption,
  'Semantically identical refresh evidence should retain card identity.',
);
const correctedRefreshOption = {
  ...originalRefreshOption,
  coordinate: { latitude: 39.62, longitude: -121.39 },
  accessStatus: 'unknown',
  providerConfidence: 'low',
  providerResultState: 'partial',
  warnings: ['Provider refresh is partial; verify access.'],
};
const correctedRefresh = [correctedRefreshOption];
const acceptedRefresh = retainEquivalentResupplyOptions([originalRefreshOption], correctedRefresh, refreshEvidence);
assert.strictEqual(
  acceptedRefresh[0],
  correctedRefreshOption,
  'A same-ID correction to geometry, access, confidence, freshness, or warnings must replace stale visible and selected evidence.',
);

console.log('Trip Builder resupply civilization refresh checks passed.');
