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

const refinement = require(path.join(root, 'lib', 'explore', 'exploreRefinementFilter.ts'));
const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const filterSource = fs.readFileSync(path.join(root, 'components', 'discover', 'DistanceRadiusFilter.tsx'), 'utf8');
const helperSource = fs.readFileSync(path.join(root, 'lib', 'explore', 'exploreRefinementFilter.ts'), 'utf8');
const routeCatalogSearchCriteriaBlock = discoverSource
  .split('const routeCatalogSearchCriteria = useMemo')[1]
  ?.split('useEffect(() => {')[0] ?? '';
const guidanceReadyInventoryBlock = discoverSource
  .split('const exploreGuidanceReadyInventory = useMemo')[1]
  ?.split('const exploreWizardCandidateSet')[0] ?? '';
const aiFetchBlock = discoverSource
  .split('const handleFetchAIRoutes = useCallback')[1]
  ?.split('// ── Phase 17: Auto-fetch AI routes on tab/radius change')[0] ?? '';

function route(id, overrides = {}) {
  return {
    id,
    name: id,
    remotenessScore: 5,
    popularityScore: 50,
    estimatedDays: 1,
    estimatedHours: 8,
    distanceMiles: 34,
    distanceToNearestTownMiles: 6,
    requiresCamping: false,
    ...overrides,
  };
}

const routes = [
  route('local-day', { remotenessScore: 4, popularityScore: 70, estimatedHours: 8, estimatedDays: 1, distanceToNearestTownMiles: 4 }),
  route('remote-day', { remotenessScore: 8, popularityScore: 25, estimatedHours: 10, estimatedDays: 1, distanceToNearestTownMiles: 18 }),
  route('weekend', { remotenessScore: 6, popularityScore: 35, estimatedHours: 20, estimatedDays: 2, distanceToNearestTownMiles: 10 }),
  route('expedition', { remotenessScore: 9, popularityScore: 20, estimatedHours: 60, estimatedDays: 4, distanceToNearestTownMiles: 25 }),
  route('unknown-duration', { remotenessScore: 3, popularityScore: 80, estimatedDays: undefined, estimatedHours: undefined, distanceToNearestTownMiles: 3 }),
];

assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, null).map((item) => item.id),
  routes.map((item) => item.id),
  'No refinement should preserve the current radius-filtered result set.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, 'remoteness').map((item) => item.id),
  ['expedition', 'remote-day'],
  'Remoteness should narrow the current dataset to remote trails and rank them by remoteness.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, 'dayTrip').map((item) => item.id),
  ['local-day', 'remote-day'],
  'Day Trip should include trails that can be completed within 12 hours and do not require camping.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, 'weekendTrip').map((item) => item.id),
  ['weekend'],
  'Weekend Trip should include trails that split into two field days.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, 'expedition').map((item) => item.id),
  ['expedition'],
  'Expedition should include trails that need three or more field days.',
);

assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter([
    route('far-from-town-low-score', { remotenessScore: 4, distanceToNearestTownMiles: 18 }),
    route('near-town-high-score', { remotenessScore: 9, distanceToNearestTownMiles: 3 }),
    route('paved-road-remote', { remotenessScore: 3, distanceToNearestTownMiles: 7, nearestPavedRoadDistanceMiles: 9 }),
  ], 'remoteness').map((item) => item.id),
  ['far-from-town-low-score', 'paved-road-remote'],
  'Remoteness should mean real isolation from towns/services or paved access, with score fallback only when distance facts are missing.',
);

assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter([
    route('short-overnight', { estimatedHours: 10, estimatedDays: 1, requiresCamping: true, description: 'Overnight camp required.' }),
  ], 'dayTrip').map((item) => item.id),
  [],
  'Day Trip should reject short routes when camping or overnight travel is required.',
);

