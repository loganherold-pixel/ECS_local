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
  APPROACH_RESUPPLY_POLICY,
  assessApproachResupplySearchCoverage,
  buildApproachResupplyStopPlan,
  buildApproachResupplyRerankEvidence,
  buildApproachResupplyRouteFingerprint,
  buildApproachResupplySearchAnchors,
  classifyApproachResupplyRoutePosition,
  classifyApproachResupplyProviderCoverage,
  evaluateApproachResupplyOptions: evaluateApproachResupplyOptionsStrict,
  inferApproachRemoteEntry,
  interleaveApproachSearchResults,
  mergeApproachResupplyRouteEvidence,
  mergeApproachResupplySafetyEvidence,
  prioritizeApproachSearchResults,
  rankApproachResupplyOptions: rankApproachResupplyOptionsStrict,
} = require(path.join(root, 'lib', 'tripBuilder', 'approachResupplyPlanner.ts'));

// Preserve the historical broad-policy coverage below while the strict A-H
// fixture at the end exercises the product's normal 0.20-mile/access rules.
const evaluateApproachResupplyOptions = (args) => evaluateApproachResupplyOptionsStrict({
  maxCorridorOffsetMiles: 20,
  requireRoutedAccess: false,
  ...args,
});
const rankApproachResupplyOptions = (args) => rankApproachResupplyOptionsStrict({
  maxCorridorOffsetMiles: 20,
  requireRoutedAccess: false,
  ...args,
});

assert.strictEqual(
  classifyApproachResupplyProviderCoverage({
    expectedAnchorCount: 4,
    coveredAnchorCount: 1,
    failedAnchorCount: 3,
    resultCount: 0,
  }),
  'retryable_error',
  'A partial corridor request with zero results must not be presented as a valid empty result.',
);
assert.strictEqual(
  classifyApproachResupplyProviderCoverage({
    expectedAnchorCount: 4,
    coveredAnchorCount: 3,
    failedAnchorCount: 1,
    resultCount: 2,
  }),
  'partial_results',
  'Usable results from incomplete corridor coverage must retain a degraded/partial provider state.',
);

const origin = { latitude: 39.0, longitude: -121.5 };
const trailhead = { latitude: 40.5, longitude: -121.4 };
const approachRoute = [
  origin,
  { latitude: 39.45, longitude: -121.5 },
  { latitude: 39.9, longitude: -121.5 },
  { latitude: 40.25, longitude: -121.5 },
  trailhead,
];

const anchors = buildApproachResupplySearchAnchors({
  trailhead,
  approachRoute,
});
assert.ok(anchors.length >= 3, 'Approach resupply should sample more than the trailhead point.');
assert.ok(
  anchors.some((anchor) => anchor.basis === 'approach_corridor'),
  'Approach resupply should search along the approach corridor before trail entry.',
);
assert.ok(
  anchors.some((anchor) => anchor.basis === 'approach_corridor' && anchor.progressRatio != null && anchor.progressRatio <= 0.2),
  'Approach resupply should sample the early/home-side corridor instead of only searching near the trailhead.',
);
assert.ok(
  anchors.some((anchor) => anchor.progressRatio != null && anchor.progressRatio >= 0.9),
  'Approach resupply should still sample the last approach segment before trail entry.',
);
assert.strictEqual(
  anchors[anchors.length - 1].basis,
  'trailhead_fallback',
  'The trailhead should remain the final fallback anchor, not the only search point.',
);

const fuelInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  candidates: [
    {
      id: 'chico-straight-line-nearest',
      title: 'Straight-Line Nearest Fuel',
      category: 'fuel',
      coordinate: { latitude: 40.45, longitude: -121.95 },
      sourceType: 'mapbox_search',
      confidence: 'medium',
    },
    {
      id: 'on-approach-last-fuel',
      title: 'Last Fuel On Approach',
      category: 'fuel',
      coordinate: { latitude: 40.25, longitude: -121.5 },
      sourceType: 'mapbox_search',
      confidence: 'medium',
    },
    {
      id: 'after-entry-fuel',
      title: 'Fuel After Trail Entry',
      category: 'fuel',
      coordinate: { latitude: 40.52, longitude: -121.38 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      beforeTrailEntry: false,
    },
  ],
  limit: 3,
});
const rankedFuel = fuelInventory.ranked;

assert.strictEqual(
  rankedFuel[0].id,
  'on-approach-last-fuel',
  'A station on the GPS-to-trailhead approach should outrank a straight-line-nearest station away from the approach path.',
);
assert.ok(
  fuelInventory.excluded.find((option) => option.id === 'chico-straight-line-nearest')?.exclusionReasons.includes('excessive_corridor_offset'),
  'A candidate far outside the approach corridor should be excluded as an excessive geometric offset, not mislabeled as a routed detour.',
);
assert.ok(
  fuelInventory.excluded.find((option) => option.id === 'after-entry-fuel')?.exclusionReasons.includes('after_trailhead'),
  'Candidates known to occur after trail entry should be excluded from pre-trail recommendations.',
);
assert.ok(
  rankedFuel[0].remainingApproachMilesToTrailhead > 0,
  'The preferred option should remain before trail entry.',
);

const fallbackFuel = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin: null,
  trailhead,
  approachRoute: [],
  candidates: [{
    id: 'trailhead-only-fuel',
    title: 'Trailhead Only Fuel',
    category: 'fuel',
    coordinate: { latitude: 40.48, longitude: -121.42 },
    sourceType: 'mapbox_search',
    confidence: 'medium',
  }],
});
assert.strictEqual(fallbackFuel.ranked.length, 0);
assert.ok(
  fallbackFuel.excluded[0].exclusionReasons.includes('approach_route_unavailable'),
  'Missing approach geometry must not create a normal trailhead-proximity recommendation.',
);

