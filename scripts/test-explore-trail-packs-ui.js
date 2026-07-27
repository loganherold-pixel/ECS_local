const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const card = read(path.join('components', 'discover', 'RouteCatalogSummaryCard.tsx'));
const trailCard = read(path.join('components', 'discover', 'ExploreTrailRouteCard.tsx'));
const feedbackPanel = read(path.join('components', 'trailPacks', 'TrailPackFeedbackPanel.tsx'));
const previewPanel = read(path.join('components', 'trailPacks', 'TrailPackPreviewModal.tsx'));
const offlinePrepPack = read(path.join('app', 'explore-offline-prep-pack.tsx'));
const tripBuilder = read(path.join('app', 'explore-trip-builder.tsx'));
const domain = read(path.join('lib', 'explore', 'trailPacks.ts'));
const selectedRouteDetail = read(path.join('lib', 'explore', 'exploreTripBuilderRouteDetail.ts'));

assert(
  discover.includes('ExploreTrailRouteCard') &&
    !discover.includes('testID="explore-tripbuilder-wizard-surface"') &&
    discover.includes('buildExploreGuidanceReadyInventory') &&
    discover.includes('exploreGuidanceReadyInventory.discoverableCandidateSet') &&
    discover.includes('visibleExploreWizardCardCandidates') &&
    !discover.includes('exploreWizardHiddenNotice') &&
    !discover.includes('ECS will not save, stitch, or navigate those routes from Explore'),
  'Explore should render normalized trail discovery candidates without mounting a Trip Builder hero or hidden unavailable-route warnings',
);
assert(
  discover.includes('EXPLORE_WIZARD_SOURCE_FILTERS') &&
    discover.includes("label: 'Trail Packs'") &&
    discover.includes("label: 'Hidden Gems'") &&
    discover.includes("label: 'ECS Ideas'") &&
    discover.includes("label: 'Saved Trails'") &&
    discover.includes("label: 'Imported Trails'"),
  'Explore should expose basic source chips for Trail Packs, Hidden Gems, ECS Ideas, saved trails, and imported trails',
);
assert(
  discover.includes('handleSaveExploreWizardCandidate') &&
    discover.includes('handleStartExploreWizardCandidate') &&
    discover.includes('autoStartNavigation: true') &&
    discover.includes('handlePrepareOfflineExploreWizardCandidate') &&
    trailCard.includes('onPrepareOffline') &&
    trailCard.includes('OFFLINE') &&
    !trailCard.includes('BUILD TRIP'),
  'Explore trail cards should wire Save, Start, and offline download without Trip Builder actions',
);
assert(
  discover.includes("import RouteCatalogSummaryCard from '../../components/discover/RouteCatalogSummaryCard'"),
  'Explore should render catalog routes through the lightweight summary card component',
);
assert(
  discover.includes("'trailPacks'"),
  'Explore category panel keys should include Trail Packs',
);
assert(
  discover.includes("label: 'Trail Packs'") && discover.includes("description: 'ECS-native route packs"),
  'Trail Packs should appear as a dedicated Explore category tile',
);
assert(
  discover.includes('case \'trailPacks\'') && discover.includes('<RouteCatalogSummaryCard'),
  'Trail Packs should render summary-first records in their own category panel',
);
assert(
  discover.includes('queryTrailPackDiscoveryIndexCached(routeDiscoveryIndex') &&
    discover.includes('const trailPackDiscoveryRadius = activeDistanceRadius;') &&
    discover.includes('radiusMiles: trailPackDiscoveryRadius'),
  'Trail Packs should use the selected Explore radius',
);
assert(
    discover.includes('liveTrailPackCatalogStore') &&
    discover.includes('liveTrailPackCatalogSnapshot.trailPacks') &&
    discover.includes('routeCatalogSearchCriteria') &&
    discover.includes('refreshLiveTrailPackCatalog(routeCatalogSearchCriteria, {') &&
    discover.includes("cancellationReason: 'unmount'") &&
    discover.includes('limit: EXPLORE_ROUTE_CATALOG_REQUEST_LIMIT') &&
    discover.includes('includePreviewGeometry: false') &&
    !discover.includes('routeCatalogPreviewGeometryRequested') &&
    !discover.includes('routeCatalogRefinementCriteria') &&
    discover.includes('applyExploreRefinementFilter(publicDiscoverableTrailPackRoutes, exploreRefinement)') &&
    discover.includes('availableFuelRangeMiles: vehicleProfile?.fuel_range_miles') &&
    discover.includes('availableWaterCapacityGallons: vehicleProfile?.water_capacity_gal') &&
    !discover.includes('getDefaultECSTrailPacks'),
  'Explore Trail Packs should request live reviewed summary content, then apply refinement locally without list-time detail geometry',
);
assert(
  discover.includes('const explorePerformanceRunRef = useRef(explorePerformanceRun);') &&
    discover.includes('explorePerformanceRunRef.current = explorePerformanceRun;') &&
    discover.includes('const routeCatalogPerformanceRun = explorePerformanceRunRef.current;') &&
    discover.includes("recordExplorePerformancePhase(routeCatalogPerformanceRun, 'route_catalog_query'") &&
    discover.includes('recordExplorePerformanceCount(routeCatalogPerformanceRun, {') &&
    !discover.includes('}, [explorePerformanceRun, routeCatalogHasSearchArea, routeCatalogSearchCriteria]);'),
  'Changing Explore refinement buckets should not retrigger the live route catalog refresh or erase the loaded radius catalog.',
);
assert(
  discover.includes('DEFAULT_USER_LOCATION') &&
    discover.includes('useThrottledGPS') &&
    discover.includes('routeCatalogHasSearchArea') &&
    discover.includes("'search_area_required'"),
  'Explore should retain the default-location fallback for legacy discovery while requiring GPS or an internal search area for source-backed recommendations',
);
assert(
  discover.includes('setTrailPackPageIndex(0);') &&
    discover.includes('trailPackFeedbackReviewStates') &&
    discover.includes('reviewStatesByTrailPackId: trailPackFeedbackReviewStates'),
  'Radius or location changes should refresh Trail Pack results and pagination',
);
assert(
  discover.includes('trailPackToExpeditionOpportunity') && discover.includes('handleStartTrailPackGuidance'),
  'Approved Trail Packs should stage into the existing Navigate handoff path',
);
assert(
  discover.includes('trailPackToOfflinePrepCatalogInput') &&
    discover.includes('handleCacheTrailPackOffline') &&
    discover.includes("mode: 'trail_download'") &&
    discover.includes("}, 'route_details')") &&
    discover.includes("pathname: '/explore-offline-prep-pack'"),
  'Trail Pack cache action should persist a route-only offline handoff and open Offline Trails',
);
assert(
  previewPanel.includes('disabled={!canStart}') &&
    previewPanel.includes('Route geometry is unavailable for this Trail Pack.'),
  'Trail Pack preview should guard Start Guidance when geometry is missing',
);
assert(
  discover.includes('TrailPackPreviewModal') &&
    discover.includes('submitTrailPackFeedback') &&
    discover.includes("handleTrailPackFeedback(trailPackPreview.id, 'saved')") &&
    !card.includes('handleTrailPackFeedback'),
  'Selected Trail Pack detail/save flows should capture structured feedback without adding list-time card work',
);
assert(
  selectedRouteDetail.includes('sourceVersion,') &&
    selectedRouteDetail.includes('(options.fetchDetail ?? fetchRouteCatalogTrailPackDetail)(trailPackId, {') &&
    discover.includes('routeCatalogSourceVersion: trailPack.updatedAt ?? null') &&
    !discover.includes('sourceVersion: summary.updatedAt'),
  'Explore list rendering should avoid summary detail reads while the shared selected-route adapter keeps route plus source-version cache identity.',
);
assert(
  tripBuilder.includes('testID="trip-builder-route-preparation-state"') &&
    tripBuilder.includes("title: 'Route Preparation Unavailable'") &&
    tripBuilder.includes('retryLabel="Retry Route Preparation"') &&
    selectedRouteDetail.includes("| 'ROUTE_CATALOG_DETAIL_UNAVAILABLE'") &&
    selectedRouteDetail.includes('safeErrorCode: failureCode(error)') &&
    selectedRouteDetail.includes('route: selectedSummary'),
  'Selected summary detail failures should preserve the summary and reach a retryable, visible Trip Builder terminal state.',
);
assert(
  previewPanel.includes('TrailPackFeedbackPanel') &&
    previewPanel.includes('MapRenderer') &&
    previewPanel.includes('cameraMode="route_overview"') &&
    previewPanel.includes('surfaceMode="compact"') &&
    previewPanel.includes('Offline cache unavailable for this Trail Pack.'),
  'Trail Pack preview should contain a route map snapshot, feedback controls, and disabled offline cache language',
);
assert(
  discover.includes('Scanning approved ECS Trail Packs within selected radius…') &&
    discover.includes('Trail Packs need GPS or an approved search area to filter verified routes by radius.') &&
    discover.includes('Only lower-confidence Trail Packs were found nearby. Expand your radius or enable broader results.') &&
    discover.includes('No live reviewed Trail Packs found within this radius.') &&
    discover.includes('Live Trail Packs are temporarily unavailable. No seed or mock Trail Packs are shown here.'),
  'Trail Packs should render loading, no-location, low-confidence, and empty states',
);
assert(
  discover.includes('remain blocked from discovery by access, moderation, source, condition, vehicle, identity, invalid-data, or supported-format requirements') &&
    discover.includes('testID="explore-route-catalog-not-guidance-ready-state"') &&
    discover.includes('trailPackSubmissionStore') &&
    discover.includes('includeOwnDrafts: ownerTrailPackIds.length > 0'),
  'Pending and curation Trail Packs should remain local/review-only with explicit non-public language',
);
const hiddenGemPanelCase = discover.split("case 'hiddenGems':")[1]?.split("case 'trailPacks':")[0] ?? '';
assert(
  !/trailPack/i.test(hiddenGemPanelCase),
  'Trail Packs should not be mixed into Hidden Gems logic',
);
assert(
  card.includes('SourceTruthInspectorTrigger') &&
    card.includes('ROUTE SUMMARY') &&
    card.includes('DOWNLOAD OFFLINE') &&
    !card.includes('PREVIEW') &&
    !card.includes('NAVIGATE') &&
    !card.includes('bookmark-outline'),
  'Route catalog summary cards should show source truth plus one summary-first offline action',
);
assert(
  card.includes('onPrepareOffline(summary.routeId)') &&
    card.includes('offlineDisabledReason') &&
    card.includes('accessibilityState={{ disabled: !!offlineDisabledReason }}') &&
    !card.includes('MapRenderer'),
  'Summary cards should defer geometry/detail loading until download, expose typed disabled reasons, and avoid mounting map work in the Explore list',
);
assert(
  previewPanel.includes('getTrailPackGuidanceReadiness') &&
    previewPanel.includes('GUIDANCE STATUS') &&
    previewPanel.includes('ROUTE ASSESSMENT') &&
    previewPanel.includes('CURRENT CONDITION') &&
    previewPanel.includes('WHAT TO WATCH') &&
    previewPanel.includes('RECOMMENDED ACTION') &&
    previewPanel.includes('OFFLINE CACHE') &&
    previewPanel.includes('detailLoading') &&
    previewPanel.includes('detailError') &&
    previewPanel.includes('guidanceReadiness.label') &&
    previewPanel.includes('guidanceReadiness.description'),
  'Trail Pack preview details should expose active-guidance readiness, route assessment, current-condition overlays, offline cache metadata, and preview-only reasons',
);
assert(
  !previewPanel.includes('detailDataUsed') &&
    previewPanel.includes('offlineCache?.sourceTimestamps') &&
    previewPanel.includes('offlineCache?.sourceAttribution') &&
    previewPanel.includes('offlineCache?.freshnessWarnings') &&
    previewPanel.includes('SOURCE TIMESTAMP') &&
    previewPanel.includes('ATTRIBUTION') &&
    previewPanel.includes('FRESHNESS WARNING'),
  'Trail Pack preview offline cache section should visibly expose server-provided source timestamps, attribution, and freshness warnings',
);
assert(
  offlinePrepPack.includes('routeCatalogSourceRows') &&
    offlinePrepPack.includes('routeCatalogAttributionRows') &&
    offlinePrepPack.includes('routeCatalogFreshnessWarnings') &&
    offlinePrepPack.includes('routeCatalogOfflineCache') &&
    offlinePrepPack.includes('routeCatalogCurrentCondition') &&
    offlinePrepPack.includes('Route Catalog Source Check') &&
    offlinePrepPack.includes('CURRENT CONDITION') &&
    offlinePrepPack.includes('testID="offline-prep-route-catalog-source-check"') &&
    offlinePrepPack.includes('testID="offline-prep-route-catalog-current-condition"') &&
    offlinePrepPack.includes('testID="offline-prep-route-catalog-freshness-warning"'),
  'Offline Prep Pack should show route-catalog cacheability, source timestamps, attribution, current-condition posture, and freshness warnings before preparing a pack',
);
assert(
  feedbackPanel.includes('COMPLETED') &&
    feedbackPanel.includes('RECOMMEND') &&
    feedbackPanel.includes('REPORT ISSUE') &&
    feedbackPanel.includes('Blocked route') &&
    feedbackPanel.includes('Private land'),
  'Trail Pack detail feedback should expose compact operational controls and quick issue reasons',
);
assert(
  !feedbackPanel.includes('comment thread') &&
    !feedbackPanel.includes('public comments'),
  'Trail Pack feedback should avoid noisy public social-comment behavior',
);
assert(
  domain.includes("'partner_source'") &&
    domain.includes("dataState: 'fixture'") &&
    domain.includes("reviewStatus: 'draft'") &&
    !/source:\s*'partner_source'[\s\S]{0,220}reviewStatus:\s*'approved'/.test(domain),
  'Partner source and default Trail Pack seeds should remain fixture scaffolding only',
);

console.log('Explore Trail Pack UI checks passed');