const counts = refinement.getExploreRefinementCounts(routes);
assert.strictEqual(counts.remoteness, 2, 'Remoteness count should reflect only remote matches in the current radius.');
assert.strictEqual(counts.dayTrip, 2, 'Day Trip count should be computed from current results.');
assert.strictEqual(counts.weekendTrip, 1, 'Weekend Trip count should be computed from current results.');
assert.strictEqual(counts.expedition, 1, 'Expedition count should be computed from current results.');

const unknownDurationRoutes = [
  route('imported-gpx-one', { estimatedDays: undefined, estimatedHours: undefined, description: 'Imported trail missing duration metadata.' }),
  route('imported-gpx-two', { estimatedDays: undefined, estimatedHours: undefined, description: 'Saved route without trip length.' }),
];
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(unknownDurationRoutes, 'dayTrip').map((item) => item.id),
  [],
  'Trip-type filters should not inflate a selected bucket with routes missing duration metadata.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter([
    route('hinted-weekend', { estimatedDays: undefined, estimatedHours: undefined, description: 'Weekend overnight route.' }),
  ], 'weekendTrip').map((item) => item.id),
  ['hinted-weekend'],
  'Trip-type filters should use text/category hints when duration metadata is unavailable.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter([
    route('hinted-day', { estimatedDays: undefined, estimatedHours: undefined, description: 'Short same day trail run under 10 hours.' }),
  ], 'dayTrip').map((item) => item.id),
  ['hinted-day'],
  'Day Trip should still honor explicit same-day text hints when structured duration is unavailable.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter([
    route('long-distance-expedition', { estimatedDays: undefined, estimatedHours: undefined, distanceMiles: 180, description: 'Long desert route.' }),
  ], 'expedition').map((item) => item.id),
  ['long-distance-expedition'],
  'Expedition should include high-mileage routes when duration metadata is unavailable.',
);