const bufferedOffRouteFuel = rankApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  maxRouteDeviationMiles: 20,
  preferredRouteBufferMiles: 10,
  candidates: [{
    id: 'small-town-two-streets-off-route',
    title: 'Small Town Fuel Near Approach',
    category: 'fuel',
    coordinate: { latitude: 40.18, longitude: -121.31 },
    sourceType: 'mapbox_search',
    confidence: 'medium',
    detourDistanceMiles: 11.8,
  }],
});
assert.strictEqual(
  bufferedOffRouteFuel.length,
  1,
  'Smart Resupply should keep reasonable off-corridor fuel candidates inside the extended approach buffer.',
);
const runtimeSizedAnchors = buildApproachResupplySearchAnchors({
  origin,
  trailhead,
  approachRoute,
  remoteEntryProgressRatio: 0.88,
  maxAnchors: 4,
});
assert.ok(
  runtimeSizedAnchors.some((anchor) => anchor.progressRatio != null && anchor.progressRatio >= 0.82 && anchor.progressRatio < 0.88),
  'The mounted four-anchor budget must still query the last civilization-side segment.',
);
assert.deepStrictEqual(
  interleaveApproachSearchResults([
    ['remote-a', 'remote-b', 'remote-c'],
    ['middle-a'],
    ['origin-a', 'origin-b'],
    ['trailhead-a'],
  ]).slice(0, 5),
  ['remote-a', 'middle-a', 'origin-a', 'trailhead-a', 'remote-b'],
  'A single proximity anchor must not consume the entire provider-detail budget before other approach segments are represented.',
);
assert.ok(
  bufferedOffRouteFuel[0].warnings.some((warning) => /routed detour exceeds the preferred 10-mile detour/i.test(warning)),
  'Fuel outside the preferred routed-detour band but inside the maximum should stay selectable with a clear fallback warning.',
);

assert.strictEqual(
  APPROACH_RESUPPLY_POLICY.preferredCorridorOffsetMiles,
  0.1,
  'The preferred geometric approach corridor should be the 0.00-0.10 mile tier.',
);
assert.strictEqual(APPROACH_RESUPPLY_POLICY.maximumCorridorOffsetMiles, 0.2);
assert.notStrictEqual(
  APPROACH_RESUPPLY_POLICY.preferredCorridorOffsetMiles,
  APPROACH_RESUPPLY_POLICY.preferredRoutedDetourMiles,
  'Geometric corridor offset and provider-routed detour must remain separate operational measurements.',
);

const corridorPreferenceOrigin = { latitude: 0, longitude: 0 };
const corridorPreferenceTrailhead = { latitude: 1, longitude: 0 };
const corridorPreferenceRoute = [corridorPreferenceOrigin, corridorPreferenceTrailhead];
const idealCorridorPreference = rankApproachResupplyOptions({
  category: 'fuel',
  origin: corridorPreferenceOrigin,
  trailhead: corridorPreferenceTrailhead,
  approachRoute: corridorPreferenceRoute,
  remoteEntryProgressRatio: 0.99,
  candidates: [
    {
      id: 'ideal-corridor-earlier',
      title: 'Ideal Corridor Fuel',
      category: 'fuel',
      coordinate: { latitude: 0.7, longitude: 0.00145 },
      confidence: 'high',
    },
    {
      id: 'broader-corridor-later',
      title: 'Broader Corridor Fuel',
      category: 'fuel',
      coordinate: { latitude: 0.9, longitude: 0.0145 },
      confidence: 'high',
    },
  ],
});
assert.strictEqual(
  idealCorridorPreference[0].id,
  'broader-corridor-later',
  'Route position is the first comparator key even when a legacy caller explicitly widens its corridor.',
);

const latestInsideIdealCorridor = rankApproachResupplyOptions({
  category: 'fuel',
  origin: corridorPreferenceOrigin,
  trailhead: corridorPreferenceTrailhead,
  approachRoute: corridorPreferenceRoute,
  remoteEntryProgressRatio: 0.99,
  candidates: [
    {
      id: 'ideal-earlier-stop',
      title: 'Earlier Ideal Fuel',
      category: 'fuel',
      coordinate: { latitude: 0.7, longitude: 0.00145 },
      confidence: 'high',
    },
    {
      id: 'ideal-last-useful-stop',
      title: 'Last Useful Ideal Fuel',
      category: 'fuel',
      coordinate: { latitude: 0.9, longitude: 0.0026 },
      confidence: 'high',
    },
  ],
});
assert.strictEqual(
  latestInsideIdealCorridor[0].id,
  'ideal-last-useful-stop',
  'When candidates are both within 0.2 miles, the last useful stop before remote entry should rank first.',
);

const broaderFallbackOnly = rankApproachResupplyOptions({
  category: 'food_supplies',
  origin: corridorPreferenceOrigin,
  trailhead: corridorPreferenceTrailhead,
  approachRoute: corridorPreferenceRoute,
  remoteEntryProgressRatio: 0.99,
  candidates: [
    {
      id: 'broader-supply-earlier',
      title: 'Earlier Broader Supply',
      category: 'food_supplies',
      coordinate: { latitude: 0.7, longitude: 0.0087 },
      confidence: 'medium',
    },
    {
      id: 'broader-supply-later',
      title: 'Later Broader Supply',
      category: 'food_supplies',
      coordinate: { latitude: 0.9, longitude: 0.0145 },
      confidence: 'medium',
    },
  ],
});
assert.strictEqual(broaderFallbackOnly.length, 2);
assert.strictEqual(
  broaderFallbackOnly[0].id,
  'broader-supply-later',
  'When no ideal-corridor option exists, broader viable fallbacks should retain last-useful-before-entry ordering.',
);
assert.ok(
  broaderFallbackOnly.every((option) => option.warnings.some((warning) => /acceptable .* corridor tier/i.test(warning))),
  'A caller-widened corridor should still disclose the non-preferred tier.',
);

