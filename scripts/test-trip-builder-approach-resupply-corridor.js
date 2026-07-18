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
  buildApproachResupplyStopPlan,
  buildApproachResupplyRerankEvidence,
  buildApproachResupplyRouteFingerprint,
  buildApproachResupplySearchAnchors,
  classifyApproachResupplyRoutePosition,
  classifyApproachResupplyProviderCoverage,
  evaluateApproachResupplyOptions,
  inferApproachRemoteEntry,
  interleaveApproachSearchResults,
  mergeApproachResupplyRouteEvidence,
  mergeApproachResupplySafetyEvidence,
  rankApproachResupplyOptions,
} = require(path.join(root, 'lib', 'tripBuilder', 'approachResupplyPlanner.ts'));

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
  anchors.some((anchor) => anchor.basis === 'approach_corridor' && anchor.progressRatio != null && anchor.progressRatio >= 0.9),
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

const fallbackFuel = rankApproachResupplyOptions({
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
assert.strictEqual(fallbackFuel[0].fallbackState, 'trailhead_only');
assert.ok(
  fallbackFuel[0].warnings.some((warning) => /Approach route unavailable/i.test(warning)),
  'Trailhead fallback ranking should be explicit when the selected-origin approach geometry is missing.',
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
  bufferedOffRouteFuel[0].warnings.some((warning) => /provider-routed detour exceeds the preferred 10-mile approach detour/i.test(warning)),
  'Fuel outside the preferred routed-detour band but inside the maximum should stay selectable with a clear fallback warning.',
);

assert.strictEqual(
  APPROACH_RESUPPLY_POLICY.preferredCorridorOffsetMiles,
  0.2,
  'The ideal geometric approach corridor should remain a centralized 0.2-mile preference.',
);
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
assert.strictEqual(idealCorridorPreference[0].id, 'ideal-corridor-earlier');
assert.ok(idealCorridorPreference[0].distanceFromApproachRouteMiles <= 0.2);
assert.ok(idealCorridorPreference[1].distanceFromApproachRouteMiles > 0.2);
assert.ok(
  idealCorridorPreference[1].warnings.some((warning) => /broader fallback/i.test(warning)),
  'A viable candidate outside the ideal 0.2-mile corridor should remain available with truthful fallback language.',
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
  broaderFallbackOnly.every((option) => option.warnings.some((warning) => /broader fallback/i.test(warning))),
  'Every broader geometric fallback should disclose that it is outside the ideal corridor.',
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
assert.strictEqual(boundaryInventory.ranked[0].id, 'before-remote-entry');
assert.ok(
  boundaryInventory.excluded.find((option) => option.id === 'behind-origin')?.exclusionReasons.includes('behind_origin'),
  'A stop behind the selected origin must not become the last fuel recommendation.',
);
assert.ok(
  boundaryInventory.excluded.find((option) => option.id === 'after-remote-entry')?.exclusionReasons.includes('after_remote_entry'),
  'A stop after the known service-loss entry must not be selected as a pre-remote stop.',
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
assert.ok(boundaryInventory.ranked[0].distanceBeforeRemoteEntryMiles > 0);

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
  earlyBoundaryInventory.excluded.find((option) => option.id === 'after-early-boundary')?.exclusionReasons.includes('after_remote_entry'),
  'A stop after a known early boundary must be excluded.',
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
  earlyBoundaryAnchors.some((anchor) => anchor.progressRatio != null && anchor.progressRatio >= 0 && anchor.progressRatio < 0.1),
  'A known early boundary must still create a provider-search anchor on its useful civilization side.',
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
  'high-integrity-forward-stop',
  'Low-confidence coordinates must not win solely because they appear slightly later on the route.',
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
  'verified-provider-detour',
  'A geometric corridor offset must not outrank provider-routed evidence solely because it projects later on the route.',
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
  'inside-custom-preferred',
  'Configured detour thresholds must control both filtering and ranking bands.',
);

const inferredBoundary = inferApproachRemoteEntry({ remotenessScore: 8 });
assert.strictEqual(inferredBoundary.source, 'remoteness_estimate');
assert.strictEqual(inferredBoundary.estimated, true);
assert.match(inferredBoundary.label, /estimated/i);

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
assert.ok(
  noRouteInventory.ranked.every((option) => option.routeEvidenceState === 'unavailable'),
  'Trailhead-only fallback must not claim route-aware detour confidence.',
);

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

console.log('Trip Builder approach resupply corridor checks passed.');