assert.ok(
  discoverSource.includes('const [exploreRefinement, setExploreRefinement] = useState<ExploreRefinementFilter | null>(null);') &&
    discoverSource.includes('loadExploreFilterStateSnapshot'),
  'Explore should keep a single selected refinement state but start with no active refinement selected.',
);
assert.ok(
  discoverSource.includes('setDistanceRadius(snapshot.radiusMiles)') &&
    discoverSource.includes('setExploreRefinement(null)') &&
    !discoverSource.includes('setExploreRefinement(snapshot.refinement)'),
  'Explore should hydrate the saved range while clearing any saved refinement on tab entry.',
);
assert.ok(
  discoverSource.includes('applyExploreRefinementFilter(canonicalRadiusFilteredRoutes, exploreRefinement)'),
  'Explore should apply refinements after radius and deduped eligibility filters.',
);
assert.ok(
  discoverSource.includes('selectedRefinement={exploreRefinement}'),
  'The filter panel should receive the active refinement.',
);
assert.ok(
  discoverSource.includes('showRefinementEmptyState'),
  'Explore should expose a clear zero-result refinement state.',
);
assert.ok(
  discoverSource.includes('const radiusFilteredAIRoutes = useMemo<AIGeneratedRoute[]>') &&
    discoverSource.includes('() => filterByRadius(aiRoutes, activeDistanceRadius) as AIGeneratedRoute[]') &&
    discoverSource.includes('applyExploreRefinementFilter(radiusFilteredAIRoutes, exploreRefinement)'),
  'ECS Route Ideas should respect the selected radius before applying refinement filters.',
);
assert.ok(
  discoverSource.includes('const publicRefinedTrailPacks = useMemo') &&
    discoverSource.includes('applyExploreRefinementFilter(publicDiscoverableTrailPackRoutes, exploreRefinement)') &&
    discoverSource.includes('buildExploreGuidanceReadyInventory({') &&
    discoverSource.includes('trailPacks: exploreWizardTrailPackSourceRoutes') &&
    discoverSource.includes('hiddenGemRoutes: exploreWizardRangeOnlyHiddenGemSourceRoutes') &&
    discoverSource.includes('ecsRouteIdeas: exploreWizardEcsIdeaSourceRoutes') &&
    discoverSource.includes('selectedRefinement: exploreRefinement') &&
    discoverSource.includes('const radiusFilteredExploreWizardFavoriteRoutes = useMemo') &&
    discoverSource.includes('radiusFilteredExploreWizardSavedBuiltRoutes') &&
    discoverSource.includes('radiusFilteredExploreWizardImportedStitchedRoutes') &&
    !guidanceReadyInventoryBlock.includes('hiddenGemExploreOrchestration') &&
    !guidanceReadyInventoryBlock.includes('filteredFavoriteTrails') &&
    !discoverSource.includes('ecsRouteIdeas: visibleAIRoutes'),
  'Explore TripBuilder guidance candidates should use range-only ready-route pools instead of active-refinement or page-sized visible route pools.',
);
assert.ok(
  !discoverSource.includes('routeCatalogRefinementCriteria') &&
    !routeCatalogSearchCriteriaBlock.includes('exploreRefinement') &&
    !routeCatalogSearchCriteriaBlock.includes('minRemotenessScore') &&
    !routeCatalogSearchCriteriaBlock.includes('maxDurationMinutes') &&
    !routeCatalogSearchCriteriaBlock.includes('minDurationMinutes'),
  'Changing Explore refinements should stay local and must not trigger a live route-catalog refetch.',
);
assert.ok(
  aiFetchBlock.includes('canonicalRadiusFilteredRoutes.map((route) => route.name)') &&
    !aiFetchBlock.includes('refinedCanonicalRoutes'),
  'Changing Explore refinements should not refresh ECS Route Ideas from a different source universe.',
);
assert.ok(
  discoverSource.includes('const hasSelectedExploreRefinement = exploreRefinement != null') &&
    discoverSource.includes('if (!hasSelectedExploreRefinement) return []') &&
    discoverSource.includes('showGuidanceReadyRefinementPrompt') &&
    discoverSource.includes('Select a refinement bucket to populate Guidance Ready route cards.'),
  'Explore should show range refinement counts first and keep Guidance Ready route cards empty until a refinement is selected.',
);
assert.ok(
  discoverSource.includes('const [aiRouteIdeaPageIndex, setAiRouteIdeaPageIndex] = useState(0);') &&
    discoverSource.includes('setAiRouteIdeaPageIndex(0);'),
  'Changing Explore filters should reset ECS Route Ideas pagination.',
);
assert.ok(
  discoverSource.includes('actionLabel="Clear Refinement"'),
  'Zero-result refinement state should provide one-tap clearing.',
);
assert.ok(
  !discoverSource.includes('<Text style={s.generateAIBtnTitle}>GET ECS ROUTE IDEAS</Text>'),
  'ECS Route Ideas should appear automatically without the redundant Get ECS Route Ideas CTA.',
);
assert.ok(
  filterSource.includes('label="Filters"'),
  'The distance radius container should present as a general Filters panel.',
);
assert.ok(
  filterSource.includes('contentStyle={s.filterContentSurface}') &&
    filterSource.includes('backgroundColor: `${TACTICAL.amber}12`') &&
    filterSource.includes('borderColor: `${TACTICAL.amber}2E`') &&
    filterSource.includes('color: TACTICAL.goldMedium') &&
    filterSource.includes('segmentActive') &&
    filterSource.includes("TACTICAL.amber + '14'"),
  'The Explorer Filters panel should match the Fleet readiness command gold translucent surface while preserving active amber chips.',
);
assert.ok(
  helperSource.includes('Remoteness') &&
    helperSource.includes('Day Trip') &&
    helperSource.includes('Weekend Trip') &&
    helperSource.includes('Expedition') &&
    filterSource.includes('EXPLORE_REFINEMENT_OPTIONS.map'),
  'The filter panel should render all four refinement labels.',
);
assert.ok(
  filterSource.includes('onChangeRefinement(isActive ? null : option.key)'),
  'Selecting a different refinement should replace the previous one and active chips should clear.',
);

console.log('Explore refinement filter checks passed.');