const directionInvariantCandidates = [
  {
    id: 'near-origin-fuel',
    title: 'Near Origin Fuel',
    category: 'fuel',
    coordinate: { latitude: 39.08, longitude: -121.5 },
    confidence: 'high',
  },
  {
    id: 'near-trailhead-fuel',
    title: 'Near Trailhead Fuel',
    category: 'fuel',
    coordinate: { latitude: 40.25, longitude: -121.5 },
    confidence: 'high',
  },
];
const proximityTrapRanked = rankApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  remoteEntryProgressRatio: 0.96,
  candidates: [
    {
      id: 'near-user-far-off-approach',
      title: 'Near User But Off Approach',
      category: 'fuel',
      coordinate: { latitude: 39.02, longitude: -121.75 },
      confidence: 'high',
    },
    {
      id: 'forward-on-route',
      title: 'Forward On-Route Fuel',
      category: 'fuel',
      coordinate: { latitude: 40.1, longitude: -121.5 },
      confidence: 'medium',
    },
  ],
});
assert.strictEqual(
  proximityTrapRanked[0].id,
  'forward-on-route',
  'Raw proximity to the user must not outrank a practical forward stop on the canonical approach.',
);
const forwardRanked = rankApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  remoteEntry: {
    progressRatio: 0.96,
    source: 'known_service_boundary',
    confidence: 'high',
  },
  candidates: directionInvariantCandidates,
});
const reverseRanked = rankApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute: [...approachRoute].reverse(),
  remoteEntry: {
    progressRatio: 0.96,
    source: 'known_service_boundary',
    confidence: 'high',
  },
  candidates: directionInvariantCandidates,
});
assert.strictEqual(forwardRanked[0].id, 'near-trailhead-fuel');
assert.strictEqual(
  reverseRanked[0].id,
  forwardRanked[0].id,
  'Reversing provider geometry must not invert origin-to-trailhead resupply ordering.',
);

const boundaryInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  remoteEntry: {
    coordinate: { latitude: 40.3, longitude: -121.5 },
    source: 'known_service_boundary',
    confidence: 'high',
    estimated: false,
    label: 'Known service-loss boundary',
  },
  candidates: [
    {
      id: 'behind-origin',
      title: 'Behind Origin Fuel',
      category: 'fuel',
      coordinate: { latitude: 38.9, longitude: -121.5 },
      confidence: 'high',
    },
    {
      id: 'before-remote-entry',
      title: 'Last Practical Fuel',
      category: 'fuel',
      coordinate: { latitude: 40.22, longitude: -121.5 },
      confidence: 'high',
    },
    {
      id: 'after-remote-entry',
      title: 'Fuel In No-Service Segment',
      category: 'fuel',
      coordinate: { latitude: 40.4, longitude: -121.45 },
      confidence: 'high',
    },
    {
      id: 'after-trailhead',
      title: 'Fuel Beyond Trailhead',
      category: 'fuel',
      coordinate: { latitude: 40.62, longitude: -121.38 },
      confidence: 'high',
    },
    {
      id: 'invalid-coordinate',
      title: 'Invalid Coordinate Fuel',
      category: 'fuel',
      coordinate: { latitude: 120, longitude: -121.5 },
      confidence: 'low',
    },
  ],
});
assert.strictEqual(boundaryInventory.ranked[0].id, 'after-remote-entry');
assert.ok(
  boundaryInventory.excluded.find((option) => option.id === 'behind-origin')?.exclusionReasons.includes('behind_origin'),
  'A stop behind the selected origin must not become the last fuel recommendation.',
);
assert.ok(
  boundaryInventory.ranked.some((option) => option.id === 'after-remote-entry'),
  'A service-loss estimate must not truncate the resolved origin-to-trail-entry approach.',
);
assert.ok(
  boundaryInventory.excluded.find((option) => option.id === 'after-trailhead')?.exclusionReasons.includes('after_trailhead'),
  'A stop beyond the trailhead must not be selected as a pre-trail stop.',
);
assert.ok(
  boundaryInventory.excluded.find((option) => option.id === 'invalid-coordinate')?.exclusionReasons.includes('invalid_coordinate'),
  'Invalid or low-integrity coordinates must not enter the recommendation list.',
);
assert.strictEqual(boundaryInventory.ranked[0].remoteEntrySource, 'known_service_boundary');
assert.ok(boundaryInventory.ranked[0].distanceBeforeRemoteEntryMiles < 0);

const earlyBoundaryInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  remoteEntry: {
    progressRatio: 0.2,
    source: 'known_service_boundary',
    confidence: 'high',
    estimated: false,
    label: 'Known early service-loss boundary',
  },
  candidates: [
    {
      id: 'before-early-boundary',
      title: 'Before Early Boundary',
      category: 'fuel',
      coordinate: { latitude: 39.2, longitude: -121.5 },
      confidence: 'high',
    },
    {
      id: 'after-early-boundary',
      title: 'After Early Boundary',
      category: 'fuel',
      coordinate: { latitude: 39.6, longitude: -121.5 },
      confidence: 'high',
    },
  ],
});
assert.strictEqual(earlyBoundaryInventory.remoteEntry.progressRatio, 0.2, 'Known early boundaries must not be shifted to a later policy minimum.');
assert.ok(
  earlyBoundaryInventory.ranked.some((option) => option.id === 'after-early-boundary'),
  'An earlier service-loss marker is informational and must not replace practical trail entry.',
);
const earlyBoundaryAnchors = buildApproachResupplySearchAnchors({
  origin,
  trailhead,
  approachRoute,
  remoteEntry: {
    progressRatio: 0.1,
    source: 'known_service_boundary',
    confidence: 'high',
    estimated: false,
    label: 'Known very early service-loss boundary',
  },
  maxAnchors: 4,
});
assert.ok(
  earlyBoundaryAnchors.some((anchor) => anchor.progressRatio === 1),
  'Provider discovery must always include the exact practical trail entry.',
);

const precisionBoundaryInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin: { latitude: 0, longitude: 0 },
  trailhead: { latitude: 1, longitude: 0 },
  approachRoute: [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
  ],
  remoteEntry: {
    progressRatio: 0.5,
    source: 'known_service_boundary',
    confidence: 'high',
    estimated: false,
    label: 'Known precision boundary',
  },
  candidates: [{
    id: 'just-before-precision-boundary',
    title: 'Just Before Precision Boundary',
    category: 'fuel',
    coordinate: { latitude: 0.4995, longitude: 0 },
    confidence: 'high',
  }],
});
assert.strictEqual(
  precisionBoundaryInventory.ranked[0]?.id,
  'just-before-precision-boundary',
  'Raw route distance, not rounded display distance, must decide which side of a service boundary contains a stop.',
);

const offApproachBoundaryInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin: { latitude: 0, longitude: 0 },
  trailhead: { latitude: 1, longitude: 0 },
  approachRoute: [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
  ],
  remoteEntry: {
    coordinate: { latitude: 0.5, longitude: 1 },
    source: 'known_service_boundary',
    confidence: 'high',
    estimated: false,
    label: 'Unrelated trail-interior boundary',
  },
  candidates: [{
    id: 'valid-late-approach-fuel',
    title: 'Valid Late Approach Fuel',
    category: 'fuel',
    coordinate: { latitude: 0.8, longitude: 0 },
    confidence: 'high',
  }],
});
assert.strictEqual(offApproachBoundaryInventory.remoteEntry.source, 'trailhead_estimate');
assert.strictEqual(offApproachBoundaryInventory.remoteEntry.estimated, true);
assert.strictEqual(offApproachBoundaryInventory.remoteEntry.confidence, 'low');
assert.match(offApproachBoundaryInventory.remoteEntry.label, /outside the canonical approach corridor/i);
assert.strictEqual(
  offApproachBoundaryInventory.ranked[0]?.id,
  'valid-late-approach-fuel',
  'An off-approach metadata coordinate must not create a false service boundary that excludes valid approach stops.',
);

const explicitProgressBoundaryInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin: { latitude: 0, longitude: 0 },
  trailhead: { latitude: 1, longitude: 0 },
  approachRoute: [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
  ],
  remoteEntry: {
    coordinate: { latitude: 0.2, longitude: 1 },
    progressRatio: 0.8,
    source: 'route_metadata',
    confidence: 'medium',
    estimated: false,
    label: 'Explicit approach progress',
  },
  candidates: [{
    id: 'before-explicit-boundary',
    title: 'Before Explicit Boundary',
    category: 'fuel',
    coordinate: { latitude: 0.7, longitude: 0 },
    confidence: 'high',
  }],
});
assert.strictEqual(explicitProgressBoundaryInventory.remoteEntry.progressRatio, 0.8);
assert.strictEqual(explicitProgressBoundaryInventory.remoteEntry.coordinate, null);
assert.strictEqual(explicitProgressBoundaryInventory.ranked[0]?.id, 'before-explicit-boundary');

const conflictingBoundaryInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin: { latitude: 0, longitude: 0 },
  trailhead: { latitude: 1, longitude: 0 },
  approachRoute: [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
  ],
  remoteEntry: {
    coordinate: { latitude: 0.9, longitude: 0 },
    progressRatio: 0.2,
    source: 'route_metadata',
    confidence: 'medium',
    estimated: false,
    label: 'Conflicting route metadata boundary',
  },
  candidates: [{
    id: 'mid-approach-before-coordinate-boundary',
    title: 'Mid Approach Fuel',
    category: 'fuel',
    coordinate: { latitude: 0.5, longitude: 0 },
    confidence: 'high',
  }],
});
assert.ok(
  Math.abs(conflictingBoundaryInventory.remoteEntry.progressRatio - 0.9) < 0.01,
  'A valid on-approach boundary coordinate should be projected onto the current canonical approach instead of using a conflicting stale ratio.',
);
assert.strictEqual(conflictingBoundaryInventory.remoteEntry.confidence, 'low');
assert.strictEqual(conflictingBoundaryInventory.remoteEntry.estimated, false);
assert.strictEqual(conflictingBoundaryInventory.remoteEntry.conflictReason, 'coordinate_progress_mismatch');
assert.match(conflictingBoundaryInventory.remoteEntry.label, /conflicting route metadata/i);
assert.strictEqual(
  conflictingBoundaryInventory.ranked[0]?.id,
  'mid-approach-before-coordinate-boundary',
  'A viable stop before the concrete on-approach boundary must not be excluded by a conflicting stale progress ratio.',
);
assert.ok(
  conflictingBoundaryInventory.ranked[0]?.warnings.some((warning) => /conflicting route metadata/i.test(warning)),
  'Boundary disagreement must remain visible in recommendation evidence.',
);
const conflictingBoundaryAnchors = buildApproachResupplySearchAnchors({
  origin: { latitude: 0, longitude: 0 },
  trailhead: { latitude: 1, longitude: 0 },
  approachRoute: [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
  ],
  remoteEntry: conflictingBoundaryInventory.remoteEntry,
  maxAnchors: 6,
});
assert.ok(
  conflictingBoundaryAnchors
    .filter((anchor) => anchor.basis === 'approach_corridor')
    .every((anchor) => anchor.progressRatio <= conflictingBoundaryInventory.remoteEntry.progressRatio),
  'Known conflicting-boundary search anchors must remain on the civilization side of the projected boundary.',
);

const duplicateEndpointRoute = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 0 },
  { latitude: 0.5, longitude: 0 },
  { latitude: 1, longitude: 0 },
  { latitude: 1, longitude: 0 },
];
assert.strictEqual(
  classifyApproachResupplyRoutePosition({
    approachRoute: duplicateEndpointRoute,
    origin: duplicateEndpointRoute[0],
    trailhead: duplicateEndpointRoute[duplicateEndpointRoute.length - 1],
    coordinate: { latitude: -0.05, longitude: 0 },
  }),
  'behind_origin',
  'Duplicate approach endpoints must not hide a stop behind the selected origin.',
);
assert.strictEqual(
  classifyApproachResupplyRoutePosition({
    approachRoute: duplicateEndpointRoute,
    origin: duplicateEndpointRoute[0],
    trailhead: duplicateEndpointRoute[duplicateEndpointRoute.length - 1],
    coordinate: { latitude: 1.05, longitude: 0 },
  }),
  'after_trailhead',
  'Duplicate approach endpoints must not hide a stop beyond the trailhead.',
);

const formerlySampledRoute = Array.from({ length: 11 }, (_, index) => ({
  latitude: index / 10,
  longitude: 0,
}));
const divergentBetweenSamplesRoute = formerlySampledRoute.map((point, index) => (
  index % 2 === 1 ? { ...point, longitude: 0.02 } : point
));
assert.notStrictEqual(
  buildApproachResupplyRouteFingerprint(formerlySampledRoute),
  buildApproachResupplyRouteFingerprint(divergentBetweenSamplesRoute),
  'Request fingerprints must hash the full canonical approach so unsampled bends or parallel roads cannot reuse stale POI work.',
);

const coordinateConfidenceInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  remoteEntry: {
    progressRatio: 0.96,
    source: 'known_service_boundary',
    confidence: 'high',
    estimated: false,
    label: 'Known service-loss boundary',
  },
  candidates: [
    {
      id: 'high-integrity-forward-stop',
      title: 'High Integrity Forward Stop',
      category: 'fuel',
      coordinate: { latitude: 40.3, longitude: -121.5 },
      confidence: 'high',
      coordinateConfidence: 'high',
    },
    {
      id: 'low-integrity-later-stop',
      title: 'Low Integrity Later Stop',
      category: 'fuel',
      coordinate: { latitude: 40.35, longitude: -121.49 },
      confidence: 'high',
      coordinateConfidence: 'low',
    },
  ],
});
assert.strictEqual(
  coordinateConfidenceInventory.ranked[0].id,
  'low-integrity-later-stop',
  'Provider confidence is only a final tie-breaker and cannot override route position.',
);

const samePlaceSafetyEvidence = mergeApproachResupplySafetyEvidence([
  { accessStatus: 'unknown', operatingStatus: 'open', coordinateConfidence: null },
  { accessStatus: 'inaccessible', operatingStatus: 'unknown', coordinateConfidence: 'low' },
]);
const samePlaceRouteEvidence = mergeApproachResupplyRouteEvidence([
  {
    routeEvidenceState: 'corridor_offset_estimate',
    routeDeviationMiles: 0.4,
    distanceFromApproachRouteMiles: 0.4,
    detourDurationMinutes: null,
  },
  {
    routeEvidenceState: 'provider_route',
    routeDeviationMiles: 6.2,
    distanceFromApproachRouteMiles: 0.4,
    detourDurationMinutes: 14,
  },
]);
assert.deepStrictEqual(
  {
    routeEvidenceState: samePlaceRouteEvidence.routeEvidenceState,
    routeDeviationMiles: samePlaceRouteEvidence.routeDeviationMiles,
    detourDurationMinutes: samePlaceRouteEvidence.detourDurationMinutes,
  },
  {
    routeEvidenceState: 'provider_route',
    routeDeviationMiles: 6.2,
    detourDurationMinutes: 14,
  },
  'Fresh provider-routed evidence must survive reconciliation with a stale geometric copy of the same place.',
);
const samePlaceSafetyInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  candidates: [{
    id: 'same-provider-place-reconciled',
    title: 'Same Provider Place Reconciled',
    category: 'fuel',
    coordinate: { latitude: 40.25, longitude: -121.5 },
    confidence: 'high',
    ...samePlaceSafetyEvidence,
    detourDistanceMiles: samePlaceRouteEvidence.routeEvidenceState === 'provider_route'
      ? samePlaceRouteEvidence.routeDeviationMiles
      : null,
    distanceFromApproachRouteMiles: samePlaceRouteEvidence.distanceFromApproachRouteMiles,
    detourDurationMinutes: samePlaceRouteEvidence.detourDurationMinutes,
  }],
});
assert.strictEqual(samePlaceSafetyInventory.ranked.length, 0);
assert.ok(
  samePlaceSafetyInventory.excluded[0].exclusionReasons.includes('inaccessible'),
  'Authoritative inaccessible evidence must override an unknown direct-search copy of the same provider place.',
);

const rerankOrigin = { latitude: 0, longitude: 0 };
const rerankTrailhead = { latitude: 1, longitude: 0 };
const geometricCandidate = {
  id: 'geometric-only-stop',
  title: 'Geometric Only Stop',
  category: 'fuel',
  coordinate: { latitude: 0.72, longitude: 0.01 },
  confidence: 'medium',
  score: 0.72,
};
const firstGeometricRank = rankApproachResupplyOptions({
  category: 'fuel',
  origin: rerankOrigin,
  trailhead: rerankTrailhead,
  approachRoute: [rerankOrigin, rerankTrailhead],
  candidates: [geometricCandidate],
})[0];
const rerankEvidence = buildApproachResupplyRerankEvidence({
  routeEvidenceState: firstGeometricRank.routeEvidenceState,
  routeDeviationMiles: firstGeometricRank.routeDeviationMiles,
  distanceFromApproachRouteMiles: firstGeometricRank.distanceFromApproachRouteMiles,
  providerScore: geometricCandidate.score,
});
const secondGeometricRank = rankApproachResupplyOptions({
  category: 'fuel',
  origin: rerankOrigin,
  trailhead: rerankTrailhead,
  approachRoute: [rerankOrigin, rerankTrailhead],
  candidates: [{ ...geometricCandidate, ...rerankEvidence }],
})[0];
assert.strictEqual(firstGeometricRank.routeEvidenceState, 'corridor_offset_estimate');
assert.strictEqual(secondGeometricRank.routeEvidenceState, 'corridor_offset_estimate');
assert.strictEqual(secondGeometricRank.routeAwareConfidence, 'low');
assert.strictEqual(
  secondGeometricRank.approachScore,
  firstGeometricRank.approachScore,
  'Re-ranking the same presentation option must not recursively drift its score or fabricate provider-routed evidence.',
);

const verifiedDetourInventory = rankApproachResupplyOptions({
  category: 'fuel',
  origin: rerankOrigin,
  trailhead: rerankTrailhead,
  approachRoute: [rerankOrigin, rerankTrailhead],
  remoteEntryProgressRatio: 0.95,
  candidates: [
    {
      id: 'verified-provider-detour',
      title: 'Verified Provider Detour',
      category: 'fuel',
      coordinate: { latitude: 0.72, longitude: 0.015 },
      detourDistanceMiles: 2,
      detourDurationMinutes: 6,
      confidence: 'medium',
    },
    {
      id: 'later-geometric-offset',
      title: 'Later Geometric Offset',
      category: 'fuel',
      coordinate: { latitude: 0.8, longitude: 0.01 },
      confidence: 'high',
    },
  ],
});
assert.strictEqual(
  verifiedDetourInventory[0].id,
  'later-geometric-offset',
  'Evidence-source preference must not override the last-practical-stop route position.',
);

const customThresholdInventory = rankApproachResupplyOptions({
  category: 'fuel',
  origin: rerankOrigin,
  trailhead: rerankTrailhead,
  approachRoute: [rerankOrigin, rerankTrailhead],
  preferredRouteBufferMiles: 5,
  maxRouteDeviationMiles: 15,
  candidates: [
    {
      id: 'inside-custom-preferred',
      title: 'Inside Custom Preferred Buffer',
      category: 'fuel',
      coordinate: { latitude: 0.6, longitude: 0 },
      detourDistanceMiles: 4,
      confidence: 'medium',
    },
    {
      id: 'outside-custom-preferred',
      title: 'Outside Custom Preferred Buffer',
      category: 'fuel',
      coordinate: { latitude: 0.8, longitude: 0 },
      detourDistanceMiles: 6,
      confidence: 'medium',
    },
  ],
});
assert.strictEqual(
  customThresholdInventory[0].id,
  'outside-custom-preferred',
  'Preferred detour bands cannot move an earlier stop ahead of a later eligible stop.',
);

const inferredBoundary = inferApproachRemoteEntry({ remotenessScore: 8 });
assert.strictEqual(inferredBoundary.source, 'practical_trail_entry');
assert.strictEqual(inferredBoundary.estimated, false);
assert.match(inferredBoundary.label, /practical trail entry/i);

const noRouteInventory = evaluateApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute: [],
  candidates: directionInvariantCandidates,
});
assert.strictEqual(noRouteInventory.fallbackState, 'trailhead_only');
assert.strictEqual(noRouteInventory.routeAwareConfidence, 'unknown');
assert.strictEqual(noRouteInventory.remoteEntry.source, 'unavailable');
assert.strictEqual(noRouteInventory.ranked.length, 0);
assert.ok(noRouteInventory.excluded.every((option) => option.exclusionReasons.includes('approach_route_unavailable')));

const combinedStop = {
  ...forwardRanked[0],
  id: 'combined-market-fuel',
  title: 'Combined Fuel and Market',
  categoryCoverage: ['fuel', 'food_supplies'],
};
const stopPlan = buildApproachResupplyStopPlan({
  fuelOptions: [{
    ...combinedStop,
    placeIdentity: 'provider-place:mapbox:shared-stop',
    categoryCoverage: ['fuel'],
  }],
  supplyOptions: [{
    ...combinedStop,
    id: 'food_supplies:provider-place:mapbox:shared-stop',
    placeIdentity: 'provider-place:mapbox:shared-stop',
    title: 'Combined Market at Fuel Stop',
    category: 'food_supplies',
    categoryCoverage: ['food_supplies'],
  }],
  requestedCategories: ['fuel', 'food_supplies'],
});
assert.strictEqual(stopPlan.status, 'combined');
assert.strictEqual(stopPlan.stops.length, 1, 'One verified multi-category POI should satisfy fuel and supplies once.');
assert.deepStrictEqual(stopPlan.stops[0].categoryCoverage, ['fuel', 'food_supplies']);

const separateStopPlan = buildApproachResupplyStopPlan({
  fuelOptions: [forwardRanked[0]],
  supplyOptions: [{
    ...forwardRanked[0],
    id: 'separate-market',
    title: 'Separate Market',
    category: 'food_supplies',
    categoryCoverage: ['food_supplies'],
    coordinate: { latitude: 40.18, longitude: -121.49 },
  }],
  requestedCategories: ['fuel', 'food_supplies'],
});
assert.strictEqual(separateStopPlan.status, 'separate');
assert.strictEqual(separateStopPlan.stops.length, 2, 'Distinct viable category stops should remain an ordered two-stop plan.');

const routeOrderedStopPlan = buildApproachResupplyStopPlan({
  fuelOptions: [{ ...forwardRanked[0], id: 'later-fuel', approachProgressRatio: 0.9, distanceFromOriginMiles: 90 }],
  supplyOptions: [{
    ...forwardRanked[0],
    id: 'earlier-supply',
    title: 'Earlier Supply Stop',
    category: 'food_supplies',
    categoryCoverage: ['food_supplies'],
    coordinate: { latitude: 40.05, longitude: -121.5 },
    approachProgressRatio: 0.7,
    distanceFromOriginMiles: 70,
  }],
  requestedCategories: ['fuel', 'food_supplies'],
});
assert.deepStrictEqual(
  routeOrderedStopPlan.stops.map((stop) => stop.id),
  ['earlier-supply', 'later-fuel'],
  'Separate stops must be handed off in canonical approach order rather than category order.',
);

const unavailablePlan = buildApproachResupplyStopPlan({
  fuelOptions: [],
  supplyOptions: [],
  requestedCategories: ['fuel', 'food_supplies'],
});
assert.strictEqual(unavailablePlan.status, 'unavailable');
assert.match(unavailablePlan.explanation, /no viable/i);

// Required last-practical-stop regression fixture (Cases A-H).
const milesPerDegreeAtEquator = 69.0934;
const strictOrigin = { latitude: 0, longitude: 0 };
const strictEntry = { latitude: 1, longitude: 0 };
const strictApproach = [strictOrigin, strictEntry];
const pointBeforeEntry = (remainingMiles, corridorOffsetMiles) => ({
  latitude: 1 - remainingMiles / milesPerDegreeAtEquator,
  longitude: corridorOffsetMiles / milesPerDegreeAtEquator,
});
const routedCandidate = (input) => ({
  category: 'fuel',
  confidence: 'medium',
  coordinateConfidence: 'medium',
  operatingStatus: 'open',
  accessStatus: 'accessible',
  categoryUsefulness: 'category_match',
  ...input,
});

const requiredFixtureInventory = evaluateApproachResupplyOptionsStrict({
  category: 'fuel',
  origin: strictOrigin,
  trailhead: strictEntry,
  approachRoute: strictApproach,
  candidates: [
    routedCandidate({
      id: 'case-a-early-preferred',
      title: 'Case A — Early Preferred Corridor',
      coordinate: pointBeforeEntry(12, 0.05),
      detourDurationMinutes: 1,
      detourDistanceMiles: 0.1,
      score: 100,
    }),
    routedCandidate({
      id: 'case-b-last-acceptable',
      title: 'Case B — Last Acceptable Corridor',
      coordinate: pointBeforeEntry(0.8, 0.18),
      detourDurationMinutes: 4,
      detourDistanceMiles: 0.6,
      score: 1,
    }),
    routedCandidate({
      id: 'case-c-outside-normal',
      title: 'Case C — 0.21 Mile Offset',
      coordinate: pointBeforeEntry(0.1, 0.21),
      detourDurationMinutes: 1,
      detourDistanceMiles: 0.1,
    }),
    routedCandidate({
      id: 'case-e-inaccessible-detour',
      title: 'Case E — Divider / River Detour',
      coordinate: pointBeforeEntry(0.6, 0.04),
      detourDurationMinutes: 55,
      detourDistanceMiles: 25,
    }),
  ],
});
assert.deepStrictEqual(
  requiredFixtureInventory.ranked.map((candidate) => candidate.id),
  ['case-b-last-acceptable', 'case-a-early-preferred'],
  'Case B must outrank Case A because route position is the first lexicographic key.',
);
assert.ok(
  requiredFixtureInventory.excluded.find((candidate) => candidate.id === 'case-c-outside-normal')
    ?.exclusionReasons.includes('excessive_corridor_offset'),
  'Case C must be excluded from normal results using the raw 0.21-mile offset.',
);
assert.ok(
  requiredFixtureInventory.excluded.find((candidate) => candidate.id === 'case-e-inaccessible-detour')
    ?.exclusionReasons.includes('excessive_detour'),
  'Case E must not survive routed practicality validation.',
);

const postEntryFullGpxInventory = evaluateApproachResupplyOptionsStrict({
  category: 'fuel',
  origin: strictOrigin,
  trailhead: strictEntry,
  // Deliberately pass a full GPX continuing into trail geometry. The planner
  // must trim at strictEntry before projecting candidates.
  approachRoute: [strictOrigin, strictEntry, { latitude: 1.2, longitude: 0 }],
  candidates: [routedCandidate({
    id: 'case-d-after-entry-full-gpx',
    title: 'Case D — Trail-Side GPX POI',
    coordinate: { latitude: 1.05, longitude: 0.05 / milesPerDegreeAtEquator },
    detourDurationMinutes: 2,
    detourDistanceMiles: 0.2,
  })],
});
assert.strictEqual(postEntryFullGpxInventory.ranked.length, 0);
assert.ok(
  postEntryFullGpxInventory.excluded[0].exclusionReasons.includes('after_trailhead') ||
    postEntryFullGpxInventory.excluded[0].exclusionReasons.includes('excessive_corridor_offset'),
  'Case D must be excluded after the approach is trimmed at practical entry.',
);

const mismatchedEntryGeometryInventory = evaluateApproachResupplyOptionsStrict({
  category: 'fuel',
  origin: strictOrigin,
  trailhead: strictEntry,
  approachRoute: [
    { latitude: 20, longitude: 20 },
    { latitude: 21, longitude: 20 },
  ],
  candidates: [routedCandidate({
    id: 'mismatched-entry-geometry',
    title: 'Mismatched Geometry Candidate',
    coordinate: { latitude: 20.9, longitude: 20 },
    detourDurationMinutes: 1,
    detourDistanceMiles: 0.1,
  })],
});
assert.strictEqual(mismatchedEntryGeometryInventory.ranked.length, 0);
assert.ok(
  mismatchedEntryGeometryInventory.excluded[0].exclusionReasons.includes('approach_route_unavailable'),
  'A practical entry that cannot project onto the supplied approach must fail closed instead of ranking against unrelated/full geometry.',
);

const usefulnessTieInventory = evaluateApproachResupplyOptionsStrict({
  category: 'fuel',
  origin: strictOrigin,
  trailhead: strictEntry,
  approachRoute: strictApproach,
  candidates: [
    routedCandidate({
      id: 'case-f-fuel-only',
      title: 'Case F — Fuel Only',
      coordinate: pointBeforeEntry(2, 0.05),
      detourDurationMinutes: 3,
      detourDistanceMiles: 0.3,
      categoryCoverage: ['fuel'],
    }),
    routedCandidate({
      id: 'case-f-combined',
      title: 'Case F — Fuel + Groceries/Supplies',
      coordinate: pointBeforeEntry(2, 0.05),
      detourDurationMinutes: 3,
      detourDistanceMiles: 0.3,
      categoryCoverage: ['fuel', 'food_supplies'],
    }),
    routedCandidate({
      id: 'case-f-convenience-only',
      title: 'Case F — Fuel + Convenience Supplies',
      coordinate: pointBeforeEntry(2, 0.05),
      detourDurationMinutes: 3,
      detourDistanceMiles: 0.3,
      categoryCoverage: ['fuel', 'food_supplies'],
      categoryUsefulness: 'convenience_only',
    }),
  ],
});
assert.strictEqual(usefulnessTieInventory.ranked[0].id, 'case-f-combined');
assert.deepStrictEqual(
  usefulnessTieInventory.ranked.map((candidate) => candidate.id),
  ['case-f-combined', 'case-f-fuel-only', 'case-f-convenience-only'],
  'Strong combined coverage must win the usefulness tie, while convenience-only supplies remain the weaker tier.',
);

const providerPopularityTrap = evaluateApproachResupplyOptionsStrict({
  category: 'fuel',
  origin: strictOrigin,
  trailhead: strictEntry,
  approachRoute: strictApproach,
  candidates: [
    routedCandidate({
      id: 'case-g-popular-early',
      title: 'Case G — Popular Early Stop',
      coordinate: pointBeforeEntry(15, 0.04),
      detourDurationMinutes: 1,
      detourDistanceMiles: 0.1,
      confidence: 'high',
      score: 100,
    }),
    routedCandidate({
      id: 'case-g-late-low-popularity',
      title: 'Case G — Last Valid Stop',
      coordinate: pointBeforeEntry(0.7, 0.18),
      detourDurationMinutes: 4,
      detourDistanceMiles: 0.5,
      confidence: 'low',
      score: 0,
    }),
  ],
});
assert.strictEqual(providerPopularityTrap.ranked[0].id, 'case-g-late-low-popularity');

const noOnCorridorMatch = evaluateApproachResupplyOptionsStrict({
  category: 'fuel',
  origin: strictOrigin,
  trailhead: strictEntry,
  approachRoute: strictApproach,
  candidates: [routedCandidate({
    id: 'case-h-no-normal-match',
    title: 'Case H — Wider Candidate',
    coordinate: pointBeforeEntry(0.5, 0.25),
    detourDurationMinutes: 2,
    detourDistanceMiles: 0.2,
  })],
});
assert.strictEqual(noOnCorridorMatch.ranked.length, 0);
assert.ok(noOnCorridorMatch.diagnostics[0].rejectionReason.includes('excessive_corridor_offset'));

const hundredMileEntry = { latitude: 100 / milesPerDegreeAtEquator, longitude: 0 };
const completeCoverageAnchors = buildApproachResupplySearchAnchors({
  origin: strictOrigin,
  trailhead: hundredMileEntry,
  approachRoute: [strictOrigin, hundredMileEntry],
  maxAnchors: 12,
  searchRadiusMiles: 10,
});
const completeCoverage = assessApproachResupplySearchCoverage({
  origin: strictOrigin,
  trailhead: hundredMileEntry,
  approachRoute: [strictOrigin, hundredMileEntry],
  anchors: completeCoverageAnchors,
  searchRadiusMiles: 10,
});
assert.strictEqual(completeCoverage.complete, true, 'Distance-spaced provider windows must cover a 100-mile approach without gaps.');
const underSampledCoverageAnchors = buildApproachResupplySearchAnchors({
  origin: strictOrigin,
  trailhead: hundredMileEntry,
  approachRoute: [strictOrigin, hundredMileEntry],
  maxAnchors: 4,
  searchRadiusMiles: 10,
});
assert.strictEqual(assessApproachResupplySearchCoverage({
  origin: strictOrigin,
  trailhead: hundredMileEntry,
  approachRoute: [strictOrigin, hundredMileEntry],
  anchors: underSampledCoverageAnchors,
  searchRadiusMiles: 10,
}).complete, false, 'An under-sampled provider route must report partial coverage instead of a valid empty result.');

const prioritizedRetrievals = prioritizeApproachSearchResults({
  anchors: [
    { coordinate: strictEntry, basis: 'trailhead_fallback', progressRatio: 1 },
    { coordinate: pointBeforeEntry(10, 0), basis: 'approach_corridor', progressRatio: 0.85 },
    { coordinate: pointBeforeEntry(35, 0), basis: 'approach_corridor', progressRatio: 0.5 },
  ],
  buckets: [
    Array.from({ length: 10 }, (_, index) => `entry-provider-${index + 1}`),
    ['final-approach-first'],
    ['early-popular-first', 'early-second'],
  ],
  reservedPerFinalAnchor: 10,
});
assert.ok(
  prioritizedRetrievals.slice(0, 10).includes('entry-provider-6'),
  'The provider-supported sixth result at exact entry must be retrieved before early-route popularity consumes the budget.',
);

const diagnosticRows = requiredFixtureInventory.diagnostics.map((row) => ({
  candidate: row.candidateName,
  category: row.category,
  corridorOffsetMi: row.corridorOffsetMiles == null ? null : Number(row.corridorOffsetMiles.toFixed(2)),
  routeProgress: row.routeProgress == null ? null : Number(row.routeProgress.toFixed(3)),
  milesBeforeEntry: row.milesRemainingBeforeTrailEntry == null ? null : Number(row.milesRemainingBeforeTrailEntry.toFixed(1)),
  detourMinutes: row.routedDetourMinutes,
  detourMiles: row.routedDetourMiles,
  accepted: row.accepted,
  rejectionReason: row.rejectionReason ?? '—',
  finalRank: row.finalRank ?? '—',
}));
console.table(diagnosticRows);

console.log('Trip Builder approach resupply corridor checks passed.');
